import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  CompleteRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

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

// Enhanced validation schemas for MCP responses
const toolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.object({
    type: z.literal('object').optional(),
    properties: z.record(z.any()).optional(),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional()
  }).optional()
});

const toolListResponseSchema = z.object({
  tools: z.array(toolSchema)
});

const toolCallResponseSchema = z.object({
  content: z.array(z.union([
    z.object({
      type: z.literal('text'),
      text: z.string()
    }),
    z.object({
      type: z.literal('image'),
      data: z.string(),
      mimeType: z.string()
    }),
    z.object({
      type: z.literal('resource'),
      uri: z.string(),
      text: z.string().optional(),
      mimeType: z.string().optional()
    })
  ])).optional(),
  isError: z.boolean().optional()
});

/**
 * Enhanced Stdio-based MCP Client Service for subproject 3
 * 
 * This implementation follows the latest MCP SDK patterns:
 * 1. Proper client initialization with capabilities
 * 2. Enhanced error handling and recovery
 * 3. Support for prompts, resources, and completions
 * 4. Better protocol negotiation
 * 5. Improved transport management
 */
export class MCPClientStdio extends EventEmitter {
  private static instance: MCPClientStdio;
  
  private clients: Map<string, Client> = new Map();
  private servers: Map<string, MCPServer> = new Map();
  private sessions: Map<string, MCPSession> = new Map();
  private transports: Map<string, StdioClientTransport> = new Map();
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

    logger.info('🌐 [MCP Client] Initialized in stdio mode - npx child process transport');
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
        // Handle optional servers gracefully
        if (server.optional) {
          logger.info(`ℹ️ [MCP Client] Optional server ${server.name} failed to start, continuing...`);
          server.status = 'stopped';
          server.lastError = error instanceof Error ? error.message : 'Process start failed';
        } else {
          logger.warn(`⚠️ [MCP Client] Failed to start ${server.name}:`, error);
          server.status = 'error';
          server.lastError = error instanceof Error ? error.message : 'Process start failed';
        }
      }
    });

    await Promise.allSettled(connectionPromises);

    const connectedCount = Array.from(this.servers.values()).filter(s => s.status === 'running').length;
    logger.info(`🎯 [MCP Client] Started ${connectedCount}/${this.servers.size} stdio server processes`);
  }

  /**
   * Start a specific MCP server process with stdio transport using npx
   */
  private async startServerProcess(server: MCPServer): Promise<void> {
    logger.debug(`🚀 [MCP Client] Starting server process ${server.name}...`);

    server.status = 'initializing';

    try {
      // Prepare environment with server-specific and global env vars
      const processEnv: Record<string, string> = {};
      
      // Copy environment safely - Fixed: Use forEach instead of for...of
      Object.entries(process.env).forEach(([key, value]) => {
        if (value !== undefined) {
          processEnv[key] = value;
        }
      });
      
      // Add server-specific environment - Fixed: Use forEach instead of for...of
      if (server.env) {
        Object.entries(server.env).forEach(([key, value]) => {
          if (value !== undefined) {
            processEnv[key] = value;
          }
        });
      }
      
      // Set transport mode
      processEnv.MCP_TRANSPORT = 'stdio';

      // Create stdio transport with command and args
      const transport = new StdioClientTransport({
        command: server.command || 'npx',
        args: server.args || [],
        env: processEnv
      });

      // Store transport for cleanup
      this.transports.set(server.id, transport);

      // Create MCP client with full capabilities
      const client = new Client(
        this.CLIENT_INFO,
        {
          capabilities: {
            tools: {},
            prompts: {},
            resources: {},
            completion: {},
            roots: {},
            sampling: {}
          }
        }
      );

      // Connect with timeout
      await this.connectWithTimeout(client, transport, server);

      // Store client and update server status
      this.clients.set(server.id, client);
      server.status = 'running';
      server.lastConnected = new Date();

      // Get server info after connection
      const serverInfo = await this.getServerInfo(client);
      server.protocolVersion = serverInfo.protocolVersion;
      server.capabilities = serverInfo.capabilities;

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
      
      logger.info(`✅ [MCP Client] Started ${server.name} (stdio via npx, ${serverInfo.protocolVersion || 'unknown'})`);

      // Emit connection event
      this.emitEvent('server_connected', server.id, { 
        transport: 'stdio',
        protocolVersion: serverInfo.protocolVersion,
        capabilities: serverInfo.capabilities
      });

    } catch (error) {
      server.status = 'error';
      server.lastError = error instanceof Error ? error.message : 'Unknown error';
      
      // Clean up transport on error
      const transport = this.transports.get(server.id);
      if (transport) {
        try {
          await transport.close();
        } catch (e) {
          // Ignore cleanup errors
        }
        this.transports.delete(server.id);
      }
      
      throw error;
    }
  }

  /**
   * Connect with timeout
   */
  private async connectWithTimeout(client: Client, transport: StdioClientTransport, server: MCPServer): Promise<void> {
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
   * Get server information after connection
   */
  private async getServerInfo(client: Client): Promise<{
    protocolVersion?: string;
    capabilities?: any;
  }> {
    try {
      // Access server info from client internals if available
      const clientAny = client as any;
      if (clientAny._serverInfo) {
        return {
          protocolVersion: clientAny._serverInfo.protocolVersion,
          capabilities: clientAny._serverInfo.capabilities
        };
      }
      
      // Try to get server info through a safe method
      // The SDK doesn't expose server info directly, so we return defaults
      return {
        protocolVersion: this.PROTOCOL_VERSION,
        capabilities: {
          tools: true,
          prompts: false,
          resources: false,
          completion: false
        }
      };
    } catch (error) {
      logger.debug('📝 [MCP Client] Could not retrieve server info:', error);
      return {};
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

      const response = await client.listTools();

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
   * Invoke MCP tool with enhanced error handling and retry logic
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

      // Try primary server first with retries
      let response = await this.tryToolInvocationWithRetries(request, startTime);
      
      if (!response.success && request.fallbackStrategy !== 'none') {
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
   * Try tool invocation with retries
   */
  private async tryToolInvocationWithRetries(request: MCPInvokeRequest, startTime: number): Promise<MCPInvokeResponse> {
    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
      try {
        const response = await this.tryToolInvocation(request, startTime);
        if (response.success) {
          return response;
        }
        lastError = new Error(response.error || 'Unknown error');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
      }

      // Wait before retry with exponential backoff
      if (attempt < this.MAX_RETRIES - 1) {
        const delay = this.RETRY_DELAY_BASE * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    return {
      success: false,
      error: lastError?.message || 'All retry attempts failed',
      duration: Date.now() - startTime,
      serverId: request.serverId,
      toolName: request.toolName,
      retryAttempt: this.MAX_RETRIES
    };
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
      const response = await client.callTool({
        name: request.toolName,
        arguments: request.arguments || {}
      });

      // Handle different content types
      let result: any = response.content;
      if (Array.isArray(response.content) && response.content.length === 1) {
        const content = response.content[0];
        if (content && typeof content === 'object' && 'type' in content && content.type === 'text' && 'text' in content) {
          result = content.text;
        }
      }

      return {
        success: !response.isError,
        result,
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
   * List prompts from a server
   */
  async listPrompts(serverId: string): Promise<any[]> {
    try {
      const client = this.clients.get(serverId);
      if (!client) {
        throw new Error(`Server ${serverId} not connected`);
      }

      const response = await client.listPrompts();

      return response.prompts || [];
    } catch (error) {
      logger.warn(`⚠️ [MCP Client] Failed to list prompts for server ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Get a specific prompt
   */
  async getPrompt(serverId: string, name: string, args?: Record<string, any>): Promise<any> {
    try {
      const client = this.clients.get(serverId);
      if (!client) {
        throw new Error(`Server ${serverId} not connected`);
      }

      const response = await client.getPrompt({
        name,
        arguments: args || {}
      });

      return response;
    } catch (error) {
      logger.error(`❌ [MCP Client] Failed to get prompt ${name} from server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * List resources from a server
   */
  async listResources(serverId: string): Promise<any[]> {
    try {
      const client = this.clients.get(serverId);
      if (!client) {
        throw new Error(`Server ${serverId} not connected`);
      }

      const response = await client.listResources();

      return response.resources || [];
    } catch (error) {
      logger.warn(`⚠️ [MCP Client] Failed to list resources for server ${serverId}:`, error);
      return [];
    }
  }

  /**
   * Read a specific resource
   */
  async readResource(serverId: string, uri: string): Promise<any> {
    try {
      const client = this.clients.get(serverId);
      if (!client) {
        throw new Error(`Server ${serverId} not connected`);
      }

      const response = await client.readResource({ uri });

      return response;
    } catch (error) {
      logger.error(`❌ [MCP Client] Failed to read resource ${uri} from server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Get completions for arguments
   */
  async getCompletions(serverId: string, params: {
    ref: { type: 'ref/prompt'; name: string } | { type: 'ref/resource'; uri: string };
    argument: { name: string; value: string };
    context?: { arguments?: Record<string, any> };
  }): Promise<any> {
    try {
      const client = this.clients.get(serverId);
      if (!client) {
        throw new Error(`Server ${serverId} not connected`);
      }

      // Create properly typed completion parameters
      const completionParams = {
        ref: params.ref,
        argument: params.argument,
        _meta: params.context
      };

      const response = await client.complete(completionParams);

      return response;
    } catch (error) {
      logger.warn(`⚠️ [MCP Client] Failed to get completions from server ${serverId}:`, error);
      return { completion: { values: [] } };
    }
  }

  /**
   * Validate tool arguments - Fixed: Use forEach instead of for...of with proper array handling
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

      if (request.arguments && typeof request.arguments !== 'object') {
        return {
          isValid: false,
          errors: ['Arguments must be an object']
        };
      }

      // Get tool schema from cache if available
      const cachedTools = this.toolCache.getCachedTools(request.serverId);
      const tool = cachedTools?.find(t => t.name === request.toolName);
      
      if (tool && tool.inputSchema) {
        // Validate against schema if available
        try {
          const schema = tool.inputSchema;
          if (schema.properties) {
            const errors: string[] = [];
            
            // Check required fields - Fixed: Ensure required is an array before iterating
            const required = schema.required || [];
            if (Array.isArray(required)) {
              required.forEach((field: string) => {
                if (!request.arguments || !(field in request.arguments)) {
                  errors.push(`Missing required field: ${field}`);
                }
              });
            }

            if (errors.length > 0) {
              return {
                isValid: false,
                errors
              };
            }
          }
        } catch (e) {
          // Schema validation failed, but don't block the request
          logger.debug('Schema validation failed:', e);
        }
      }

      return {
        isValid: true,
        sanitizedArguments: request.arguments || {}
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

    // Clean up transport
    const transport = this.transports.get(serverId);
    if (transport) {
      try {
        transport.close();
      } catch (e) {
        // Ignore cleanup errors
      }
      this.transports.delete(serverId);
    }

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

    // Start health checks
    setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Every 30 seconds

    logger.debug('📊 [MCP Client] Monitoring and maintenance started');
  }

  /**
   * Perform health checks on all servers - Fixed to use forEach instead of for...of
   */
  private async performHealthChecks(): Promise<void> {
    const healthCheckPromises: Promise<void>[] = [];
    
    this.servers.forEach((server, serverId) => {
      if (server.status === 'running') {
        const healthCheckPromise = (async () => {
          try {
            // Try to list tools as a health check
            await this.listTools(serverId);
          } catch (error) {
            logger.warn(`⚠️ [MCP Client] Health check failed for ${server.name}:`, error);
            // Consider reconnecting if health check fails
            if (server.autoReconnect !== false) {
              try {
                await this.reconnectServer(serverId);
              } catch (reconnectError) {
                logger.error(`❌ [MCP Client] Failed to reconnect ${server.name}:`, reconnectError);
              }
            }
          }
        })();
        
        healthCheckPromises.push(healthCheckPromise);
      }
    });

    // Wait for all health checks to complete
    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Reconnect a server
   */
  private async reconnectServer(serverId: string): Promise<void> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    logger.info(`🔄 [MCP Client] Reconnecting server ${server.name}...`);

    // Disconnect first
    this.handleServerDisconnection(serverId);

    // Wait a bit before reconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Reconnect
    await this.startServerProcess(server);
  }

  /**
   * Collect metrics from various sources - Fixed to use forEach instead of for...of
   */
  private collectMetrics(): void {
    // Update server metrics
    this.servers.forEach((server, serverId) => {
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
    });
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
   * Cleanup MCP client service - Fixed to avoid problematic iterations
   */
  async cleanup(): Promise<void> {
    logger.info('🧹 [MCP Client] Cleaning up stdio MCP client service...');

    try {
      // Stop all services
      await this.toolCache.stop();
      await this.healthChecker.stop();

      // Stop all servers and close transports - use Array.from to avoid iterator issues
      const serverIds = Array.from(this.servers.keys());
      for (const serverId of serverIds) {
        try {
          await this.stopServer(serverId);
        } catch (error) {
          logger.error(`❌ [MCP Client] Failed to stop server ${serverId}:`, error);
        }
      }

      // Close all transports - use Array.from to avoid iterator issues
      const transportEntries = Array.from(this.transports.entries());
      for (const [serverId, transport] of transportEntries) {
        try {
          await transport.close();
        } catch (error) {
          logger.error(`❌ [MCP Client] Failed to close transport for ${serverId}:`, error);
        }
      }

      this.initialized = false;
      logger.info('✅ [MCP Client] Stdio MCP client service cleaned up');

    } catch (error) {
      logger.error('❌ [MCP Client] Error during cleanup:', error);
      throw error;
    }
  }

  // Server management methods

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
    transports: { serverId: string; connected: boolean }[];
  } {
    const transportInfo = Array.from(this.transports.entries()).map(([serverId, transport]) => ({
      serverId,
      connected: this.clients.has(serverId)
    }));

    return {
      servers: Array.from(this.servers.values()),
      health: this.healthChecker.getOverallHealthStatus(),
      cache: this.toolCache.getCacheStatus(),
      metrics: this.metrics,
      sessions: Array.from(this.sessions.values()),
      deploymentMode: 'stdio-subproject3',
      transports: transportInfo
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
