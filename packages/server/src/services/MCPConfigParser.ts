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

// Support for standard Claude Desktop MCP config format
const standardMcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional()
});

const standardMcpConfigSchema = z.object({
  mcpServers: z.record(standardMcpServerSchema)
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
 * MCP Configuration Parser for HTTP-only multihost deployment
 * 
 * Handles:
 * 1. Configuration extraction from mcp-config.json files
 * 2. Endpoint discovery and validation
 * 3. Well-known path resolution (.well-known/mcp)
 * 4. Registry integration for server discovery
 * 5. HTTP-only transport validation for multihost deployment
 * 6. Rejection of stdio configurations in multihost mode
 */
export class MCPConfigParser {
  private static instance: MCPConfigParser;
  private configPaths: string[];
  private discoveryConfig: MCPDiscoveryConfig | null = null;
  private lastParsed: Date | null = null;

  // Deployment mode detection
  private readonly isMultiHost: boolean;

  private constructor() {
    // Detect deployment mode for path prioritization
    const deploymentMode = process.env.DEPLOYMENT_MODE || 'development';
    // Fix TypeScript boolean | undefined error by ensuring explicit boolean result
    this.isMultiHost = Boolean(
      deploymentMode === 'multi-host' || 
      Boolean(process.env.ENABLE_MULTI_HOST === 'true') ||
      Boolean(process.env.NODE_ENV === 'multihost')
    );
    
    // Standard MCP configuration paths following conventions
    // For multihost deployment, prioritize multihost-specific configs
    const basePaths = [
      path.join(os.homedir(), '.config', 'mcp', 'config.json'),
      path.join(os.homedir(), '.mcp', 'config.json'),
      path.join(os.homedir(), '.olympian-ai-lite', 'mcp_config.json'),
      path.join(process.cwd(), 'mcp-config.json'),
      path.join(process.cwd(), '.mcp-config.json'),
    ];

    // Add multihost-specific configuration paths
    const multihostPaths = [
      path.join(process.cwd(), 'mcp-config.multihost.json'),
      path.join(process.cwd(), `.mcp-config.${deploymentMode}.json`),
      path.join(os.homedir(), '.olympian-ai-lite', `mcp_config.${deploymentMode}.json`),
      // Docker container paths
      path.join('/app', 'mcp-config.multihost.json'),
      path.join('/config', 'mcp-config.json'),
      path.join('/config', 'mcp-config.multihost.json'),
    ];

    // Prioritize multihost configs when in multihost mode
    if (this.isMultiHost) {
      this.configPaths = [...multihostPaths, ...basePaths];
    } else {
      this.configPaths = [...basePaths, ...multihostPaths];
    }

    logger.info(`🔍 [MCP Config] Initialized with deployment mode: ${deploymentMode}, multihost: ${this.isMultiHost}`);
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
   * Following guideline: "extract from the mcp config file the different connection endpoints"
   */
  async parseConfiguration(): Promise<MCPDiscoveryConfig> {
    logger.info('🔍 [MCP Config] Parsing MCP configuration files...');

    let foundConfig: MCPDiscoveryConfig | null = null;
    let configPath: string | null = null;

    // Try each configuration path
    for (const searchPath of this.configPaths) {
      try {
        const configData = await fs.readFile(searchPath, 'utf-8');
        const rawConfig = JSON.parse(configData);
        
        // Try to parse as standard Claude Desktop format first
        try {
          const standardConfig = standardMcpConfigSchema.parse(rawConfig);
          
          // In multihost mode, reject stdio configurations
          if (this.isMultiHost) {
            logger.warn(`⚠️ [MCP Config] Rejecting stdio configuration in multihost mode: ${searchPath}`);
            continue;
          }
          
          foundConfig = await this.convertStandardToDiscoveryConfig(standardConfig, searchPath);
          configPath = searchPath;
          logger.info(`✅ [MCP Config] Loaded standard MCP configuration from: ${searchPath}`);
          break;
        } catch (standardParseError) {
          // If that fails, try our internal URL-based format
          try {
            const validatedConfig = mcpConfigSchema.parse(rawConfig);
            foundConfig = await this.convertToDiscoveryConfig(validatedConfig, searchPath);
            configPath = searchPath;
            logger.info(`✅ [MCP Config] Loaded URL-based MCP configuration from: ${searchPath}`);
            break;
          } catch (urlParseError) {
            logger.warn(`⚠️ [MCP Config] Failed to parse config at ${searchPath} in either format:`, {
              standardError: standardParseError,
              urlError: urlParseError
            });
          }
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

    // Validate and filter for multihost deployment
    if (this.isMultiHost) {
      foundConfig = await this.validateMultihostConfig(foundConfig);
    }

    // Discover additional endpoints
    foundConfig = await this.enhanceWithDiscovery(foundConfig);

    this.discoveryConfig = foundConfig;
    this.lastParsed = new Date();

    logger.info(`🎯 [MCP Config] Configuration parsed: ${Object.keys(foundConfig.mcpServers).length} endpoints found (${this.isMultiHost ? 'HTTP-only' : 'mixed transports'})`);
    if (configPath) {
      logger.info(`📂 [MCP Config] Using config file: ${configPath}`);
    }
    
    return foundConfig;
  }

  /**
   * Validate configuration for multihost deployment (HTTP-only)
   */
  private async validateMultihostConfig(config: MCPDiscoveryConfig): Promise<MCPDiscoveryConfig> {
    if (!this.isMultiHost) {
      return config;
    }

    logger.info('🌐 [MCP Config] Validating configuration for multihost deployment (HTTP-only)...');

    const validatedServers: Record<string, MCPConfigEndpoint> = {};
    let rejectedCount = 0;

    for (const [name, endpoint] of Object.entries(config.mcpServers)) {
      // Check if this is a stdio-based endpoint
      if (this.isStdioEndpoint(endpoint)) {
        logger.warn(`⚠️ [MCP Config] Rejecting stdio server "${name}" in multihost mode`);
        rejectedCount++;
        continue;
      }

      // Validate HTTP endpoint
      if (!this.isValidHttpEndpoint(endpoint)) {
        logger.warn(`⚠️ [MCP Config] Rejecting invalid HTTP endpoint "${name}": ${endpoint.url}`);
        rejectedCount++;
        continue;
      }

      validatedServers[name] = endpoint;
      logger.debug(`✅ [MCP Config] Validated HTTP endpoint "${name}": ${endpoint.url}`);
    }

    if (rejectedCount > 0) {
      logger.info(`🛡️ [MCP Config] Multihost validation: ${Object.keys(validatedServers).length} valid HTTP endpoints, ${rejectedCount} rejected`);
    }

    return {
      ...config,
      mcpServers: validatedServers
    };
  }

  /**
   * Check if endpoint is stdio-based
   */
  private isStdioEndpoint(endpoint: MCPConfigEndpoint): boolean {
    return endpoint.url.startsWith('mcp-stdio:') || 
           Boolean(endpoint.headers && endpoint.headers['x-mcp-command'] !== undefined);
  }

  /**
   * Check if endpoint is a valid HTTP endpoint
   */
  private isValidHttpEndpoint(endpoint: MCPConfigEndpoint): boolean {
    try {
      const url = new URL(endpoint.url);
      return Boolean(url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
      return false;
    }
  }

  /**
   * Convert standard Claude Desktop MCP config format to internal discovery config
   * Note: This method is disabled for multihost deployment as it generates stdio configs
   */
  private async convertStandardToDiscoveryConfig(
    config: z.infer<typeof standardMcpConfigSchema>, 
    configPath: string
  ): Promise<MCPDiscoveryConfig> {
    logger.info('🔄 [MCP Config] Converting standard MCP config format to internal format...');
    
    // In multihost mode, we should not be processing stdio configs
    if (this.isMultiHost) {
      throw new Error('Standard MCP config (stdio) not supported in multihost mode');
    }
    
    const mcpServers: Record<string, MCPConfigEndpoint> = {};

    for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
      // For standard MCP servers, we need to create pseudo-URLs since they use stdio
      // These will be handled specially by the MCP client
      const pseudoUrl = `mcp-stdio://${name}`;
      
      mcpServers[name] = {
        url: pseudoUrl,
        type: 'server',
        timeout: 30000,
        retries: 3,
        // Store the original command/args in headers for later use
        headers: {
          'x-mcp-command': serverConfig.command,
          'x-mcp-args': JSON.stringify(serverConfig.args || []),
          'x-mcp-env': JSON.stringify(serverConfig.env || {})
        }
      };
    }

    logger.info(`🔄 [MCP Config] Converted ${Object.keys(mcpServers).length} standard MCP servers to internal format`);

    return {
      mcpServers,
      wellKnownPaths: [
        '/.well-known/mcp',
        '/.well-known/model-context-protocol'
      ],
      registryUrls: [
        'https://registry.modelcontextprotocol.io',
        'https://mcp-registry.anthropic.com'
      ],
      cacheTtl: 300000 // 5 minutes
    };
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
      // In multihost mode, skip stdio endpoints
      if (this.isMultiHost && this.isStdioEndpoint(endpoint)) {
        logger.warn(`⚠️ [MCP Config] Skipping stdio endpoint "${name}" in multihost mode`);
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
              // Skip non-HTTP servers in multihost mode
              if (this.isMultiHost && !this.isValidHttpUrl(server.url)) {
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
    logger.debug('🔍 [MCP Config] Checking registries for MCP servers...');

    for (const registryUrl of config.registryUrls || []) {
      try {
        const discovered = await this.fetchRegistryServers(registryUrl);
        
        if (discovered && discovered.length > 0) {
          logger.info(`✅ [MCP Config] Discovered ${discovered.length} servers from registry ${registryUrl}`);
          
          for (const server of discovered) {
            // Skip non-HTTP servers in multihost mode
            if (this.isMultiHost && !this.isValidHttpUrl(server.url)) {
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
      return Boolean(parsed.protocol === 'http:' || parsed.protocol === 'https:');
    } catch {
      return false;
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
        // Skip stdio servers in multihost mode
        if (this.isMultiHost && this.isStdioEndpoint(endpoint)) {
          logger.warn(`⚠️ [MCP Config] Skipping stdio server "${name}" in multihost mode`);
          continue;
        }

        const server: MCPServer = {
          id: `config_${name}_${Date.now()}`,
          name,
          command: this.extractCommand(endpoint),
          transport: this.determineTransport(endpoint.url),
          endpoint: endpoint.url,
          status: 'stopped',
          healthCheckInterval: 300000,
          maxRetries: endpoint.retries || 3,
          timeout: endpoint.timeout || 30000,
          priority: 0
        };

        // Final validation for multihost
        if (this.isMultiHost && server.transport === 'stdio') {
          logger.warn(`⚠️ [MCP Config] Rejecting stdio server "${name}" in multihost mode`);
          continue;
        }

        servers.push(server);
      }
    }

    logger.info(`📊 [MCP Config] Created ${servers.length} server configurations (${this.isMultiHost ? 'HTTP-only' : 'mixed transports'})`);
    return servers;
  }

  /**
   * Extract command from endpoint configuration
   */
  private extractCommand(endpoint: MCPConfigEndpoint): string {
    // Check if this is a standard MCP server (stdio) with command in headers
    if (endpoint.headers && endpoint.headers['x-mcp-command']) {
      return endpoint.headers['x-mcp-command'];
    }
    
    // For URL-based endpoints, return empty (will be handled by transport)
    return '';
  }

  /**
   * Determine transport type from URL
   */
  private determineTransport(url: string): MCPServer['transport'] {
    try {
      const parsed = new URL(url);
      
      if (parsed.protocol === 'mcp-stdio:') {
        return 'stdio';
      } else if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
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
    return Boolean(Date.now() - this.lastParsed.getTime() > maxAge);
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
      // Skip validation for stdio endpoints
      if (endpoint.url.startsWith('mcp-stdio:')) {
        // In multihost mode, stdio endpoints are invalid
        return Boolean(!this.isMultiHost);
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
      return Boolean(response.ok || response.status === 405); // 405 Method Not Allowed is acceptable
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
    deploymentMode: string;
    httpOnlyMode: boolean;
  } {
    if (!this.discoveryConfig) {
      return {
        totalEndpoints: 0,
        serverEndpoints: 0,
        discoveryChannels: 0,
        registries: 0,
        lastParsed: null,
        deploymentMode: this.isMultiHost ? 'multihost' : 'standard',
        httpOnlyMode: this.isMultiHost
      };
    }

    const endpoints = Object.values(this.discoveryConfig.mcpServers);
    return {
      totalEndpoints: endpoints.length,
      serverEndpoints: endpoints.filter(e => e.type === 'server').length,
      discoveryChannels: endpoints.filter(e => e.type === 'discovery_channel').length,
      registries: endpoints.filter(e => e.type === 'registry').length,
      lastParsed: this.lastParsed,
      deploymentMode: this.isMultiHost ? 'multihost' : 'standard',
      httpOnlyMode: this.isMultiHost
    };
  }

  /**
   * Check if running in multihost mode
   */
  isMultihostMode(): boolean {
    return this.isMultiHost;
  }

  /**
   * Get list of rejected stdio servers (for logging purposes)
   */
  getHttpOnlyValidationResults(): {
    acceptedEndpoints: string[];
    rejectedStdioEndpoints: string[];
    invalidHttpEndpoints: string[];
  } {
    if (!this.discoveryConfig) {
      return {
        acceptedEndpoints: [],
        rejectedStdioEndpoints: [],
        invalidHttpEndpoints: []
      };
    }

    const accepted: string[] = [];
    const rejectedStdio: string[] = [];
    const invalidHttp: string[] = [];

    for (const [name, endpoint] of Object.entries(this.discoveryConfig.mcpServers)) {
      if (this.isStdioEndpoint(endpoint)) {
        rejectedStdio.push(name);
      } else if (!this.isValidHttpEndpoint(endpoint)) {
        invalidHttp.push(name);
      } else {
        accepted.push(name);
      }
    }

    return {
      acceptedEndpoints: accepted,
      rejectedStdioEndpoints: rejectedStdio,
      invalidHttpEndpoints: invalidHttp
    };
  }
}
