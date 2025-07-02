import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { 
  MCPServer, 
  MCPTool, 
  MCPInvokeRequest, 
  MCPInvokeResponse, 
  MCPProtocolNegotiation,
  MCPSession,
  MCPArgumentValidation,
  MCPMetrics,
  MCPEvent,
  MCPEventHandler,
  MCPError,
  MCPErrorType
} from '@olympian/shared';

import { logger } from '../utils/logger';
import { MCPConfigParserStdio } from './MCPConfigParserStdio';
import { MCPHealthChecker } from './MCPHealthChecker';
import { MCPToolCache } from './MCPToolCache';

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { z } from 'zod';
import EventEmitter from 'events';

// Validation schemas for MCP responses
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

/**
 * Stdio-based MCP Client Service for subproject 3
 * 
 * This implementation runs all MCP servers as child processes within the main container:
 * 1. Stdio transport (stdin/stdout communication)
 * 2. Child process management for MCP servers
 * 3. Process lifecycle management (start/stop/restart)
 * 4. Tool discovery and caching
 * 5. Health checking and fallback strategies
 * 6. Self-contained execution (no external dependencies)
 */
export class MCPClientStdio extends EventEmitter {
  private static instance: MCPClientStdio;
  
  private clients: Map<string, Client> = new Map();
  private servers: Map<string, MCPServer> = new Map();
  private sessions: Map<string, MCPSession> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private configPath: string;
  private initialized: boolean = false;

  // Core services
  private configParser: MCPConfigParserStdio;
  private healthChecker: MCPHealthChecker;
  private toolCache: MCPToolCache;

  // Deployment mode - enforced stdio for subproject 3
  private readonly isStdioMode: boolean = true;

  // Metrics and monitoring
  private metrics: MCPMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    averageResponseTime: 0,
    cacheHitRate: 0,
    uptime: 0,
    activeConnections: 0,
    serverMetrics: {},
    requestsPerMinute: 0,
    errorsPerMinute: 0,
    lastUpdated: new Date()
  };

  private startTime: Date = new Date();
  private recentRequests: { timestamp: Date; success: boolean }[] = [];

  // Configuration
  private readonly CLIENT_INFO = {
    name: 'olympian-stdio-client',
    version: '1.0.0'
  };

  private readonly PROTOCOL_VERSION = '2024-11-05';
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_BASE = 1000; // 1 second
  private readonly CONNECTION_TIMEOUT = 30000; // 30 seconds

  private constructor() {
    super();
    this.setMaxListeners(50);
    
    // Enforce stdio deployment mode for subproject 3
    this.isStdioMode = true;
    
    this.configPath = path.join(os.homedir(), '.olympian-ai-lite', 'mcp_config.stdio.json');
    
    // Initialize services
    this.configParser = MCPConfigParserStdio.getInstance();
    this.healthChecker = MCPHealthChecker.getInstance();
    this.toolCache = MCPToolCache.getInstance();

    // Set up event listeners
    this.setupEventListeners();
    this.setupProcessHandlers();

    logger.info('🌐 [MCP Client] Initialized in stdio mode - child process transport');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MCPClientStdio {
    if (!MCPClientStdio.instance) {
      MCPClientStdio.instance = new MCPClientStdio();
    }
    return MCPClientStdio.instance;
  }

  /**
   * Initialize MCP client service with provided servers
   */
  async initialize(servers?: MCPServer[]): Promise<void> {
    if (this.initialized) {
      logger.warn('⚠️ [MCP Client] Already initialized, skipping...');
      return;
    }

    logger.info('🚀 [MCP Client] Initializing stdio MCP client service...');

    try {
      // Ensure config directory exists
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });

      // Step 1: Load provided servers or discover from config
      if (servers && servers.length > 0) {
        logger.info(`📋 [MCP Client] Using provided servers: ${servers.length} servers`);
        for (const server of servers) {
          // Validate transport for stdio mode
          if (server.transport !== 'stdio') {
            logger.warn(`⚠️ [MCP Client] Rejecting non-stdio server ${server.name} in stdio mode`);
            continue;
          }
          this.servers.set(server.id, server);
        }
      } else {
        // Step 1: Parse configuration and discover endpoints
        logger.info('📖 [MCP Client] Parsing stdio configuration...');
        await this.configParser.parseConfiguration();

        // Step 2: Load saved server configurations
        await this.loadConfig();

        // Step 3: Create servers from discovered endpoints (stdio-only)
        const discoveredServers = await this.configParser.createServersFromConfig();
        for (const server of discoveredServers) {
          this.servers.set(server.id, server);
        }
      }

      // Step 4: Initialize health checker
      logger.info('🏥 [MCP Client] Initializing health checker...');
      await this.healthChecker.initialize(Array.from(this.servers.values()));

      // Step 5: Start server processes and establish connections
      await this.startServerProcesses();

      // Step 6: Initialize tool cache with connected clients
      logger.info('🗄️ [MCP Client] Initializing tool cache...');
      await this.toolCache.initialize(this.clients);

      // Step 7: Start monitoring and maintenance
      this.startMonitoring();

      this.initialized = true;
      logger.info(`✅ [MCP Client] Stdio MCP client initialized: ${this.clients.size} active stdio connections`);

    } catch (error) {
      logger.error('❌ [MCP Client] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Start all server processes and establish stdio connections
   */
  private async startServerProcesses(): Promise<void> {
    logger.info('🚀 [MCP Client] Starting MCP server processes...');

    const connectionPromises = Array.from(this.servers.values()).map(async server => {
      try {
        await this.startServerProcess(server);
      } catch (error) {
        logger.warn(`⚠️ [MCP Client] Failed to start ${server.name}:`, error);
        server.status = 'error';
        server.lastError = error instanceof Error ? error.message : 'Process start failed';
      }
    });

    await Promise.allSettled(connectionPromises);

    const connectedCount = Array.from(this.servers.values()).filter(s => s.status === 'running').length;
    logger.info(`🎯 [MCP Client] Started ${connectedCount}/${this.servers.size} stdio server processes`);
  }

  /**
   * Start a specific MCP server process with stdio transport
   */
  private async startServerProcess(server: MCPServer): Promise<void> {
    logger.debug(`🚀 [MCP Client] Starting server process ${server.name}...`);

    server.status = 'initializing';

    try {
      // Create stdio transport with command and args (corrected implementation)
      const transport = new StdioClientTransport({
        command: server.command || 'npx',
        args: server.args || []
      });

      // Create MCP client with capabilities
      const client = new Client(
        this.CLIENT_INFO,
        {
          capabilities: {
            tools: true,
            prompts: true,
            resources: true,
            completion: true
          }
        }
      );

      // Connect with timeout
      await this.connectWithTimeout(client, transport, server);

      // Perform protocol negotiation
      const negotiation = await this.negotiateProtocol(client, server);
      server.protocolVersion = negotiation.serverVersion;
      server.capabilities = negotiation.capabilities;

      // Store client and update server status
      this.clients.set(server.id, client);
      server.status = 'running';
      server.lastConnected = new Date();

      // Create session record
      const session: MCPSession = {
        sessionId: `stdio_session_${server.id}_${Date.now()}`,
        serverId: server.id,
        transport: 'stdio',
        startTime: new Date(),
        lastActivity: new Date(),
        status: 'active',
        requestCount: 0,
        errorCount: 0
      };
      this.sessions.set(server.id, session);

      this.metrics.activeConnections++;
      
      logger.info(`✅ [MCP Client] Started ${server.name} (stdio, ${negotiation.serverVersion})`);

      // Emit connection event
      this.emitEvent('server_connected', server.id, { 
        transport: 'stdio',
        protocolVersion: negotiation.serverVersion,
        capabilities: negotiation.capabilities
      });

    } catch (error) {
      server.status = 'error';
      server.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      throw error;
    }
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(client: Client, transport: any, server: MCPServer): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.CONNECTION_TIMEOUT}ms`));
      }, server.timeout || this.CONNECTION_TIMEOUT);

      client.connect(transport)
        .then(() => {
          clearTimeout(timeout);
          resolve();
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Perform protocol negotiation
   */
  private async negotiateProtocol(client: Client, server: MCPServer): Promise<MCPProtocolNegotiation> {
    try {
      // The SDK handles initialization automatically, but we can get server info
      const serverInfo = (client as any)._serverInfo || {};
      
      return {
        clientVersion: this.PROTOCOL_VERSION,
        serverVersion: serverInfo.protocolVersion || 'unknown',
        supportedTransports: ['stdio'],
        agreedTransport: 'stdio',
        capabilities: {
          tools: true,
          prompts: serverInfo.capabilities?.prompts || false,
          resources: serverInfo.capabilities?.resources || false,
          completion: serverInfo.capabilities?.completion || false,
          roots: serverInfo.capabilities?.roots || false,
          sampling: serverInfo.capabilities?.sampling || false
        }
      };
    } catch (error) {
      logger.warn(`⚠️ [MCP Client] Protocol negotiation warning for ${server.name}:`, error);
      
      // Return minimal negotiation
      return {
        clientVersion: this.PROTOCOL_VERSION,
        serverVersion: 'unknown',
        supportedTransports: ['stdio'],
        agreedTransport: 'stdio',
        capabilities: {
          tools: true
        }
      };
    }
  }

  /**
   * List tools from a specific server with caching
   */
  async listTools(serverId: string): Promise<MCPTool[]> {
    try {
      // Use cached tools if available
      const cachedTools = await this.toolCache.getServerTools(serverId);
      if (cachedTools.length > 0) {
        return cachedTools;
      }

      // Fallback to direct client call if cache fails
      const client = this.clients.get(serverId);
      if (!client) {
        throw new Error(`Server ${serverId} not connected`);
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
        cachedAt: new Date(),
        usageCount: 0
      }));

    } catch (error) {
      this.handleError('TOOL_NOT_FOUND', `Failed to list tools for server ${serverId}`, error, serverId);
      return [];
    }
  }

  /**
   * Invoke MCP tool with metadata support and fallback strategies
   */
  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Update session activity
      this.updateSessionActivity(request.serverId);

      // Validate arguments
      const validation = await this.validateArguments(request);
      if (!validation.isValid) {
        throw new Error(`Invalid arguments: ${validation.errors?.join(', ')}`);
      }

      // Try primary server first
      let response = await this.tryToolInvocation(request, startTime);
      
      if (!response.success) {
        // Try fallback servers if primary fails
        response = await this.tryFallbackInvocation(request, startTime);
      }

      // Update metrics and tool usage
      if (response.success) {
        this.metrics.successfulRequests++;
        this.toolCache.updateToolUsage(request.serverId, request.toolName);
      } else {
        this.metrics.failedRequests++;
      }

      this.updateMetrics(startTime);
      
      return response;

    } catch (error) {
      this.metrics.failedRequests++;
      this.updateMetrics(startTime);
      
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
   * Try tool invocation on primary server
   */
  private async tryToolInvocation(request: MCPInvokeRequest, startTime: number): Promise<MCPInvokeResponse> {
    const client = this.clients.get(request.serverId);
    if (!client) {
      throw new Error(`Server ${request.serverId} not connected`);
    }

    try {
      // Prepare request with metadata support
      const requestParams: any = {
        name: request.toolName,
        arguments: request.arguments
      };

      // Add metadata field if provided
      if (request.metadata) {
        requestParams._meta = request.metadata;
      }

      const response = await client.request(
        { method: 'tools/call', params: requestParams },
        toolCallResponseSchema
      );

      return {
        success: true,
        result: response.content,
        duration: Date.now() - startTime,
        serverId: request.serverId,
        toolName: request.toolName
      };

    } catch (error) {
      logger.warn(`⚠️ [MCP Client] Tool invocation failed on primary server ${request.serverId}:`, error);
      
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
   * Try fallback servers for tool invocation
   */
  private async tryFallbackInvocation(request: MCPInvokeRequest, startTime: number): Promise<MCPInvokeResponse> {
    logger.info(`🔄 [MCP Client] Trying fallback servers for tool ${request.toolName}...`);

    // Find alternative servers with the same tool
    const alternativeTools = this.toolCache.findToolsByName(request.toolName);
    const healthyServerIds = new Set(this.healthChecker.getHealthyServers().map(s => s.id));
    
    const fallbackTools = alternativeTools.filter(tool => 
      tool.serverId !== request.serverId && healthyServerIds.has(tool.serverId)
    );

    for (const fallbackTool of fallbackTools) {
      try {
        logger.debug(`🔄 [MCP Client] Trying fallback server ${fallbackTool.serverId}...`);
        
        const fallbackRequest = {
          ...request,
          serverId: fallbackTool.serverId
        };

        const response = await this.tryToolInvocation(fallbackRequest, startTime);
        
        if (response.success) {
          logger.info(`✅ [MCP Client] Fallback successful on server ${fallbackTool.serverId}`);
          
          // Emit fallback event
          this.emitEvent('fallback_triggered', request.serverId, {
            originalServer: request.serverId,
            fallbackServer: fallbackTool.serverId,
            toolName: request.toolName
          });
          
          return {
            ...response,
            retryAttempt: 1 // Mark as fallback
          };
        }
      } catch (error) {
        logger.debug(`❌ [MCP Client] Fallback failed on server ${fallbackTool.serverId}:`, error);
      }
    }

    // All fallbacks failed
    return {
      success: false,
      error: 'All servers failed including fallbacks',
      duration: Date.now() - startTime,
      serverId: request.serverId,
      toolName: request.toolName,
      retryAttempt: fallbackTools.length
    };
  }

  /**
   * Validate tool arguments
   */
  private async validateArguments(request: MCPInvokeRequest): Promise<MCPArgumentValidation> {
    try {
      // Basic validation
      if (!request.toolName || typeof request.toolName !== 'string') {
        return {
          isValid: false,
          errors: ['Tool name is required and must be a string']
        };
      }

      if (!request.arguments || typeof request.arguments !== 'object') {
        return {
          isValid: false,
          errors: ['Arguments must be an object']
        };
      }

      return {
        isValid: true,
        sanitizedArguments: request.arguments
      };

    } catch (error) {
      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : 'Validation error']
      };
    }
  }

  /**
   * Handle server disconnection
   */
  private handleServerDisconnection(serverId: string): void {
    logger.info(`📤 [MCP Client] Handling disconnection for server ${serverId}`);

    // Update server status
    const server = this.servers.get(serverId);
    if (server) {
      server.status = 'stopped';
    }

    // Update session status
    const session = this.sessions.get(serverId);
    if (session) {
      session.status = 'terminated';
    }

    // Remove client
    this.clients.delete(serverId);
    this.metrics.activeConnections = Math.max(0, this.metrics.activeConnections - 1);

    // Clean up process
    const process = this.processes.get(serverId);
    if (process && !process.killed) {
      process.kill('SIGTERM');
    }
    this.processes.delete(serverId);

    // Remove from tool cache
    this.toolCache.removeServerClient(serverId);

    // Emit disconnection event
    this.emitEvent('server_disconnected', serverId, { 
      timestamp: new Date() 
    });
  }

  /**
   * Update session activity
   */
  private updateSessionActivity(serverId: string): void {
    const session = this.sessions.get(serverId);
    if (session) {
      session.lastActivity = new Date();
      session.requestCount++;
    }
  }

  /**
   * Update metrics
   */
  private updateMetrics(startTime: number): void {
    const duration = Date.now() - startTime;
    
    // Update average response time
    const totalDuration = this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) + duration;
    this.metrics.averageResponseTime = totalDuration / this.metrics.totalRequests;

    // Update uptime
    this.metrics.uptime = Date.now() - this.startTime.getTime();

    // Update cache hit rate from tool cache
    const cacheStatus = this.toolCache.getCacheStatus();
    this.metrics.cacheHitRate = cacheStatus.hitRate || 0;

    // Track recent requests for rate calculations
    this.recentRequests.push({
      timestamp: new Date(),
      success: this.metrics.successfulRequests > this.metrics.failedRequests
    });

    // Keep only last hour of requests
    const oneHourAgo = Date.now() - 3600000;
    this.recentRequests = this.recentRequests.filter(req => req.timestamp.getTime() > oneHourAgo);

    // Calculate requests per minute
    const oneMinuteAgo = Date.now() - 60000;
    const recentMinuteRequests = this.recentRequests.filter(req => req.timestamp.getTime() > oneMinuteAgo);
    this.metrics.requestsPerMinute = recentMinuteRequests.length;
    this.metrics.errorsPerMinute = recentMinuteRequests.filter(req => !req.success).length;

    this.metrics.lastUpdated = new Date();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Health checker events
    this.healthChecker.onHealthEvent((event) => {
      this.emit('mcp_event', event);
    });

    // Tool cache events
    this.toolCache.onCacheEvent((event) => {
      this.emit('mcp_event', event);
    });
  }

  /**
   * Setup process handlers for graceful shutdown
   */
  private setupProcessHandlers(): void {
    const cleanup = async () => {
      logger.info('🛑 [MCP Client] Received shutdown signal, cleaning up...');
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Start monitoring and maintenance
   */
  private startMonitoring(): void {
    // Start metrics collection interval
    setInterval(() => {
      this.collectMetrics();
    }, 60000); // Every minute

    logger.debug('📊 [MCP Client] Monitoring and maintenance started');
  }

  /**
   * Collect metrics from various sources
   */
  private collectMetrics(): void {
    // Update server metrics
    for (const [serverId, server] of this.servers) {
      if (!this.metrics.serverMetrics[serverId]) {
        this.metrics.serverMetrics[serverId] = {
          requests: 0,
          failures: 0,
          averageResponseTime: 0,
          uptime: 0
        };
      }

      const session = this.sessions.get(serverId);
      if (session) {
        this.metrics.serverMetrics[serverId].requests = session.requestCount;
        this.metrics.serverMetrics[serverId].uptime = Date.now() - session.startTime.getTime();
      }
    }
  }

  /**
   * Handle errors with proper categorization
   */
  private handleError(
    type: MCPErrorType, 
    message: string, 
    originalError?: unknown, 
    serverId?: string, 
    toolName?: string
  ): void {
    const error: MCPError = {
      type,
      message,
      serverId,
      toolName,
      details: originalError ? { originalError: String(originalError) } : undefined,
      timestamp: new Date(),
      recoverable: type !== 'CONFIGURATION_ERROR'
    };

    logger.error(`❌ [MCP Client] ${type}: ${message}`, originalError);

    this.emitEvent('error_occurred', serverId, error);
  }

  /**
   * Emit MCP events
   */
  private emitEvent(type: string, serverId: string | undefined, data: Record<string, unknown>): void {
    const event: MCPEvent = {
      type: type as any,
      serverId,
      data,
      timestamp: new Date()
    };

    this.emit('mcp_event', event);
    this.emit(type, event);
  }

  /**
   * Cleanup MCP client service
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 [MCP Client] Cleaning up stdio MCP client service...');

    try {
      // Stop all services
      await this.toolCache.stop();
      await this.healthChecker.stop();

      // Stop all servers and processes
      for (const serverId of this.servers.keys()) {
        try {
          await this.stopServer(serverId);
        } catch (error) {
          logger.error(`❌ [MCP Client] Failed to stop server ${serverId}:`, error);
        }
      }

      this.initialized = false;
      logger.info('✅ [MCP Client] Stdio MCP client service cleaned up');

    } catch (error) {
      logger.error('❌ [MCP Client] Error during cleanup:', error);
      throw error;
    }
  }

  // Legacy methods for backward compatibility

  async addServer(server: Omit<MCPServer, 'id' | 'status'>): Promise<MCPServer> {
    // Only accept stdio transport
    if (server.transport !== 'stdio') {
      throw new Error(`Transport ${server.transport} not supported in stdio mode`);
    }

    const id = `stdio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
      return;
    }
    
    await this.startServerProcess(server);
    await this.saveConfig();
  }

  async stopServer(serverId: string): Promise<void> {
    this.handleServerDisconnection(serverId);
    await this.saveConfig();
  }

  getServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServer(serverId: string): MCPServer | undefined {
    return this.servers.get(serverId);
  }

  /**
   * Get health statistics
   */
  getHealthStats(): { total: number; healthy: number; unhealthy: number } {
    const total = this.servers.size;
    const healthyServers = this.healthChecker.getHealthyServers();
    const healthy = healthyServers.length;
    const unhealthy = total - healthy;

    return { total, healthy, unhealthy };
  }

  // Configuration management
  private async loadConfig(): Promise<void> {
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);
      
      if (config.servers) {
        for (const server of config.servers) {
          // Only accept stdio servers
          if (server.transport !== 'stdio') {
            logger.warn(`⚠️ [MCP Client] Skipping non-stdio server ${server.name} in stdio mode`);
            continue;
          }
          this.servers.set(server.id, server);
        }
      }
    } catch (error) {
      logger.debug('📄 [MCP Client] No existing stdio config found, starting fresh');
    }
  }

  private async saveConfig(): Promise<void> {
    const config = {
      version: '1.0',
      servers: Array.from(this.servers.values()),
      lastModified: new Date(),
      deploymentMode: 'stdio-subproject3'
    };
    
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * Get comprehensive status and metrics
   */
  getStatus(): {
    servers: MCPServer[];
    health: any;
    cache: any;
    metrics: MCPMetrics;
    sessions: MCPSession[];
    deploymentMode: string;
    processes: { serverId: string; pid: number | undefined; status: string }[];
  } {
    const processInfo = Array.from(this.processes.entries()).map(([serverId, process]) => ({
      serverId,
      pid: process.pid,
      status: process.killed ? 'killed' : 'running'
    }));

    return {
      servers: Array.from(this.servers.values()),
      health: this.healthChecker.getOverallHealthStatus(),
      cache: this.toolCache.getCacheStatus(),
      metrics: this.metrics,
      sessions: Array.from(this.sessions.values()),
      deploymentMode: 'stdio-subproject3',
      processes: processInfo
    };
  }

  /**
   * Shutdown gracefully (alias for cleanup)
   */
  async shutdown(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Add event listener for MCP events
   */
  onMCPEvent(handler: MCPEventHandler): void {
    this.on('mcp_event', handler);
  }

  /**
   * Remove event listener for MCP events
   */
  offMCPEvent(handler: MCPEventHandler): void {
    this.off('mcp_event', handler);
  }
}

// Export singleton instance for legacy compatibility
export const MCPClientStdioService = MCPClientStdio;
