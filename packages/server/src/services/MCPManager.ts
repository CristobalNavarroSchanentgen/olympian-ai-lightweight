import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPTool, MCPResource, MCPServer, MCPServerStatus } from '@olympian/shared';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ServerProcess {
  id: string;
  name: string;  process: ChildProcess;
  client: Client;
  transport: StdioClientTransport;
  status: "running" | "stopped" | "error";
  tools: MCPTool[];
  resources?: MCPResource[];
}
/**
 * MCPManager - Streamlined to support only 3 MCP servers
 * GitHub, AppleScript, and Context7
 */
export class MCPManager {
  private static instance: MCPManager;
  private servers: Map<string, ServerProcess> = new Map();
  private tools: Map<string, MCPTool[]> = new Map();
  private initialized = false;

  private constructor() {
    logger.info('🚀 [MCP] Manager instantiated');
  }

  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  /**
   * Initialize with only 3 required MCP servers
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    logger.info("🚀 [MCP] Initializing MCP manager...");
    
    // Build server list based on available credentials
    // Build server list based on available credentials
    const mcpServers: MCPServer[] = [];
    
    // Only add GitHub server if token is provided and not a placeholder
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    if (githubToken && githubToken !== '' && !githubToken.includes('your_')) {
      mcpServers.push({
        id: "github",
        name: "github",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: {
          GITHUB_PERSONAL_ACCESS_TOKEN: githubToken
        },
        status: "stopped"
      });
      logger.info('✅ [MCP] GitHub server configured');
    } else {
      logger.warn('⚠️ [MCP] GitHub server skipped - no valid token');
    }
    
    // Always add AppleScript server (no credentials needed)
    mcpServers.push({
      id: "applescript",
      name: "applescript",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@sampullman/applescript-mcp"],
      env: {},
      status: "stopped"
    });
    logger.info('✅ [MCP] AppleScript server configured');
    
    // Always add Context7 server (no credentials required)
    mcpServers.push({
      id: "context7",
      name: "context7",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      env: {},
      status: "stopped"
    });
    logger.info('✅ [MCP] Context7 server configured');
    
    if (mcpServers.length === 0) {
      logger.warn('⚠️ [MCP] No servers configured - this should not happen');
      this.initialized = true;
      return;
    }

































    
    // Start all servers
    const results = await Promise.allSettled(
      mcpServers.map(server => this.addServer(server))
    );
    
    // Log results
    results.forEach((result, index) => {
      const server = mcpServers[index];
      if (result.status === 'rejected') {
        logger.error(`❌ [MCP] Failed to start ${server.name}: ${result.reason}`);
      } else {
        logger.info(`✅ [MCP] Started ${server.name}`);
      }
    });
    
    this.initialized = true;
    logger.info(`✅ [MCP] Initialized with ${this.servers.size} servers`);
  }

  /**
   * Add and start a server
   */
  async addServer(config: MCPServer): Promise<void> {
    const { id, name, command, args = [], env = {} } = config;
    
    if (this.servers.has(id)) {
      logger.warn(`[MCP] Server ${id} already exists`);
      return;
    }

    // Check for placeholder credentials
    if (config.env) {
      const hasPlaceholder = Object.values(config.env).some(val =>
        typeof val === "string" && (val.includes("your_") || val === "" || val === "undefined")
      );
      if (hasPlaceholder) {
        logger.warn(`[MCP] Skipping ${name} - missing or placeholder credentials`);
        return;
      }
    }

    logger.info(`[MCP] Starting server: ${name}`);

    try {
      // Spawn the server process
      const serverEnv = { ...process.env, ...env };
      const serverProcess = spawn(command, args, {
        env: serverEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      // Create transport
      const transport = new StdioClientTransport({
        child: serverProcess
      } as any);      const client = new Client(
        {
          name: `olympian-${id}`,
          version: '1.0.0'
        },
        {
          capabilities: {
            tools: {},
            resources: {}
          }
        }
      );

      // Handle process errors
      serverProcess.on('error', (error) => {
        logger.error(`[MCP] Server ${name} process error:`, error);
        this.servers.delete(id);
      });

      serverProcess.on('exit', (code) => {
        logger.info(`[MCP] Server ${name} exited with code ${code}`);
        this.servers.delete(id);
      });

      // Connect client
      await client.connect(transport);

      // List available tools
      const toolsResponse = await client.listTools();
      const tools: MCPTool[] = toolsResponse.tools.map(tool => ({
        serverId: id,
        name: tool.name,
        description: tool.description || "No description",
        inputSchema: tool.inputSchema as any
      }));
      logger.info(`[MCP] Server ${name} connected with ${tools.length} tools`);

      // Store tools in separate map
      this.tools.set(id, tools);
      // Store server info
      this.servers.set(id, {
        id,
        name,
        process: serverProcess,
        client,
        transport,
        status: "running",
        tools
      });
    } catch (error) {
      logger.error(`[MCP] Failed to start server ${name}:`, error);
      logger.error("Failed to start server: ", error);
    }
  }

  /**
   * Stop a server
   */
  async stopServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server) {
      logger.warn(`[MCP] Server ${id} not found`);
      return;
    }

    try {
      await server.client.close();
      server.process.kill();
      this.servers.delete(id);
      logger.info(`[MCP] Server ${id} stopped`);
    } catch (error) {
      logger.error(`[MCP] Error stopping server ${id}:`, error);
      server.process.kill('SIGKILL');
      this.servers.delete(id);
    }
  }

  /**
   * List all tools from all servers
   */
  async listTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    for (const [serverId, server] of this.servers) {
      if (server.status === 'running') {
        allTools.push(...server.tools);
      }
    }
    
    return allTools;
  }

  /**
   * Invoke a tool
   */
  async invokeTool(params: {
    serverId: string;
    toolName: string;
    arguments: any;
  }): Promise<{
    success: boolean;
    result?: any;
    error?: string;
  }> {
    const server = this.servers.get(params.serverId);
    
    if (!server) {
      return {
        success: false,
        error: `Server ${params.serverId} not found`
      };
    }

    if (server.status !== 'running') {
      return {
        success: false,
        error: `Server ${params.serverId} is not running`
      };
    }

    try {
      const result = await server.client.callTool({
        name: params.toolName,
        arguments: params.arguments
      });

      return {
        success: true,
        result: result.content
      };
    } catch (error: any) {
      logger.error(`[MCP] Tool invocation failed:`, error);
      return {
        success: false,
        error: error.message || 'Tool invocation failed'
      };
    }
  }

  /**
   * Get server status
   */
  getServerStatus(id: string): MCPServerStatus {
    const server = this.servers.get(id);
    if (!server) {
      return {
        id,
        name: "unknown",
        status: "stopped",
        tools: 0
      };
    }
    return {
      id,
      name: server.name || "unknown",
      status: server.status,
      tools: this.tools.get(id)?.length || 0
    };  }

  /**
   * Get all servers
   */
  getServers(): Map<string, ServerProcess> {
    return this.servers;
  }

  /**
   * Get stats
   */
  getStats(): {
    totalServers: number;
    runningServers: number;
    totalTools: number;
  } {
    let runningServers = 0;
    let totalTools = 0;

    for (const server of this.servers.values()) {
      if (server.status === 'running') {
        runningServers++;
        totalTools += server.tools.length;
      }
    }

    return {
      totalServers: this.servers.size,
      runningServers,
      totalTools
    };
  }

  /**
   * Shutdown all servers
   */
  async shutdown(): Promise<void> {
    logger.info('[MCP] Shutting down all servers...');
    
    const stopPromises = Array.from(this.servers.keys()).map(id => 
      this.stopServer(id)
    );
    
    await Promise.allSettled(stopPromises);
    
    this.servers.clear();
    this.initialized = false;
    
    logger.info('[MCP] All servers shut down');
  }

  /**
   * Restart a server
   */
  async restartServer(id: string, config: MCPServer): Promise<void> {
    await this.stopServer(id);
    await this.addServer(config);
  }

  /**
   * Health check for all servers
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const health = new Map<string, boolean>();
    
    for (const [id, server] of this.servers) {
      try {
        // Try to list tools as a health check
        await server.client.listTools();
        health.set(id, true);
      } catch (error) {
        health.set(id, false);
        logger.warn(`[MCP] Health check failed for ${id}`);
      }
    }
    
    return health;
  }

  /**
   * Call a tool (alias for invokeTool for compatibility)
   */
  async callTool(params: {
    serverId: string;
    toolName: string;
    arguments: any;
  }): Promise<any> {
    return this.invokeTool(params);
  }

  /**
   * Remove a server (alias for stopServer for compatibility)
   */
  async removeServer(id: string): Promise<void> {
    return this.stopServer(id);
  }

  /**
   * Get status of all servers
   */
  getStatus(): {
    totalServers: number;
    runningServers: number;
    totalTools: number;
    servers?: any;
    running?: number;
    total?: number;
  } {
    const runningServers = Array.from(this.servers.values()).filter(s => s.status === 'running').length;
    const totalTools = Array.from(this.tools.values()).reduce((sum, tools) => sum + tools.length, 0);
    
    return {
      totalServers: this.servers.size,
      runningServers,
      totalTools,
      servers: Array.from(this.servers.entries()).map(([id, server]) => ({
        id,
        status: server.status,
        tools: this.tools.get(id)?.length || 0
      })),
      // Legacy properties for compatibility
      running: runningServers,
      total: this.servers.size
    };
  }
}
