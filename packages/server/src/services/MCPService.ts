import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';
import { MCPTool } from '@olympian/shared';

/**
 * Modern MCP Service for Subproject 3
 * 
 * Enhanced with latest SDK patterns:
 * - Proper request schemas for all operations
 * - Better error handling and type safety
 * - Support for prompts, resources, and completions
 * - Improved process management
 * - Better capability negotiation
 */

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  optional?: boolean;
  description?: string;
}

interface MCPServerInstance {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startTime: Date;
  capabilities?: {
    tools?: boolean;
    prompts?: boolean;
    resources?: boolean;
    completion?: boolean;
  };
  lastError?: string;
}

export class MCPService {
  private servers: Map<string, MCPServerInstance> = new Map();
  private readonly CLIENT_INFO = {
    name: 'olympian-ai-subproject3',
    version: '1.0.0'
  };

  /**
   * Default MCP server configuration following npx philosophy
   */
  private readonly DEFAULT_SERVERS: MCPServerConfig[] = [
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      description: 'GitHub API integration for repositories, issues, and PRs',
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
      }
    },
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/app'],
      description: 'File system access within the container',
    },
    {
      name: 'memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      description: 'In-memory key-value storage',
    },
    {
      name: 'brave-search',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      optional: true,
      description: 'Web search using Brave Search API',
      env: {
        BRAVE_API_KEY: process.env.BRAVE_API_KEY || ''
      }
    },
    {
      name: 'slack',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      optional: true,
      description: 'Slack workspace integration',
      env: {
        SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN || '',
        SLACK_TEAM_ID: process.env.SLACK_TEAM_ID || ''
      }
    },
    {
      name: 'postgres',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      optional: true,
      description: 'PostgreSQL database access',
      env: {
        DATABASE_URL: process.env.DATABASE_URL || ''
      }
    }
  ];

  /**
   * Initialize MCP service
   */
  async initialize(): Promise<void> {
    logger.info('🚀 [MCP] Initializing modern MCP service (npx-based)...');

    // Setup cleanup handlers
    this.setupCleanupHandlers();

    // Start all servers
    await this.startServers();

    logger.info(`✅ [MCP] Modern MCP service initialized: ${this.servers.size} servers`);
  }

  /**
   * Start all MCP servers using npx
   */
  private async startServers(): Promise<void> {
    const startPromises = this.DEFAULT_SERVERS.map(async (config) => {
      try {
        await this.startServer(config);
      } catch (error) {
        if (config.optional) {
          logger.info(`ℹ️ [MCP] Optional server ${config.name} failed to start: ${error}`);
        } else {
          logger.error(`❌ [MCP] Required server ${config.name} failed to start:`, error);
        }
      }
    });

    await Promise.allSettled(startPromises);
  }

  /**
   * Start a single MCP server
   */
  private async startServer(config: MCPServerConfig): Promise<void> {
    logger.info(`🚀 [MCP] Starting server: ${config.name}`);

    // Prepare environment
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...config.env,
      MCP_TRANSPORT: 'stdio'
    };

    // Create stdio transport
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env
    });

    // Create client with full capabilities
    const client = new Client(this.CLIENT_INFO, {
      capabilities: {
        tools: {},
        prompts: {},
        resources: {},
        completion: {},
        roots: {},
        sampling: {}
      }
    });

    // Create server instance
    const serverInstance: MCPServerInstance = {
      config,
      client,
      transport,
      status: 'starting',
      startTime: new Date()
    };

    // Store instance
    this.servers.set(config.name, serverInstance);

    try {
      // Connect to server with timeout
      await this.connectWithTimeout(client, transport, 30000);
      
      serverInstance.status = 'running';
      
      // Get server capabilities after connection
      serverInstance.capabilities = await this.getServerCapabilities(client);
      
      logger.info(`✅ [MCP] Server ${config.name} started successfully with capabilities:`, serverInstance.capabilities);

      // Setup error handling for transport
      transport.onerror = (error) => {
        logger.error(`❌ [MCP] Server ${config.name} transport error:`, error);
        serverInstance.status = 'error';
        serverInstance.lastError = error.message;
      };

      transport.onclose = () => {
        logger.info(`📤 [MCP] Server ${config.name} connection closed`);
        serverInstance.status = 'stopped';
      };

    } catch (error) {
      serverInstance.status = 'error';
      serverInstance.lastError = error instanceof Error ? error.message : 'Unknown error';
      this.servers.delete(config.name);
      throw error;
    }
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(client: Client, transport: StdioClientTransport, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms`));
      }, timeout);

      client.connect(transport)
        .then(() => {
          clearTimeout(timer);
          resolve();
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Get server capabilities
   */
  private async getServerCapabilities(client: Client): Promise<any> {
    try {
      // Try to access server info from client internals
      const clientAny = client as any;
      if (clientAny._serverInfo?.capabilities) {
        return clientAny._serverInfo.capabilities;
      }
      
      // Default capabilities
      return {
        tools: true,
        prompts: false,
        resources: false,
        completion: false
      };
    } catch (error) {
      return {
        tools: true,
        prompts: false,
        resources: false,
        completion: false
      };
    }
  }

  /**
   * List all available tools from all servers with complete schema information
   */
  async listTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];

    for (const [serverId, serverInstance] of this.servers) {
      if (serverInstance.status === 'running') {
        try {
          const response = await serverInstance.client.request(
            ListToolsRequestSchema,
            {}
          );
          
          const tools = response.tools || [];
          
          tools.forEach(tool => {
            // Ensure we have all required properties for MCPTool
            const mcpTool: MCPTool = {
              name: tool.name,
              description: tool.description || `Tool from ${serverId}`,
              inputSchema: tool.inputSchema || {
                type: 'object',
                properties: {},
                required: []
              },
              serverId,
              cachedAt: new Date(),
              usageCount: 0
            };
            
            allTools.push(mcpTool);
          });
        } catch (error) {
          logger.warn(`⚠️ [MCP] Failed to list tools from ${serverId}:`, error);
        }
      }
    }

    return allTools;
  }

  /**
   * Call a tool on a specific server
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const serverInstance = this.servers.get(serverId);
    if (!serverInstance) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (serverInstance.status !== 'running') {
      throw new Error(`Server ${serverId} is not running (status: ${serverInstance.status})`);
    }

    try {
      const response = await serverInstance.client.request(
        CallToolRequestSchema,
        {
          name: toolName,
          arguments: args
        }
      );

      // Handle different content types
      if (Array.isArray(response.content)) {
        // Return the content array for complex responses
        return response.content;
      }
      
      return response.content;
    } catch (error) {
      logger.error(`❌ [MCP] Tool call failed on ${serverId}.${toolName}:`, error);
      throw error;
    }
  }

  /**
   * List all available prompts from all servers
   */
  async listPrompts(): Promise<Array<{
    name: string;
    description?: string;
    serverId: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
  }>> {
    const allPrompts: Array<{
      name: string;
      description?: string;
      serverId: string;
      arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
      }>;
    }> = [];

    for (const [serverId, serverInstance] of this.servers) {
      if (serverInstance.status === 'running' && serverInstance.capabilities?.prompts) {
        try {
          const response = await serverInstance.client.request(
            ListPromptsRequestSchema,
            {}
          );
          
          const prompts = response.prompts || [];
          
          prompts.forEach(prompt => {
            allPrompts.push({
              name: prompt.name,
              description: prompt.description,
              serverId,
              arguments: prompt.arguments
            });
          });
        } catch (error) {
          logger.warn(`⚠️ [MCP] Failed to list prompts from ${serverId}:`, error);
        }
      }
    }

    return allPrompts;
  }

  /**
   * Get a specific prompt
   */
  async getPrompt(serverId: string, name: string, args?: Record<string, any>): Promise<any> {
    const serverInstance = this.servers.get(serverId);
    if (!serverInstance) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (serverInstance.status !== 'running') {
      throw new Error(`Server ${serverId} is not running`);
    }

    if (!serverInstance.capabilities?.prompts) {
      throw new Error(`Server ${serverId} does not support prompts`);
    }

    try {
      const response = await serverInstance.client.request(
        GetPromptRequestSchema,
        {
          name,
          arguments: args || {}
        }
      );

      return response;
    } catch (error) {
      logger.error(`❌ [MCP] Failed to get prompt ${name} from ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * List all available resources from all servers
   */
  async listResources(): Promise<Array<{
    uri: string;
    name?: string;
    description?: string;
    mimeType?: string;
    serverId: string;
  }>> {
    const allResources: Array<{
      uri: string;
      name?: string;
      description?: string;
      mimeType?: string;
      serverId: string;
    }> = [];

    for (const [serverId, serverInstance] of this.servers) {
      if (serverInstance.status === 'running' && serverInstance.capabilities?.resources) {
        try {
          const response = await serverInstance.client.request(
            ListResourcesRequestSchema,
            {}
          );
          
          const resources = response.resources || [];
          
          resources.forEach(resource => {
            allResources.push({
              uri: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
              serverId
            });
          });
        } catch (error) {
          logger.warn(`⚠️ [MCP] Failed to list resources from ${serverId}:`, error);
        }
      }
    }

    return allResources;
  }

  /**
   * Read a specific resource
   */
  async readResource(serverId: string, uri: string): Promise<any> {
    const serverInstance = this.servers.get(serverId);
    if (!serverInstance) {
      throw new Error(`Server ${serverId} not found`);
    }

    if (serverInstance.status !== 'running') {
      throw new Error(`Server ${serverId} is not running`);
    }

    if (!serverInstance.capabilities?.resources) {
      throw new Error(`Server ${serverId} does not support resources`);
    }

    try {
      const response = await serverInstance.client.request(
        ReadResourceRequestSchema,
        { uri }
      );

      return response;
    } catch (error) {
      logger.error(`❌ [MCP] Failed to read resource ${uri} from ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Get server status with detailed information
   */
  getServerStatus(): Array<{
    name: string;
    status: string;
    startTime: Date;
    description?: string;
    capabilities?: any;
    lastError?: string;
  }> {
    return Array.from(this.servers.values()).map(server => ({
      name: server.config.name,
      status: server.status,
      startTime: server.startTime,
      description: server.config.description,
      capabilities: server.capabilities,
      lastError: server.lastError
    }));
  }

  /**
   * Restart a specific server
   */
  async restartServer(serverName: string): Promise<void> {
    const serverInstance = this.servers.get(serverName);
    if (!serverInstance) {
      throw new Error(`Server ${serverName} not found`);
    }

    logger.info(`🔄 [MCP] Restarting server: ${serverName}`);

    // Stop the server first
    if (serverInstance.status === 'running') {
      try {
        await serverInstance.client.close();
        await serverInstance.transport.close();
      } catch (error) {
        logger.warn(`⚠️ [MCP] Error closing server ${serverName}:`, error);
      }
    }

    // Remove from map
    this.servers.delete(serverName);

    // Restart with same config
    await this.startServer(serverInstance.config);
  }

  /**
   * Check if a server is healthy
   */
  async isServerHealthy(serverName: string): Promise<boolean> {
    const serverInstance = this.servers.get(serverName);
    if (!serverInstance || serverInstance.status !== 'running') {
      return false;
    }

    try {
      // Try to list tools as a health check
      await serverInstance.client.request(ListToolsRequestSchema, {});
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all healthy servers
   */
  async getHealthyServers(): Promise<string[]> {
    const healthyServers: string[] = [];

    for (const [serverName, serverInstance] of this.servers) {
      if (await this.isServerHealthy(serverName)) {
        healthyServers.push(serverName);
      }
    }

    return healthyServers;
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      logger.info('🧹 [MCP] Cleaning up MCP service...');
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Cleanup all servers
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 [MCP] Stopping all MCP servers...');

    const cleanupPromises = Array.from(this.servers.values()).map(async (serverInstance) => {
      try {
        // Close client connection
        if (serverInstance.client) {
          await serverInstance.client.close();
        }

        // Close transport
        if (serverInstance.transport) {
          await serverInstance.transport.close();
        }

        serverInstance.status = 'stopped';
        logger.info(`✅ [MCP] Server ${serverInstance.config.name} stopped`);
      } catch (error) {
        logger.error(`❌ [MCP] Failed to stop server ${serverInstance.config.name}:`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);
    this.servers.clear();
    logger.info('✅ [MCP] All MCP servers stopped');
  }

  /**
   * Add a custom server configuration
   */
  async addCustomServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      throw new Error(`Server ${config.name} already exists`);
    }

    try {
      await this.startServer(config);
    } catch (error) {
      logger.error(`❌ [MCP] Failed to add custom server ${config.name}:`, error);
      throw error;
    }
  }

  /**
   * Remove a server
   */
  async removeServer(serverName: string): Promise<void> {
    const serverInstance = this.servers.get(serverName);
    if (!serverInstance) {
      throw new Error(`Server ${serverName} not found`);
    }

    try {
      if (serverInstance.status === 'running') {
        await serverInstance.client.close();
        await serverInstance.transport.close();
      }

      this.servers.delete(serverName);
      logger.info(`✅ [MCP] Server ${serverName} removed`);
    } catch (error) {
      logger.error(`❌ [MCP] Failed to remove server ${serverName}:`, error);
      throw error;
    }
  }
}
