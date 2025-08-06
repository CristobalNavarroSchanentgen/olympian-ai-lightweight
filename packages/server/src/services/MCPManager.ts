import { MCPClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServer, MCPTool, MCPInvokeResult } from '@olympian/shared';
import { logger } from '../utils/logger';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

interface ServerData {
  client: MCPClient;
  server: MCPServer;
  transport?: StdioClientTransport;
  process?: ChildProcess;
  tools: MCPTool[];
}

/**
 * Simplified MCP Manager - Only supports GitHub, AppleScript, and Context7 servers
 */
export class MCPManager {
  private static instance: MCPManager;
  private servers: Map<string, ServerData> = new Map();
  private initialized = false;
  
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
    
    logger.info('🚀 [MCP] Initializing MCP manager with 3 servers...');
    
    // Only 3 servers - running in main container with npx
    const mcpServers: MCPServer[] = [
      {
        id: 'github',
        name: 'github',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { 
          GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN || ''
        },
        status: 'stopped'
      },
      {
        id: 'applescript',
        name: 'applescript',  
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-applescript'],
        status: 'stopped'
      },
      {
        id: 'context7',
        name: 'context7',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@upstash/context7-mcp'],
        env: {
          UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || '',
          UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || ''
        },
        status: 'stopped'
      }
    ];
    
    // Start all servers
    await Promise.all(mcpServers.map(server => this.addServer(server)));
    
    this.initialized = true;
    logger.info(`✅ [MCP] Initialized with ${this.servers.size} servers`);
  }
  
  /**
   * Add a server to the manager
   */
  async addServer(config: MCPServer): Promise<void> {
    try {
      logger.info(`🔄 [MCP] Adding server: ${config.name}`);
      
      const client = new MCPClient({
        name: `olympian-${config.name}`,
        version: '1.0.0'
      });
      
      // Create transport based on type
      if (config.transport === 'stdio') {
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args || [],
          env: {
            ...process.env,
            ...config.env
          }
        });
        
        await client.connect(transport);
        
        // List available tools
        const tools = await this.listServerTools(client, config.id);
        
        this.servers.set(config.id, {
          client,
          server: { ...config, status: 'running' },
          transport,
          tools
        });
        
        logger.info(`✅ [MCP] Server ${config.name} added with ${tools.length} tools`);
      }
    } catch (error) {
      logger.error(`❌ [MCP] Failed to add server ${config.name}:`, error);
      throw error;
    }
  }
  
  /**
   * List tools from a specific server
   */
  private async listServerTools(client: MCPClient, serverId: string): Promise<MCPTool[]> {
    try {
      const response = await client.listTools();
      const tools: MCPTool[] = response.tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {}
      }));
      
      logger.info(`📋 [MCP] Server ${serverId} has ${tools.length} tools`);
      return tools;
    } catch (error) {
      logger.error(`❌ [MCP] Failed to list tools for ${serverId}:`, error);
      return [];
    }
  }
  
  /**
   * Invoke a tool on a specific server
   */
  async invokeTool(params: {
    serverId: string;
    toolName: string;
    arguments: any;
  }): Promise<MCPInvokeResult> {
    const startTime = Date.now();
    
    try {
      const serverData = this.servers.get(params.serverId);
      if (!serverData) {
        throw new Error(`Server ${params.serverId} not found`);
      }
      
      logger.info(`🔧 [MCP] Invoking ${params.toolName} on ${params.serverId}`);
      
      const result = await serverData.client.callTool({
        name: params.toolName,
        arguments: params.arguments
      });
      
      const duration = Date.now() - startTime;
      
      logger.info(`✅ [MCP] Tool ${params.toolName} completed in ${duration}ms`);
      
      return {
        success: true,
        result: result.content,
        duration,
        serverId: params.serverId,
        toolName: params.toolName
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      
      logger.error(`❌ [MCP] Tool invocation failed:`, error);
      
      return {
        success: false,
        error: error.message || 'Unknown error',
        duration,
        serverId: params.serverId,
        toolName: params.toolName
      };
    }
  }
  
  /**
   * List all available tools from all servers
   */
  async listTools(): Promise<MCPTool[]> {
    const allTools: MCPTool[] = [];
    
    for (const [serverId, serverData] of this.servers) {
      // Add server prefix to tool names for namespacing
      const namespacedTools = serverData.tools.map(tool => ({
        ...tool,
        name: `${serverId}.${tool.name}`,
        description: `[${serverId}] ${tool.description}`
      }));
      allTools.push(...namespacedTools);
    }
    
    return allTools;
  }
  
  /**
   * Get all servers
   */
  getServers(): Map<string, ServerData> {
    return this.servers;
  }
  
  /**
   * Get server statistics
   */
  getStats(): {
    totalServers: number;
    runningServers: number;
    totalTools: number;
    serverDetails: Array<{
      id: string;
      name: string;
      status: string;
      toolCount: number;
    }>;
  } {
    const serverDetails = Array.from(this.servers.entries()).map(([id, data]) => ({
      id,
      name: data.server.name,
      status: data.server.status,
      toolCount: data.tools.length
    }));
    
    return {
      totalServers: this.servers.size,
      runningServers: serverDetails.filter(s => s.status === 'running').length,
      totalTools: serverDetails.reduce((sum, s) => sum + s.toolCount, 0),
      serverDetails
    };
  }
  
  /**
   * Stop a specific server
   */
  async stopServer(serverId: string): Promise<void> {
    const serverData = this.servers.get(serverId);
    if (!serverData) {
      logger.warn(`Server ${serverId} not found`);
      return;
    }
    
    try {
      await serverData.client.close();
      serverData.server.status = 'stopped';
      logger.info(`🛑 [MCP] Server ${serverId} stopped`);
    } catch (error) {
      logger.error(`❌ [MCP] Failed to stop server ${serverId}:`, error);
    }
  }
  
  /**
   * Restart a server
   */
  async restartServer(serverId: string): Promise<void> {
    await this.stopServer(serverId);
    
    const serverData = this.servers.get(serverId);
    if (serverData) {
      await this.addServer(serverData.server);
    }
  }
  
  /**
   * Cleanup all servers
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 [MCP] Cleaning up all servers...');
    
    for (const serverId of this.servers.keys()) {
      await this.stopServer(serverId);
    }
    
    this.servers.clear();
    this.initialized = false;
    
    logger.info('✅ [MCP] All servers cleaned up');
  }
}
