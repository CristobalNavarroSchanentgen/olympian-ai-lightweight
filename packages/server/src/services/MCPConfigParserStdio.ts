import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { MCPDiscoveryConfig, MCPConfigEndpoint, MCPServer } from '@olympian/shared';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Validation schemas for MCP configuration (stdio-based for subproject 3)
const configEndpointSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  timeout: z.number().optional(),
  retries: z.number().optional()
});

const mcpConfigSchema = z.object({
  mcpServers: z.record(configEndpointSchema),
  cacheTtl: z.number().optional()
});

/**
 * MCP Configuration Parser for stdio-based subproject 3 deployment
 * 
 * This implementation enforces stdio transport for all MCP servers:
 * 1. All MCP servers run as child processes in the main container
 * 2. Communication via stdio transport (stdin/stdout)
 * 3. No external HTTP dependencies 
 * 4. Self-contained server execution
 */
export class MCPConfigParserStdio {
  private static instance: MCPConfigParserStdio;
  private configPaths: string[];
  private discoveryConfig: MCPDiscoveryConfig | null = null;
  private lastParsed: Date | null = null;

  // Deployment mode - enforced stdio for subproject 3
  private readonly isStdioMode: boolean = true;

  private constructor() {
    // Enforce stdio deployment mode for subproject 3
    this.isStdioMode = true;
    
    // Configuration paths for stdio deployment
    this.configPaths = [
      // Docker container paths (highest priority)
      path.join('/app', 'mcp-config.stdio.json'),
      path.join('/config', 'mcp-config.stdio.json'),
      // Project root paths
      path.join(process.cwd(), 'mcp-config.stdio.json'),
      path.join(process.cwd(), '.mcp-config.stdio.json'),
      // Home directory paths
      path.join(os.homedir(), '.olympian-ai-lite', 'mcp_config.stdio.json'),
    ];

    logger.info('🔍 [MCP Config] Initialized for stdio deployment (child processes)');
    logger.debug(`🔍 [MCP Config] Config search paths: ${this.configPaths.join(', ')}`);
  }

  static getInstance(): MCPConfigParserStdio {
    if (!MCPConfigParserStdio.instance) {
      MCPConfigParserStdio.instance = new MCPConfigParserStdio();
    }
    return MCPConfigParserStdio.instance;
  }

  /**
   * Parse MCP configuration files from standard locations
   * Enforces stdio-only configuration for subproject 3
   */
  async parseConfiguration(): Promise<MCPDiscoveryConfig> {
    logger.info('🔍 [MCP Config] Parsing MCP configuration files (stdio mode)...');

    let foundConfig: MCPDiscoveryConfig | null = null;
    let configPath: string | null = null;

    // Try each configuration path
    for (const searchPath of this.configPaths) {
      try {
        const configData = await fs.readFile(searchPath, 'utf-8');
        const rawConfig = JSON.parse(configData);
        
        // Only accept stdio-based configurations
        try {
          const validatedConfig = mcpConfigSchema.parse(rawConfig);
          
          foundConfig = await this.convertToDiscoveryConfig(validatedConfig, searchPath);
          configPath = searchPath;
          logger.info(`✅ [MCP Config] Loaded stdio MCP configuration from: ${searchPath}`);
          break;
        } catch (parseError) {
          logger.warn(`⚠️ [MCP Config] Invalid stdio configuration at ${searchPath}:`, parseError);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          logger.warn(`⚠️ [MCP Config] Failed to read config at ${searchPath}:`, error);
        }
      }
    }

    // If no config found, create default stdio config
    if (!foundConfig) {
      logger.info('📝 [MCP Config] No configuration found, using stdio defaults');
      foundConfig = this.createDefaultStdioConfig();
    }

    this.discoveryConfig = foundConfig;
    this.lastParsed = new Date();

    logger.info(`🎯 [MCP Config] Configuration parsed: ${Object.keys(foundConfig.mcpServers).length} stdio servers found`);
    if (configPath) {
      logger.info(`📂 [MCP Config] Using config file: ${configPath}`);
    }
    
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
        url: `stdio://${name}`, // Virtual URL for stdio
        type: 'server',
        command: endpoint.command,
        args: endpoint.args || [],
        env: endpoint.env,
        timeout: endpoint.timeout || 30000,
        retries: endpoint.retries || 3
      };
    }

    return {
      mcpServers,
      wellKnownPaths: [], // Not applicable for stdio
      registryUrls: [], // Not applicable for stdio
      cacheTtl: config.cacheTtl || 300000 // 5 minutes
    };
  }

  /**
   * Create default stdio configuration for subproject 3
   */
  private createDefaultStdioConfig(): MCPDiscoveryConfig {
    // Default configuration for stdio-based MCP servers
    return {
      mcpServers: {
        'github': {
          url: 'stdio://github',
          type: 'server',
          command: 'npx',
          args: ['--yes', '@modelcontextprotocol/server-github'],
          timeout: 30000,
          retries: 3,
          env: {
            GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
          }
        },
        'nasa-mcp': {
          url: 'stdio://nasa-mcp',
          type: 'server',
          command: 'npx',
          args: ['--yes', '@modelcontextprotocol/server-nasa'],
          timeout: 30000,
          retries: 3
        },
        'met-museum': {
          url: 'stdio://met-museum',
          type: 'server',
          command: 'npx',
          args: ['--yes', '@modelcontextprotocol/server-metmuseum'],
          timeout: 30000,
          retries: 3
        },
        'context7': {
          url: 'stdio://context7',
          type: 'server',
          command: 'npx',
          args: ['--yes', '@modelcontextprotocol/server-context7'],
          timeout: 30000,
          retries: 3,
          env: {
            CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY || ''
          }
        },
        'applescript': {
          url: 'stdio://applescript',
          type: 'server',
          command: 'npx',
          args: ['--yes', '@modelcontextprotocol/server-applescript'],
          timeout: 30000,
          retries: 3
        },
        'websearch': {
          url: 'stdio://websearch',
          type: 'server',
          command: 'npx',
          args: ['--yes', '@modelcontextprotocol/server-websearch'],
          timeout: 45000,
          retries: 3,
          env: {
            BRAVE_API_KEY: process.env.BRAVE_API_KEY || '',
            GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
            GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || ''
          }
        }
      },
      wellKnownPaths: [],
      registryUrls: [],
      cacheTtl: 300000
    };
  }

  /**
   * Convert discovery config to MCPServer instances (stdio-only)
   */
  async createServersFromConfig(): Promise<MCPServer[]> {
    if (!this.discoveryConfig) {
      await this.parseConfiguration();
    }

    const servers: MCPServer[] = [];

    for (const [name, endpoint] of Object.entries(this.discoveryConfig!.mcpServers)) {
      if (endpoint.type === 'server') {
        const server: MCPServer = {
          id: `stdio_${name}_${Date.now()}`,
          name,
          command: endpoint.command || 'npx',
          args: endpoint.args || [],
          env: endpoint.env,
          transport: 'stdio',
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

    logger.info(`📊 [MCP Config] Created ${servers.length} stdio server configurations`);
    return servers;
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
   * Validate stdio command availability
   */
  async validateCommand(command: string, args: string[] = []): Promise<boolean> {
    try {
      const { spawn } = await import('child_process');
      
      return new Promise((resolve) => {
        const child = spawn(command, ['--version'].concat(args), {
          stdio: 'ignore',
          timeout: 5000
        });
        
        child.on('close', (code) => {
          resolve(code === 0);
        });
        
        child.on('error', () => {
          resolve(false);
        });
      });
    } catch (error) {
      logger.debug(`⚠️ [MCP Config] Command validation failed for ${command}:`, error);
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
    stdioMode: boolean;
  } {
    if (!this.discoveryConfig) {
      return {
        totalEndpoints: 0,
        serverEndpoints: 0,
        discoveryChannels: 0,
        registries: 0,
        lastParsed: null,
        deploymentMode: 'stdio-subproject3',
        stdioMode: true
      };
    }

    const endpoints = Object.values(this.discoveryConfig.mcpServers);

    return {
      totalEndpoints: endpoints.length,
      serverEndpoints: endpoints.filter(e => e.type === 'server').length,
      discoveryChannels: 0, // Not applicable for stdio
      registries: 0, // Not applicable for stdio
      lastParsed: this.lastParsed,
      deploymentMode: 'stdio-subproject3',
      stdioMode: true
    };
  }

  /**
   * Check if running in stdio mode (always true for subproject 3)
   */
  isStdioMode(): boolean {
    return true;
  }

  /**
   * Get validation results for stdio enforcement
   */
  getStdioValidationResults(): {
    validCommands: string[];
    invalidCommands: string[];
    availableServers: string[];
    missingDependencies: string[];
  } {
    if (!this.discoveryConfig) {
      return {
        validCommands: [],
        invalidCommands: [],
        availableServers: [],
        missingDependencies: []
      };
    }

    const valid: string[] = [];
    const invalid: string[] = [];
    const available: string[] = [];
    const missing: string[] = [];

    for (const [name, endpoint] of Object.entries(this.discoveryConfig.mcpServers)) {
      if (endpoint.command) {
        // Note: Actual validation would be async, this is just structure
        available.push(name);
        valid.push(endpoint.command);
      } else {
        missing.push(name);
      }
    }

    return {
      validCommands: valid,
      invalidCommands: invalid,
      availableServers: available,
      missingDependencies: missing
    };
  }
}
