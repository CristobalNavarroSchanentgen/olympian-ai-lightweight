import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MCPDiscoveryConfig, MCPConfigEndpoint, MCPServer } from '@olympian/shared';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas for MCP configuration (HTTP-only in multihost mode)
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
 * Legacy HTTP-based MCP Configuration Parser - DEPRECATED FOR SUBPROJECT 3
 * 
 * ⚠️  WARNING: This HTTP transport implementation is NOT compatible with subproject 3
 * ⚠️  Subproject 3 MUST use MCPConfigParserStdio with npx subprocess execution
 * 
 * This legacy implementation is maintained only for subprojects 1 & 2 compatibility.
 * The new architecture requires:
 * 1. No HTTP/SSE transport or container-based servers
 * 2. Use npx to launch MCP servers as child processes  
 * 3. Stdio transport only
 * 4. Self-contained execution within main container
 * 
 * For subproject 3, use MCPConfigParserStdio instead.
 */
export class MCPConfigParser {
  private static instance: MCPConfigParser;
  private configPaths: string[];
  private discoveryConfig: MCPDiscoveryConfig | null = null;
  private lastParsed: Date | null = null;

  // Deployment mode validation
  private readonly currentSubproject: string;
  private readonly isSubproject3: boolean;

  // Configuration
  private readonly isMultiHost: boolean = true;

  private constructor() {
    // Detect current subproject from environment
    this.currentSubproject = process.env.SUBPROJECT || '1';
    this.isSubproject3 = this.currentSubproject === '3' || 
                        process.env.DEPLOYMENT_MODE === 'docker-multi-host';
    
    // Block initialization for subproject 3
    if (this.isSubproject3) {
      logger.error('❌ [MCP Config] FATAL: HTTP MCP ConfigParser is DEPRECATED and NOT SUPPORTED in subproject 3');
      logger.error('❌ [MCP Config] Subproject 3 MUST use MCPConfigParserStdio with npx subprocess execution');
      logger.error('❌ [MCP Config] The new architecture uses stdio transport via child processes, not HTTP');
      throw new Error(
        'HTTP MCP ConfigParser is not supported in subproject 3. Use MCPConfigParserStdio instead. ' +
        'Subproject 3 requires npx subprocess execution with stdio transport only.'
      );
    }

    logger.warn('⚠️ [MCP Config] Using LEGACY HTTP transport configuration for subproject ' + this.currentSubproject);
    logger.warn('⚠️ [MCP Config] Consider migrating to stdio transport (MCPConfigParserStdio) for better performance');
    
    // Enforce multihost deployment mode for subproject 3
    this.isMultiHost = true;
    
    // Configuration paths for multihost deployment
    // Prioritize multihost-specific configs
    this.configPaths = [
      // Docker container paths (highest priority)
      path.join('/app', 'mcp-config.multihost.json'),
      path.join('/config', 'mcp-config.json'),
      path.join('/config', 'mcp-config.multihost.json'),
      // Project root paths
      path.join(process.cwd(), 'mcp-config.multihost.json'),
      path.join(process.cwd(), '.mcp-config.multihost.json'),
      // Home directory paths
      path.join(os.homedir(), '.olympian-ai-lite', 'mcp_config.multihost.json'),
      path.join(os.homedir(), '.config', 'mcp', 'config.json'),
      path.join(os.homedir(), '.mcp', 'config.json'),
    ];

    logger.info('🔍 [MCP Config] Initialized for multihost deployment (HTTP-only)');
    logger.debug(`🔍 [MCP Config] Config search paths: ${this.configPaths.join(', ')}`);
  }

  static getInstance(): MCPConfigParser {
    if (!MCPConfigParser.instance) {
      MCPConfigParser.instance = new MCPConfigParser();
    }
    return MCPConfigParser.instance;
  }

  /**
   * Parse MCP configuration files from standard locations
   * Enforces HTTP-only configuration for multihost deployment
   * BLOCKED for subproject 3
   */
  async parseConfiguration(): Promise<MCPDiscoveryConfig> {
    if (this.isSubproject3) {
      throw new Error(
        'HTTP MCP ConfigParser cannot parse configuration in subproject 3. ' +
        'Use MCPConfigParserStdio.getInstance().parseConfiguration() instead. ' +
        'Subproject 3 requires npx subprocess execution with stdio transport.'
      );
    }

    logger.info('🔍 [MCP Config] Parsing MCP configuration files (HTTP-only mode)...');

    let foundConfig: MCPDiscoveryConfig | null = null;
    let configPath: string | null = null;

    // Try each configuration path
    for (const searchPath of this.configPaths) {
      try {
        const configData = await fs.readFile(searchPath, 'utf-8');
        const rawConfig = JSON.parse(configData);
        
        // Only accept HTTP-based configurations
        try {
          const validatedConfig = mcpConfigSchema.parse(rawConfig);
          
          // Validate all endpoints are HTTP-based
          const httpOnlyConfig = await this.validateHttpOnlyConfig(validatedConfig);
          
          foundConfig = await this.convertToDiscoveryConfig(httpOnlyConfig, searchPath);
          configPath = searchPath;
          logger.info(`✅ [MCP Config] Loaded HTTP-only MCP configuration from: ${searchPath}`);
          break;
        } catch (parseError) {
          logger.warn(`⚠️ [MCP Config] Invalid or non-HTTP configuration at ${searchPath}:`, parseError);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(`⚠️ [MCP Config] Failed to read config at ${searchPath}:`, error);
        }
      }
    }

    // If no config found, create default
    if (!foundConfig) {
      logger.info('📝 [MCP Config] No configuration found, using defaults');
      foundConfig = this.createDefaultConfig();
    }

    // Ensure HTTP-only endpoints
    foundConfig = await this.enforceHttpOnly(foundConfig);

    // Discover additional endpoints
    foundConfig = await this.enhanceWithDiscovery(foundConfig);

    this.discoveryConfig = foundConfig;
    this.lastParsed = new Date();

    logger.info(`🎯 [MCP Config] Configuration parsed: ${Object.keys(foundConfig.mcpServers).length} HTTP endpoints found`);
    if (configPath) {
      logger.info(`📂 [MCP Config] Using config file: ${configPath}`);
    }
    
    return foundConfig;
  }

  /**
   * Validate that all endpoints are HTTP-based
   */
  private async validateHttpOnlyConfig(config: z.infer<typeof mcpConfigSchema>): Promise<z.infer<typeof mcpConfigSchema>> {
    const validatedServers: Record<string, z.infer<typeof configEndpointSchema>> = {};
    
    for (const [name, endpoint] of Object.entries(config.mcpServers)) {
      if (!this.isValidHttpEndpoint(endpoint)) {
        logger.warn(`⚠️ [MCP Config] Rejecting non-HTTP endpoint "${name}": ${endpoint.url}`);
        continue;
      }
      validatedServers[name] = endpoint;
    }
    
    return {
      ...config,
      mcpServers: validatedServers
    };
  }

  /**
   * Enforce HTTP-only configuration
   */
  private async enforceHttpOnly(config: MCPDiscoveryConfig): Promise<MCPDiscoveryConfig> {
    logger.info('🛡️ [MCP Config] Enforcing HTTP-only endpoints for multihost deployment...');

    const httpOnlyServers: Record<string, MCPConfigEndpoint> = {};
    let rejectedCount = 0;

    for (const [name, endpoint] of Object.entries(config.mcpServers)) {
      // Only accept HTTP/HTTPS endpoints
      if (!this.isValidHttpEndpoint(endpoint)) {
        logger.warn(`⚠️ [MCP Config] Rejecting non-HTTP endpoint "${name}"`);
        rejectedCount++;
        continue;
      }

      // Ensure container-based endpoints (Docker network)
      if (!this.isContainerEndpoint(endpoint)) {
        logger.warn(`⚠️ [MCP Config] Warning: Non-container endpoint "${name}" - ensure Docker network connectivity`);
      }

      httpOnlyServers[name] = endpoint;
      logger.debug(`✅ [MCP Config] Validated HTTP endpoint "${name}": ${endpoint.url}`);
    }

    if (rejectedCount > 0) {
      logger.info(`🛡️ [MCP Config] HTTP-only validation: ${Object.keys(httpOnlyServers).length} valid endpoints, ${rejectedCount} rejected`);
    }

    return {
      ...config,
      mcpServers: httpOnlyServers
    };
  }

  /**
   * Check if endpoint is a valid HTTP endpoint
   */
  private isValidHttpEndpoint(endpoint: MCPConfigEndpoint): boolean {
    try {
      const url = new URL(endpoint.url);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Check if endpoint is a container-based endpoint
   */
  private isContainerEndpoint(endpoint: MCPConfigEndpoint): boolean {
    try {
      const url = new URL(endpoint.url);
      // Check for Docker service names or container hostnames
      // Fixed: Use Boolean() to convert regex match result to boolean
      const isDockerNetworkIP = Boolean(url.hostname.match(/^172\.\\d+\.\\d+\.\\d+$/));
      
      return url.hostname.includes('mcp-') || 
             url.hostname === 'backend' ||
             url.hostname === 'localhost' ||
             isDockerNetworkIP; // Docker network IPs
    } catch {
      return false;
    }
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
      // Only process HTTP endpoints
      if (!this.isValidHttpEndpoint(endpoint)) {
        continue;
      }

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
        'https://registry.modelcontextprotocol.io'
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
   * Create default configuration for multihost deployment
   * BLOCKED for subproject 3
   */
  private createDefaultConfig(): MCPDiscoveryConfig {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().createDefaultConfig() for subproject 3');
    }

    // Default configuration points to container-based MCP servers
    return {
      mcpServers: {
        'github': {
          url: 'http://mcp-github:3001/mcp',
          type: 'server',
          timeout: 30000,
          retries: 3
        },
        'nasa-mcp': {
          url: 'http://mcp-nasa:3002/mcp',
          type: 'server',
          timeout: 30000,
          retries: 3
        },
        'met-museum': {
          url: 'http://mcp-metmuseum:3003/mcp',
          type: 'server',
          timeout: 30000,
          retries: 3
        },
        'context7': {
          url: 'http://mcp-context7:3004/mcp',
          type: 'server',
          timeout: 30000,
          retries: 3
        },
        'applescript': {
          url: 'http://mcp-applescript:3005/mcp',
          type: 'server',
          timeout: 30000,
          retries: 3
        },
        'websearch': {
          url: 'http://mcp-websearch:3006/mcp',
          type: 'server',
          timeout: 45000,
          retries: 3
        }
      },
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
   * Only accepts HTTP endpoints in multihost mode
   * BLOCKED for subproject 3
   */
  private async enhanceWithDiscovery(config: MCPDiscoveryConfig): Promise<MCPDiscoveryConfig> {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().enhanceWithDiscovery() for subproject 3');
    }

    logger.info('🔍 [MCP Config] Enhancing configuration with HTTP-only discovery...');

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
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio for subproject 3');
    }

    logger.debug('🔍 [MCP Config] Checking well-known paths for HTTP MCP servers...');

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
              // Only accept HTTP servers
              if (!this.isValidHttpUrl(server.url)) {
                logger.debug(`⚠️ [MCP Config] Skipping non-HTTP discovered server: ${server.url}`);
                continue;
              }

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
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio for subproject 3');
    }

    logger.debug('🔍 [MCP Config] Checking registries for HTTP MCP servers...');

    for (const registryUrl of config.registryUrls || []) {
      try {
        const discovered = await this.fetchRegistryServers(registryUrl);
        
        if (discovered && discovered.length > 0) {
          logger.info(`✅ [MCP Config] Discovered ${discovered.length} servers from registry ${registryUrl}`);
          
          for (const server of discovered) {
            // Only accept HTTP servers
            if (!this.isValidHttpUrl(server.url)) {
              logger.debug(`⚠️ [MCP Config] Skipping non-HTTP registry server: ${server.url}`);
              continue;
            }

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
   * Check if URL is a valid HTTP/HTTPS URL
   */
  private isValidHttpUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Fetch servers from discovery endpoint
   */
  private async fetchDiscoveryEndpoint(url: string): Promise<Array<{ name?: string; url: string }>> {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio for subproject 3');
    }

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
        return data.servers.filter(server => this.isValidHttpUrl(server.url));
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
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio for subproject 3');
    }

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
        return data.servers.filter(server => this.isValidHttpUrl(server.url));
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
   * Convert discovery config to MCPServer instances (HTTP-only)
   * BLOCKED for subproject 3
   */
  async createServersFromConfig(): Promise<MCPServer[]> {
    if (this.isSubproject3) {
      throw new Error(
        'HTTP MCP ConfigParser cannot create servers in subproject 3. ' +
        'Use MCPConfigParserStdio.getInstance().createServersFromConfig() instead. ' +
        'Subproject 3 requires npx subprocess execution with stdio transport.'
      );
    }

    if (!this.discoveryConfig) {
      await this.parseConfiguration();
    }

    const servers: MCPServer[] = [];

    for (const [name, endpoint] of Object.entries(this.discoveryConfig!.mcpServers)) {
      if (endpoint.type === 'server') {
        // Only create HTTP servers
        const transport = this.determineTransport(endpoint.url);
        if (transport === 'stdio') {
          logger.warn(`⚠️ [MCP Config] Rejecting stdio server "${name}" in multihost mode`);
          continue;
        }

        const server: MCPServer = {
          id: `config_${name}_${Date.now()}`,
          name,
          command: '', // No command needed for HTTP servers
          transport,
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

    logger.info(`📊 [MCP Config] Created ${servers.length} HTTP server configurations`);
    return servers;
  }

  /**
   * Determine transport type from URL (HTTP-only for multihost)
   */
  private determineTransport(url: string): MCPServer['transport'] {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return 'streamable_http';
      } else if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
        return 'sse';
      } else {
        // Reject any non-HTTP transport
        return 'stdio'; // Will be rejected
      }
    } catch {
      return 'stdio'; // Will be rejected
    }
  }

  /**
   * Get current discovery configuration
   * BLOCKED for subproject 3
   */
  getDiscoveryConfig(): MCPDiscoveryConfig | null {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().getDiscoveryConfig() for subproject 3');
    }
    return this.discoveryConfig;
  }

  /**
   * Check if configuration needs refresh
   * BLOCKED for subproject 3
   */
  needsRefresh(maxAge: number = 3600000): boolean { // 1 hour default
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().needsRefresh() for subproject 3');
    }
    if (!this.lastParsed) return true;
    return Date.now() - this.lastParsed.getTime() > maxAge;
  }

  /**
   * Refresh configuration if needed
   * BLOCKED for subproject 3
   */
  async refreshIfNeeded(maxAge?: number): Promise<MCPDiscoveryConfig> {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().refreshIfNeeded() for subproject 3');
    }
    if (this.needsRefresh(maxAge)) {
      logger.info('🔄 [MCP Config] Configuration refresh needed, re-parsing...');
      return await this.parseConfiguration();
    }
    return this.discoveryConfig!;
  }

  /**
   * Validate endpoint URL for basic reachability
   * BLOCKED for subproject 3
   */
  async validateEndpoint(endpoint: MCPConfigEndpoint): Promise<boolean> {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().validateEndpoint() for subproject 3');
    }

    try {
      // Only validate HTTP endpoints
      if (!this.isValidHttpEndpoint(endpoint)) {
        return false;
      }

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
   * BLOCKED for subproject 3
   */
  getConfigurationStats(): {
    totalEndpoints: number;
    serverEndpoints: number;
    discoveryChannels: number;
    registries: number;
    lastParsed: Date | null;
    deploymentMode: string;
    httpOnlyMode: boolean;
    containerEndpoints: number;
  } {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().getConfigurationStats() for subproject 3');
    }

    if (!this.discoveryConfig) {
      return {
        totalEndpoints: 0,
        serverEndpoints: 0,
        discoveryChannels: 0,
        registries: 0,
        lastParsed: null,
        deploymentMode: 'multihost',
        httpOnlyMode: true,
        containerEndpoints: 0
      };
    }

    const endpoints = Object.values(this.discoveryConfig.mcpServers);
    const containerEndpoints = endpoints.filter(e => 
      e.type === 'server' && this.isContainerEndpoint(e)
    ).length;

    return {
      totalEndpoints: endpoints.length,
      serverEndpoints: endpoints.filter(e => e.type === 'server').length,
      discoveryChannels: endpoints.filter(e => e.type === 'discovery_channel').length,
      registries: endpoints.filter(e => e.type === 'registry').length,
      lastParsed: this.lastParsed,
      deploymentMode: 'multihost',
      httpOnlyMode: true,
      containerEndpoints
    };
  }

  /**
   * Check if running in multihost mode (always true for subproject 3)
   * BLOCKED for subproject 3
   */
  isMultihostMode(): boolean {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().isStdioMode() for subproject 3');
    }
    return true;
  }

  /**
   * Get validation results for HTTP-only enforcement
   * BLOCKED for subproject 3
   */
  getHttpOnlyValidationResults(): {
    acceptedEndpoints: string[];
    rejectedEndpoints: string[];
    containerEndpoints: string[];
    externalEndpoints: string[];
  } {
    if (this.isSubproject3) {
      throw new Error('Use MCPConfigParserStdio.getInstance().getStdioValidationResults() for subproject 3');
    }

    if (!this.discoveryConfig) {
      return {
        acceptedEndpoints: [],
        rejectedEndpoints: [],
        containerEndpoints: [],
        externalEndpoints: []
      };
    }

    const accepted: string[] = [];
    const rejected: string[] = [];
    const container: string[] = [];
    const external: string[] = [];

    for (const [name, endpoint] of Object.entries(this.discoveryConfig.mcpServers)) {
      if (!this.isValidHttpEndpoint(endpoint)) {
        rejected.push(name);
      } else {
        accepted.push(name);
        
        if (this.isContainerEndpoint(endpoint)) {
          container.push(name);
        } else {
          external.push(name);
        }
      }
    }

    return {
      acceptedEndpoints: accepted,
      rejectedEndpoints: rejected,
      containerEndpoints: container,
      externalEndpoints: external
    };
  }
}
