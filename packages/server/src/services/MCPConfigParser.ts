import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MCPDiscoveryConfig, MCPConfigEndpoint, MCPServer } from '@olympian/shared';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas for MCP configuration
const configEndpointSchema = z.object({
  url: z.string().url(),
  type: z.enum(['server', 'discovery_channel', 'registry']).optional().default('server'),
  auth: z.string().optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional()
});

const mcpConfigSchema = z.object({
  mcpServers: z.record(configEndpointSchema),
  wellKnownPaths: z.array(z.string()).optional(),
  registryUrls: z.array(z.string()).optional(),
  cacheTtl: z.number().optional()
});

// Type helpers for safe data access
interface DiscoveryResponseData {
  servers?: Array<{
    name?: string;
    url: string;
  }>;
}

interface RegistryResponseData {
  servers?: Array<{
    name?: string;
    url: string;
  }>;
}

/**
 * MCP Configuration Parser following best practices from guidelines
 * 
 * Handles:
 * 1. Configuration extraction from mcp-config.json files
 * 2. Endpoint discovery and validation
 * 3. Well-known path resolution (.well-known/mcp)
 * 4. Registry integration for server discovery
 */
export class MCPConfigParser {
  private static instance: MCPConfigParser;
  private configPaths: string[];
  private discoveryConfig: MCPDiscoveryConfig | null = null;
  private lastParsed: Date | null = null;

  private constructor() {
    // Standard MCP configuration paths following conventions
    this.configPaths = [
      path.join(os.homedir(), '.config', 'mcp', 'config.json'),
      path.join(os.homedir(), '.mcp', 'config.json'),
      path.join(os.homedir(), '.olympian-ai-lite', 'mcp_config.json'),
      path.join(process.cwd(), 'mcp-config.json'),
      path.join(process.cwd(), '.mcp-config.json'),
    ];
  }

  static getInstance(): MCPConfigParser {
    if (!MCPConfigParser.instance) {
      MCPConfigParser.instance = new MCPConfigParser();
    }
    return MCPConfigParser.instance;
  }

  /**
   * Parse MCP configuration files from standard locations
   * Following guideline: "extract from the mcp config file the different connection endpoints"
   */
  async parseConfiguration(): Promise<MCPDiscoveryConfig> {
    logger.info('🔍 [MCP Config] Parsing MCP configuration files...');

    let foundConfig: MCPDiscoveryConfig | null = null;

    // Try each configuration path
    for (const configPath of this.configPaths) {
      try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const rawConfig = JSON.parse(configData);
        
        // Validate configuration
        const validatedConfig = mcpConfigSchema.parse(rawConfig);
        
        // Convert to internal format
        foundConfig = await this.convertToDiscoveryConfig(validatedConfig, configPath);
        
        logger.info(`✅ [MCP Config] Loaded configuration from: ${configPath}`);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(`⚠️ [MCP Config] Failed to parse config at ${configPath}:`, error);
        }
      }
    }

    // If no config found, create default
    if (!foundConfig) {
      logger.info('📝 [MCP Config] No configuration found, using defaults');
      foundConfig = this.createDefaultConfig();
    }

    // Discover additional endpoints
    foundConfig = await this.enhanceWithDiscovery(foundConfig);

    this.discoveryConfig = foundConfig;
    this.lastParsed = new Date();

    logger.info(`🎯 [MCP Config] Configuration parsed: ${Object.keys(foundConfig.mcpServers).length} endpoints found`);
    return foundConfig;
  }

  /**
   * Convert external configuration format to internal discovery config
   */
  private async convertToDiscoveryConfig(
    config: z.infer<typeof mcpConfigSchema>, 
    configPath: string
  ): Promise<MCPDiscoveryConfig> {
    const mcpServers: Record<string, MCPConfigEndpoint> = {};

    for (const [name, endpoint] of Object.entries(config.mcpServers)) {
      mcpServers[name] = {
        url: endpoint.url,
        type: endpoint.type || 'server',
        authentication: endpoint.auth ? this.parseAuthentication(endpoint.auth) : undefined,
        headers: endpoint.headers,
        timeout: endpoint.timeout || 30000,
        retries: endpoint.retries || 3
      };
    }

    return {
      mcpServers,
      wellKnownPaths: config.wellKnownPaths || [
        '/.well-known/mcp',
        '/.well-known/model-context-protocol'
      ],
      registryUrls: config.registryUrls || [
        'https://registry.modelcontextprotocol.io',
        'https://mcp-registry.anthropic.com'
      ],
      cacheTtl: config.cacheTtl || 300000 // 5 minutes
    };
  }

  /**
   * Parse authentication configuration
   */
  private parseAuthentication(auth: string): MCPConfigEndpoint['authentication'] {
    if (auth.startsWith('Bearer ')) {
      return {
        type: 'bearer',
        token: auth.substring(7)
      };
    } else if (auth.startsWith('ApiKey ')) {
      return {
        type: 'api_key',
        apiKey: auth.substring(7)
      };
    } else {
      return {
        type: 'bearer',
        token: auth
      };
    }
  }

  /**
   * Create default configuration when none found
   */
  private createDefaultConfig(): MCPDiscoveryConfig {
    return {
      mcpServers: {},
      wellKnownPaths: [
        '/.well-known/mcp',
        '/.well-known/model-context-protocol'
      ],
      registryUrls: [
        'https://registry.modelcontextprotocol.io'
      ],
      cacheTtl: 300000
    };
  }

  /**
   * Enhance configuration with discovery mechanisms
   * Following guideline: "discover additional endpoints from registries"
   */
  private async enhanceWithDiscovery(config: MCPDiscoveryConfig): Promise<MCPDiscoveryConfig> {
    logger.info('🔍 [MCP Config] Enhancing configuration with discovery...');

    // Discover from well-known paths
    await this.discoverFromWellKnownPaths(config);

    // Discover from registries
    await this.discoverFromRegistries(config);

    return config;
  }

  /**
   * Discover MCP servers from well-known paths
   */
  private async discoverFromWellKnownPaths(config: MCPDiscoveryConfig): Promise<void> {
    logger.debug('🔍 [MCP Config] Checking well-known paths for MCP servers...');

    const baseUrls = Object.values(config.mcpServers)
      .filter(endpoint => endpoint.type === 'discovery_channel')
      .map(endpoint => new URL(endpoint.url).origin);

    for (const baseUrl of baseUrls) {
      for (const wellKnownPath of config.wellKnownPaths || []) {
        try {
          const discoveryUrl = new URL(wellKnownPath, baseUrl).href;
          const discovered = await this.fetchDiscoveryEndpoint(discoveryUrl);
          
          if (discovered && discovered.length > 0) {
            logger.info(`✅ [MCP Config] Discovered ${discovered.length} servers from ${discoveryUrl}`);
            
            for (const server of discovered) {
              const serverName = `discovered_${server.name || Math.random().toString(36).substr(2, 9)}`;
              config.mcpServers[serverName] = {
                url: server.url,
                type: 'server',
                timeout: 30000,
                retries: 3
              };
            }
          }
        } catch (error) {
          logger.debug(`⚠️ [MCP Config] Failed to discover from ${baseUrl}${wellKnownPath}:`, error);
        }
      }
    }
  }

  /**
   * Discover MCP servers from registries
   */
  private async discoverFromRegistries(config: MCPDiscoveryConfig): Promise<void> {
    logger.debug('🔍 [MCP Config] Checking registries for MCP servers...');

    for (const registryUrl of config.registryUrls || []) {
      try {
        const discovered = await this.fetchRegistryServers(registryUrl);
        
        if (discovered && discovered.length > 0) {
          logger.info(`✅ [MCP Config] Discovered ${discovered.length} servers from registry ${registryUrl}`);
          
          for (const server of discovered) {
            const serverName = `registry_${server.name || Math.random().toString(36).substr(2, 9)}`;
            config.mcpServers[serverName] = {
              url: server.url,
              type: 'server',
              timeout: 30000,
              retries: 3
            };
          }
        }
      } catch (error) {
        logger.debug(`⚠️ [MCP Config] Failed to discover from registry ${registryUrl}:`, error);
      }
    }
  }

  /**
   * Fetch servers from discovery endpoint
   */
  private async fetchDiscoveryEndpoint(url: string): Promise<Array<{ name?: string; url: string }>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Olympian-AI-MCP-Client/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as unknown;
      
      // Type-safe data access
      if (this.isDiscoveryResponseData(data) && Array.isArray(data.servers)) {
        return data.servers;
      }
      
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch servers from registry
   */
  private async fetchRegistryServers(registryUrl: string): Promise<Array<{ name?: string; url: string }>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`${registryUrl}/api/servers`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Olympian-AI-MCP-Client/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as unknown;
      
      // Type-safe data access
      if (this.isRegistryResponseData(data) && Array.isArray(data.servers)) {
        return data.servers;
      }
      
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Type guard for discovery response data
   */
  private isDiscoveryResponseData(data: unknown): data is DiscoveryResponseData {
    return typeof data === 'object' && data !== null && 'servers' in data;
  }

  /**
   * Type guard for registry response data
   */
  private isRegistryResponseData(data: unknown): data is RegistryResponseData {
    return typeof data === 'object' && data !== null && 'servers' in data;
  }

  /**
   * Convert discovery config to MCPServer instances
   */
  async createServersFromConfig(): Promise<MCPServer[]> {
    if (!this.discoveryConfig) {
      await this.parseConfiguration();
    }

    const servers: MCPServer[] = [];

    for (const [name, endpoint] of Object.entries(this.discoveryConfig!.mcpServers)) {
      if (endpoint.type === 'server') {
        const server: MCPServer = {
          id: `config_${name}_${Date.now()}`,
          name,
          command: '', // Will be set based on transport type
          transport: this.determineTransport(endpoint.url),
          endpoint: endpoint.url,
          status: 'stopped',
          healthCheckInterval: 300000,
          maxRetries: endpoint.retries || 3,
          timeout: endpoint.timeout || 30000,
          priority: 0
        };

        servers.push(server);
      }
    }

    logger.info(`📊 [MCP Config] Created ${servers.length} server configurations`);
    return servers;
  }

  /**
   * Determine transport type from URL
   */
  private determineTransport(url: string): MCPServer['transport'] {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return 'streamable_http';
      } else if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
        return 'sse';
      } else {
        return 'stdio';
      }
    } catch {
      return 'stdio';
    }
  }

  /**
   * Get current discovery configuration
   */
  getDiscoveryConfig(): MCPDiscoveryConfig | null {
    return this.discoveryConfig;
  }

  /**
   * Check if configuration needs refresh
   */
  needsRefresh(maxAge: number = 3600000): boolean { // 1 hour default
    if (!this.lastParsed) return true;
    return Date.now() - this.lastParsed.getTime() > maxAge;
  }

  /**
   * Refresh configuration if needed
   */
  async refreshIfNeeded(maxAge?: number): Promise<MCPDiscoveryConfig> {
    if (this.needsRefresh(maxAge)) {
      logger.info('🔄 [MCP Config] Configuration refresh needed, re-parsing...');
      return await this.parseConfiguration();
    }
    return this.discoveryConfig!;
  }

  /**
   * Validate endpoint URL for basic reachability
   */
  async validateEndpoint(endpoint: MCPConfigEndpoint): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout || 5000);

      const response = await fetch(endpoint.url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          ...endpoint.headers,
          'User-Agent': 'Olympian-AI-MCP-Client/1.0'
        }
      });

      clearTimeout(timeoutId);
      return response.ok || response.status === 405; // 405 Method Not Allowed is acceptable
    } catch (error) {
      logger.debug(`⚠️ [MCP Config] Endpoint validation failed for ${endpoint.url}:`, error);
      return false;
    }
  }

  /**
   * Get statistics about parsed configuration
   */
  getConfigurationStats(): {
    totalEndpoints: number;
    serverEndpoints: number;
    discoveryChannels: number;
    registries: number;
    lastParsed: Date | null;
  } {
    if (!this.discoveryConfig) {
      return {
        totalEndpoints: 0,
        serverEndpoints: 0,
        discoveryChannels: 0,
        registries: 0,
        lastParsed: null
      };
    }

    const endpoints = Object.values(this.discoveryConfig.mcpServers);
    return {
      totalEndpoints: endpoints.length,
      serverEndpoints: endpoints.filter(e => e.type === 'server').length,
      discoveryChannels: endpoints.filter(e => e.type === 'discovery_channel').length,
      registries: endpoints.filter(e => e.type === 'registry').length,
      lastParsed: this.lastParsed
    };
  }
}
