import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPTool, MCPServer, MCPInvokeRequest, MCPInvokeResponse } from '@olympian/shared';
import { logger } from '../utils/logger';
import { WebSocketService } from './WebSocketService';
import EventEmitter from 'events';

/**
 * Unified MCP Manager for Subproject 3
 * 
 * Simplified architecture that combines all MCP functionality:
 * - Server management
 * - Tool discovery and caching
 * - Health monitoring
 * - WebSocket notifications
 * 
 * Less is more: No separate services, no complex dependencies
 */
export class MCPManager extends EventEmitter {
  private static instance: MCPManager;
  
  // Core state
  private servers = new Map<string, {
    config: MCPServer;
    client?: Client;
    transport?: StdioClientTransport;
    tools: MCPTool[];
    lastError?: string;
    healthCheckFails: number;
  }>();
  
  // Configuration
  private readonly CONNECTION_TIMEOUT = 15000;
  private readonly HEALTH_CHECK_INTERVAL = 30000;
  private readonly MAX_HEALTH_FAILURES = 3;
  
  // Services
  private ws?: WebSocketService;
  private healthTimer?: NodeJS.Timeout;
  private initialized = false;

  private constructor() {
    super();
    this.setupCleanupHandlers();
  }

  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * Initialize with default servers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('🚀 [MCP] Initializing unified MCP manager...');

    // Get WebSocket service if available
    this.ws = WebSocketService.getInstance();
    // Updated servers for subproject 3
    const defaultServers: MCPServer[] = [
      {
        id: "github",
        name: "github",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "" },
        optional: true,
        status: "stopped"
      },
      {
        id: "met-museum",
        name: "met-museum",
        transport: "stdio",
        command: "npx",
        args: ["-y", "metmuseum-mcp"],
        optional: true,
        status: "stopped"
      },
      {
        id: "applescript_execute",
        name: "applescript_execute",
        transport: "stdio",
        command: "uv",
        args: ["--directory", "/Users/cristobalnavarro/Servers/applescript-mcp", "run", "src/applescript_mcp/server.py"],
        optional: true,
        status: "stopped"
      },
      {
        id: "nasa-mcp",
        name: "nasa-mcp",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@programcomputer/nasa-mcp-server@latest"],
        env: { NASA_API_KEY: process.env.NASA_API_KEY || "" },
        optional: true,
        status: "stopped"
      },
      {
        id: "basic-memory",
        name: "basic-memory",
        transport: "stdio",
        command: "uvx",
        args: ["basic-memory", "mcp"],
        optional: true,
        status: "stopped"
      },
      {
        id: "Context7",
        name: "Context7",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@upstash/context7-mcp"],
        optional: true,
        status: "stopped"
      }
    ];

    // Start servers
    await Promise.allSettled(
      defaultServers.map(server => this.addServer(server))
    );

    // Start health monitoring
    this.startHealthMonitoring();

    this.initialized = true;
    
    const stats = this.getStats();
    logger.info(`✅ [MCP] Initialized: ${stats.running}/${stats.total} servers running`);
  }

  /**
   * Add and start a server
   */
  async addServer(config: MCPServer): Promise<void> {
    try {
      // Initialize server state
      this.servers.set(config.id, {
        config: { ...config, status: 'initializing' },
        tools: [],
        healthCheckFails: 0
      });

      // Create transport and client
      const transport = new StdioClientTransport({
        command: config.command || 'npx',
        args: config.args || [],
        env: { ...process.env, ...config.env, MCP_TRANSPORT: 'stdio' }
      });

      const client = new Client(
        { name: 'olympian-ai', version: '1.0.0' },
        { capabilities: { tools: {}, prompts: {}, resources: {} } }
      );

      // Connect with timeout
      await this.connectWithTimeout(client, transport);

      // Update server state
      const server = this.servers.get(config.id)!;
      server.client = client;
      server.transport = transport;
      server.config.status = 'running';

      // Discover tools
      await this.refreshServerTools(config.id);

      // Notify via WebSocket
      this.broadcastUpdate('server_connected', { serverId: config.id });

      logger.info(`✅ [MCP] Server ${config.name} started successfully`);
    } catch (error) {
      const server = this.servers.get(config.id);
      if (server) {
        server.config.status = 'error';
        server.lastError = error instanceof Error ? error.message : 'Unknown error';
      }

      if (!config.optional) {
        throw error;
      }
      
      logger.warn(`⚠️ [MCP] Optional server ${config.name} failed to start: ${error}`);
    }
  }

  /**
   * Remove a server
   */
  async removeServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) return;

    try {
      if (server.client) await server.client.close();
      if (server.transport) await server.transport.close();
    } catch (error) {
      logger.warn(`⚠️ [MCP] Error closing server ${serverId}:`, error);
    }

    this.servers.delete(serverId);
    this.broadcastUpdate('server_removed', { serverId });
  }

  /**
   * List all tools from all running servers
   */
  async listTools(): Promise<MCPTool[]> {
    const tools: MCPTool[] = [];
    
    for (const [serverId, server] of this.servers) {
      if (server.config.status === 'running' && server.tools.length > 0) {
        tools.push(...server.tools);
      }
    }
    
    return tools;
  }

  /**
   * Call a tool
   */
  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    const server = this.servers.get(serverId);
    if (!server?.client) {
      throw new Error(`Server ${serverId} not available`);
    }

    try {
      const response = await server.client.callTool({
        name: toolName,
        arguments: args || {}
      });

      // Update tool usage for caching - with safe null check
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) {
        tool.usageCount = (tool.usageCount || 0) + 1;
      }

      return response.content;
    } catch (error) {
      logger.error(`❌ [MCP] Tool call failed: ${serverId}.${toolName}`, error);
      throw error;
    }
  }

  /**
   * Invoke tool with request/response format
   */
  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse> {
    const startTime = Date.now();
    
    try {
      const result = await this.callTool(
        request.serverId,
        request.toolName,
        request.arguments
      );

      return {
        success: true,
        result,
        duration: Date.now() - startTime,
        serverId: request.serverId,
        toolName: request.toolName
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
        serverId: request.serverId,
        toolName: request.toolName
      };
    }
  }

  /**
   * Get server status
   */
  getServers(): MCPServer[] {
    return Array.from(this.servers.values()).map(s => s.config);
  }

  /**
   * Get statistics
   */
  getStats(): { total: number; running: number; error: number } {
    const servers = Array.from(this.servers.values());
    return {
      total: servers.length,
      running: servers.filter(s => s.config.status === 'running').length,
      error: servers.filter(s => s.config.status === 'error').length
    };
  }

  /**
   * Refresh tools for a server
   */
  private async refreshServerTools(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server?.client) return;

    try {
      const response = await server.client.listTools();
      
      server.tools = (response.tools || []).map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {},
        serverId,
        cachedAt: new Date(),
        usageCount: 0 // Initialize usageCount
      }));

      logger.debug(`📦 [MCP] Discovered ${server.tools.length} tools for ${serverId}`);
    } catch (error) {
      logger.warn(`⚠️ [MCP] Failed to list tools for ${serverId}:`, error);
    }
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(client: Client, transport: StdioClientTransport): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.CONNECTION_TIMEOUT}ms`));
      }, this.CONNECTION_TIMEOUT);

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
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthTimer = setInterval(async () => {
      for (const [serverId, server] of this.servers) {
        if (server.config.status === 'running' && server.client) {
          try {
            // Simple health check: list tools
            await server.client.listTools();
            server.healthCheckFails = 0;
          } catch (error) {
            server.healthCheckFails++;
            
            if (server.healthCheckFails >= this.MAX_HEALTH_FAILURES) {
              logger.warn(`⚠️ [MCP] Server ${serverId} failed health checks, marking as error`);
              server.config.status = 'error';
              server.lastError = 'Health check failures';
              this.broadcastUpdate('server_error', { serverId });
            }
          }
        }
      }
    }, this.HEALTH_CHECK_INTERVAL);
  }

  /**
   * Broadcast updates via WebSocket
   */
  private broadcastUpdate(type: string, data: any): void {
    if (this.ws && typeof this.ws.broadcast === 'function') {
      this.ws.broadcast({
        type: 'mcp_update',
        data: { type, ...data },
        timestamp: new Date()
      });
    }
    
    this.emit(type, data);
  }

  /**
   * Setup cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      await this.cleanup();
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 [MCP] Cleaning up...');

    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }

    await Promise.allSettled(
      Array.from(this.servers.keys()).map(id => this.removeServer(id))
    );

    this.initialized = false;
    logger.info('✅ [MCP] Cleanup complete');
  }
}
