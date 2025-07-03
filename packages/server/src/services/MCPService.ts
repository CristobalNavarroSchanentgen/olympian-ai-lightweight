import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';

/**
 * Modern MCP Service for Subproject 3
 * 
 * Adopts the npx philosophy for MCP servers:
 * - Use npx to launch MCP servers on demand
 * - Latest version fetched automatically
 * - No persistent package management
 * - Clean, minimal Docker image
 * - Stdio transport only
 * - Simple process management
 */

interface MCPServerConfig {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  optional?: boolean;
}

interface MCPServerInstance {
  config: MCPServerConfig;
  client: Client;
  transport: StdioClientTransport;
  process: ChildProcess;
  status: 'starting' | 'running' | 'stopped' | 'error';
  startTime: Date;
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
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
      }
    },
    {
      name: 'filesystem',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/app'],
    },
    {
      name: 'memory',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
    {
      name: 'brave-search',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
      optional: true,
      env: {
        BRAVE_API_KEY: process.env.BRAVE_API_KEY || ''
      }
    },
    {
      name: 'slack',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      optional: true,
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
    const env = {
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

    // Create client
    const client = new Client(this.CLIENT_INFO, {
      capabilities: {
        tools: true,
        prompts: true,
        resources: true,
        completion: true
      }
    });

    // Get the underlying process for management
    const process = (transport as any)._process;

    // Create server instance
    const serverInstance: MCPServerInstance = {
      config,
      client,
      transport,
      process,
      status: 'starting',
      startTime: new Date()
    };

    // Store instance
    this.servers.set(config.name, serverInstance);

    try {
      // Connect to server
      await client.connect(transport);
      
      serverInstance.status = 'running';
      logger.info(`✅ [MCP] Server ${config.name} started successfully`);

      // Setup process event handlers
      if (process) {
        process.on('exit', (code) => {
          logger.info(`📤 [MCP] Server ${config.name} exited with code ${code}`);
          serverInstance.status = 'stopped';
        });

        process.on('error', (error) => {
          logger.error(`❌ [MCP] Server ${config.name} process error:`, error);
          serverInstance.status = 'error';
        });
      }

    } catch (error) {
      serverInstance.status = 'error';
      this.servers.delete(config.name);
      throw error;
    }
  }

  /**
   * List all available tools from all servers
   */
  async listTools(): Promise<Array<{ name: string; description?: string; serverId: string }>> {
    const allTools: Array<{ name: string; description?: string; serverId: string }> = [];

    for (const [serverId, serverInstance] of this.servers) {
      if (serverInstance.status === 'running') {
        try {
          const response = await serverInstance.client.listTools();
          const tools = response.tools || [];
          
          tools.forEach(tool => {
            allTools.push({
              name: tool.name,
              description: tool.description,
              serverId
            });
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
      const response = await serverInstance.client.callTool({
        name: toolName,
        arguments: args
      });

      return response.content;
    } catch (error) {
      logger.error(`❌ [MCP] Tool call failed on ${serverId}.${toolName}:`, error);
      throw error;
    }
  }

  /**
   * List all available prompts from all servers
   */
  async listPrompts(): Promise<Array<{ name: string; description?: string; serverId: string }>> {
    const allPrompts: Array<{ name: string; description?: string; serverId: string }> = [];

    for (const [serverId, serverInstance] of this.servers) {
      if (serverInstance.status === 'running') {
        try {
          const response = await serverInstance.client.listPrompts();
          const prompts = response.prompts || [];
          
          prompts.forEach(prompt => {
            allPrompts.push({
              name: prompt.name,
              description: prompt.description,
              serverId
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
   * Get server status
   */
  getServerStatus(): Array<{ name: string; status: string; startTime: Date }> {
    return Array.from(this.servers.values()).map(server => ({
      name: server.config.name,
      status: server.status,
      startTime: server.startTime
    }));
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

        // Terminate process
        if (serverInstance.process && !serverInstance.process.killed) {
          serverInstance.process.kill('SIGTERM');
          
          // Wait a bit for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Force kill if still running
          if (!serverInstance.process.killed) {
            serverInstance.process.kill('SIGKILL');
          }
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
}
