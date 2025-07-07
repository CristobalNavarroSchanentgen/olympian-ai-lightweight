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
 * 
 * IMPROVED: Enhanced error isolation and resilience
 * - All servers are optional by default to prevent blocking model availability
 * - Better error containment and recovery
 * - More detailed error reporting
 */

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  optional?: boolean;
  description?: string;
  retryCount?: number;
  retryDelay?: number;
}

interface MCPServerInstance {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport;
  status: 'starting' | 'running' | 'stopped' | 'error' | 'failed';
  startTime: Date;
  capabilities?: {
    tools?: boolean;
    prompts?: boolean;
    resources?: boolean;
    completion?: boolean;
  };
  lastError?: string;
  failureCount: number;
  lastFailureTime?: Date;
}

export class MCPService {
  private servers: Map<string, MCPServerInstance> = new Map();
  private readonly CLIENT_INFO = {
    name: 'olympian-ai-subproject3',
    version: '1.0.0'
  };
  
  // IMPROVED: Make connection timeout configurable
  private readonly CONNECTION_TIMEOUT = parseInt(process.env.MCP_CONNECTION_TIMEOUT || '15000');
  private readonly RETRY_DELAY = parseInt(process.env.MCP_RETRY_DELAY || '5000');
  private readonly MAX_RETRIES = parseInt(process.env.MCP_MAX_RETRIES || '3');

  /**
   * Default MCP server configuration following npx philosophy
   * IMPROVED: All servers are now optional by default to prevent blocking
   */
  private readonly DEFAULT_SERVERS: MCPServerConfig[] = [
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      description: 'GitHub API integration for repositories, issues, and PRs',
      optional: true, // IMPROVED: Made optional by default
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
      }
    },
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/app'],
      description: 'File system access within the container',
      optional: true, // IMPROVED: Made optional by default
    },
    {
      name: 'memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
      description: 'In-memory key-value storage',
      optional: true, // IMPROVED: Made optional by default
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
   * IMPROVED: Better error handling and reporting
   */
  async initialize(): Promise<void> {
    logger.info('🚀 [MCP] Initializing modern MCP service (npx-based) with enhanced error isolation...');
    logger.info(`⚙️  [MCP] Configuration: CONNECTION_TIMEOUT=${this.CONNECTION_TIMEOUT}ms, MAX_RETRIES=${this.MAX_RETRIES}`);

    // Setup cleanup handlers
    this.setupCleanupHandlers();

    // Start all servers with better error isolation
    await this.startServers();

    const serverStatus = this.getServerStatus();
    const runningCount = serverStatus.filter(s => s.status === 'running').length;
    const failedCount = serverStatus.filter(s => s.status === 'error' || s.status === 'failed').length;

    logger.info(`✅ [MCP] Modern MCP service initialized: ${runningCount}/${this.DEFAULT_SERVERS.length} servers running`);
    
    if (failedCount > 0) {
      logger.warn(`⚠️  [MCP] ${failedCount} servers failed to start. Check logs for details.`);
      logger.warn(`⚠️  [MCP] Failed servers:`, serverStatus.filter(s => s.status === 'error' || s.status === 'failed').map(s => ({
        name: s.name,
        error: s.lastError
      })));
    }
  }

  /**
   * Start all MCP servers using npx
   * IMPROVED: Better error isolation and parallel startup
   */
  private async startServers(): Promise<void> {
    const startPromises = this.DEFAULT_SERVERS.map(async (config) => {
      try {
        await this.startServerWithRetry(config);
      } catch (error) {
        // IMPROVED: Log error but continue with other servers
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`❌ [MCP] Server ${config.name} failed after ${this.MAX_RETRIES} retries: ${errorMsg}`);
        
        // Still track the failed server in the map
        this.servers.set(config.name, {
          config,
          client: null as any,
          transport: null as any,
          status: 'failed',
          startTime: new Date(),
          lastError: errorMsg,
          failureCount: this.MAX_RETRIES,
          lastFailureTime: new Date()
        });
      }
    });

    // IMPROVED: Use allSettled to ensure all promises complete
    const results = await Promise.allSettled(startPromises);
    
    // Log summary of results
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    logger.info(`📊 [MCP] Server startup complete: ${succeeded} succeeded, ${failed} failed`);
  }

  /**
   * IMPROVED: Start a server with retry logic
   */
  private async startServerWithRetry(config: MCPServerConfig, retryCount = 0): Promise<void> {
    try {
      await this.startServer(config);
    } catch (error) {
      if (retryCount < this.MAX_RETRIES && config.optional) {
        logger.warn(`⚠️  [MCP] Server ${config.name} failed to start (attempt ${retryCount + 1}/${this.MAX_RETRIES}), retrying in ${this.RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.startServerWithRetry(config, retryCount + 1);
      }
      throw error;
    }
  }

  /**
   * Start a single MCP server
   * IMPROVED: Better error handling and process isolation
   */
  private async startServer(config: MCPServerConfig): Promise<void> {
    logger.info(`🚀 [MCP] Starting server: ${config.name} (optional: ${config.optional})`);

    // Prepare environment
    const env: Record<string, string> = {};
    
    // Copy process.env safely
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    
    // Add server-specific env
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        if (value !== undefined) {
          env[key] = value;
        }
      }
    }
    
    env.MCP_TRANSPORT = 'stdio';

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
      startTime: new Date(),
      failureCount: 0
    };

    // Store instance
    this.servers.set(config.name, serverInstance);

    try {
      // Connect to server with timeout
      await this.connectWithTimeout(client, transport, this.CONNECTION_TIMEOUT);
      
      serverInstance.status = 'running';
      
      // Get server capabilities after connection
      serverInstance.capabilities = await this.getServerCapabilities(client);
      
      logger.info(`✅ [MCP] Server ${config.name} started successfully with capabilities:`, serverInstance.capabilities);

      // Setup error handling for transport
      transport.onerror = (error) => {
        logger.error(`❌ [MCP] Server ${config.name} transport error:`, error);
        serverInstance.status = 'error';
        serverInstance.lastError = error.message;
        serverInstance.failureCount++;
        serverInstance.lastFailureTime = new Date();
      };

      transport.onclose = () => {
        logger.info(`📤 [MCP] Server ${config.name} connection closed`);
        serverInstance.status = 'stopped';
      };

    } catch (error) {
      serverInstance.status = 'error';
      serverInstance.lastError = error instanceof Error ? error.message : 'Unknown error';
      serverInstance.failureCount++;
      serverInstance.lastFailureTime = new Date();
      
      // IMPROVED: Only remove from map if it's a required server
      if (!config.optional) {
        this.servers.delete(config.name);
      }
      
      throw error;
    }
  }

  /**
   * Connect with timeout
   * IMPROVED: Better error messages
   */
  private async connectWithTimeout(client: Client, transport: StdioClientTransport, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${timeout}ms - server may be unavailable or slow to start`));
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
   * IMPROVED: Better error handling
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
      logger.warn(`⚠️  [MCP] Failed to get server capabilities:`, error);
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
   * IMPROVED: Only query running servers
   */
  async listTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];

    for (const [serverId, serverInstance] of this.servers) {
      if (serverInstance.status === 'running') {
        try {
          const response = await serverInstance.client.listTools();
          
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
          // IMPROVED: Update server status if it's failing
          if (serverInstance.failureCount++ > 3) {
            serverInstance.status = 'error';
            serverInstance.lastError = 'Multiple tool listing failures';
            serverInstance.lastFailureTime = new Date();
          }
        }
      }
    }

    return allTools;
  }

  /**
   * Call a tool on a specific server
   * IMPROVED: Better error messages
   */
  async callTool(serverId: string, toolName: string, args: Record<string, any>): Promise<any> {
    const serverInstance = this.servers.get(serverId);
    if (!serverInstance) {
      throw new Error(`Server ${serverId} not found. Available servers: ${Array.from(this.servers.keys()).join(', ')}`);
    }

    if (serverInstance.status !== 'running') {
      throw new Error(`Server ${serverId} is not running (status: ${serverInstance.status}). ${serverInstance.lastError ? `Last error: ${serverInstance.lastError}` : ''}`);
    }

    try {
      const response = await serverInstance.client.callTool({
        name: toolName,
        arguments: args
      });

      // Handle different content types
      if (Array.isArray(response.content)) {
        // Return the content array for complex responses
        return response.content;
      }
      
      return response.content;
    } catch (error) {
      logger.error(`❌ [MCP] Tool call failed on ${serverId}.${toolName}:`, error);
      // IMPROVED: Track failures
      serverInstance.failureCount++;
      serverInstance.lastFailureTime = new Date();
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
          const response = await serverInstance.client.listPrompts();
          
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
      const response = await serverInstance.client.getPrompt({
        name,
        arguments: args || {}
      });

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
          const response = await serverInstance.client.listResources();
          
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
      const response = await serverInstance.client.readResource({ uri });

      return response;
    } catch (error) {
      logger.error(`❌ [MCP] Failed to read resource ${uri} from ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Get server status with detailed information
   * IMPROVED: More detailed status reporting
   */
  getServerStatus(): Array<{
    name: string;
    status: string;
    startTime: Date;
    description?: string;
    capabilities?: any;
    lastError?: string;
    failureCount?: number;
    lastFailureTime?: Date;
  }> {
    return Array.from(this.servers.values()).map(server => ({
      name: server.config.name,
      status: server.status,
      startTime: server.startTime,
      description: server.config.description,
      capabilities: server.capabilities,
      lastError: server.lastError,
      failureCount: server.failureCount,
      lastFailureTime: server.lastFailureTime
    }));
  }

  /**
   * Restart a specific server
   * IMPROVED: Better error handling
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
    try {
      await this.startServerWithRetry(serverInstance.config);
    } catch (error) {
      logger.error(`❌ [MCP] Failed to restart server ${serverName}:`, error);
      throw error;
    }
  }

  /**
   * Check if a server is healthy
   * IMPROVED: More comprehensive health check
   */
  async isServerHealthy(serverName: string): Promise<boolean> {
    const serverInstance = this.servers.get(serverName);
    if (!serverInstance || serverInstance.status !== 'running') {
      return false;
    }

    // Check if there have been recent failures
    if (serverInstance.failureCount > 0 && serverInstance.lastFailureTime) {
      const timeSinceFailure = Date.now() - serverInstance.lastFailureTime.getTime();
      // Consider unhealthy if failed in the last minute
      if (timeSinceFailure < 60000) {
        return false;
      }
    }

    try {
      // Try to list tools as a health check
      await serverInstance.client.listTools();
      return true;
    } catch (error) {
      logger.warn(`⚠️  [MCP] Health check failed for ${serverName}:`, error);
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
   * IMPROVED: Don't exit process from cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      logger.info('🧹 [MCP] Cleaning up MCP service...');
      await this.cleanup();
    };

    // IMPROVED: Only register cleanup, don't exit process
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Cleanup all servers
   * IMPROVED: More graceful cleanup
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 [MCP] Stopping all MCP servers...');

    const cleanupPromises = Array.from(this.servers.values()).map(async (serverInstance) => {
      try {
        // Set status to stopping
        serverInstance.status = 'stopped';
        
        // Close client connection
        if (serverInstance.client) {
          await serverInstance.client.close().catch(err => 
            logger.warn(`⚠️  [MCP] Error closing client for ${serverInstance.config.name}:`, err)
          );
        }

        // Close transport
        if (serverInstance.transport) {
          await serverInstance.transport.close().catch(err => 
            logger.warn(`⚠️  [MCP] Error closing transport for ${serverInstance.config.name}:`, err)
          );
        }

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
      await this.startServerWithRetry(config);
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

  /**
   * IMPROVED: Get a summary of the service health
   */
  getHealthSummary(): {
    totalServers: number;
    runningServers: number;
    failedServers: number;
    stoppedServers: number;
    healthPercentage: number;
    issues: Array<{ server: string; error: string }>;
  } {
    const status = this.getServerStatus();
    const running = status.filter(s => s.status === 'running').length;
    const failed = status.filter(s => s.status === 'error' || s.status === 'failed').length;
    const stopped = status.filter(s => s.status === 'stopped').length;
    
    const issues = status
      .filter(s => s.lastError)
      .map(s => ({ server: s.name, error: s.lastError! }));

    return {
      totalServers: status.length,
      runningServers: running,
      failedServers: failed,
      stoppedServers: stopped,
      healthPercentage: status.length > 0 ? Math.round((running / status.length) * 100) : 0,
      issues
    };
  }
}
