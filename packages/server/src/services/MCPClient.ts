import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { MCPServer, MCPTool, MCPInvokeRequest, MCPInvokeResponse } from '@olympian/shared';
import { logger } from '../utils/logger';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';

interface ToolListResponse {
  tools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
  }>;
}

interface ToolCallResponse {
  content?: unknown;
}

// Zod schemas for MCP responses
const toolListResponseSchema = z.object({
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.record(z.unknown()).optional()
  })).optional()
});

const toolCallResponseSchema = z.object({
  content: z.unknown().optional()
});

export class MCPClientService {
  private clients: Map<string, Client> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private servers: Map<string, MCPServer> = new Map();
  private configPath: string;

  constructor() {
    this.configPath = path.join(os.homedir(), '.olympian-ai-lite', 'mcp_config.json');
  }

  async initialize(): Promise<void> {
    // Ensure config directory exists
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    
    // Load saved configuration
    await this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (config.servers) {
        for (const server of config.servers) {
          this.servers.set(server.id, server);
          // Auto-start servers marked as running
          if (server.status === 'running') {
            await this.startServer(server.id).catch(error => {
              logger.error(`Failed to auto-start server ${server.id}:`, error);
            });
          }
        }
      }
    } catch (error) {
      logger.debug('No existing MCP config found, starting fresh');
    }
  }

  private async saveConfig(): Promise<void> {
    const config = {
      version: '1.0',
      servers: Array.from(this.servers.values()),
      lastModified: new Date(),
    };
    
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async addServer(server: Omit<MCPServer, 'id' | 'status'>): Promise<MCPServer> {
    const id = `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newServer: MCPServer = {
      ...server,
      id,
      status: 'stopped',
    };
    
    this.servers.set(id, newServer);
    await this.saveConfig();
    
    return newServer;
  }

  async removeServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    // Stop the server if running
    if (server.status === 'running') {
      await this.stopServer(serverId);
    }
    
    this.servers.delete(serverId);
    await this.saveConfig();
  }

  async startServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    if (server.status === 'running') {
      return; // Already running
    }
    
    try {
      if (server.transport === 'stdio') {
        await this.startStdioServer(server);
      } else if (server.transport === 'http') {
        await this.startHttpServer(server);
      }
      
      server.status = 'running';
      server.lastError = undefined;
      await this.saveConfig();
    } catch (error) {
      server.status = 'error';
      server.lastError = error instanceof Error ? error.message : 'Unknown error';
      await this.saveConfig();
      throw error;
    }
  }

  private async startStdioServer(server: MCPServer): Promise<void> {
    const childProcess = spawn(server.command, server.args || [], {
      env: { ...process.env, ...server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    const transport = new StdioClientTransport({
      command: server.command,
      args: server.args,
      env: server.env,
    });
    
    const client = new Client({
      name: `olympian-client-${server.id}`,
      version: '1.0.0',
    }, {
      capabilities: {},
    });
    
    await client.connect(transport);
    
    this.processes.set(server.id, childProcess);
    this.clients.set(server.id, client);
    
    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      logger.info(`MCP server ${server.id} exited with code ${code}, signal ${signal}`);
      this.handleServerExit(server.id);
    });
  }

  private async startHttpServer(server: MCPServer): Promise<void> {
    // HTTP transport would be implemented here
    throw new Error('HTTP transport not yet implemented');
  }

  async stopServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }
    
    const client = this.clients.get(serverId);
    if (client) {
      await client.close();
      this.clients.delete(serverId);
    }
    
    const process = this.processes.get(serverId);
    if (process) {
      process.kill();
      this.processes.delete(serverId);
    }
    
    server.status = 'stopped';
    await this.saveConfig();
  }

  private async handleServerExit(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'stopped';
      this.clients.delete(serverId);
      this.processes.delete(serverId);
      await this.saveConfig();
    }
  }

  async listTools(serverId: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverId);
    if (!client) {
      throw new Error(`Server ${serverId} not running`);
    }
    
    const response = await client.request(
      { method: 'tools/list' },
      toolListResponseSchema
    );
    
    const tools = response.tools || [];
    
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description || '',
      inputSchema: tool.inputSchema || {},
      serverId,
    }));
  }

  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse> {
    const client = this.clients.get(request.serverId);
    if (!client) {
      throw new Error(`Server ${request.serverId} not running`);
    }
    
    const startTime = Date.now();
    
    try {
      const response = await client.request(
        { method: 'tools/call', params: { name: request.toolName, arguments: request.arguments } },
        toolCallResponseSchema
      );
      
      return {
        success: true,
        result: response.content,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      };
    }
  }

  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  async shutdown(): Promise<void> {
    // Stop all running servers
    for (const serverId of this.servers.keys()) {
      try {
        await this.stopServer(serverId);
      } catch (error) {
        logger.error(`Failed to stop server ${serverId} during shutdown:`, error);
      }
    }
  }
}