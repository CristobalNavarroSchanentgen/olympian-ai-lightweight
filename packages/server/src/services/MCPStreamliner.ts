import { MCPManager } from './MCPManager';
import { MCPTool, MCPInvokeRequest, MCPInvokeResponse } from '@olympian/shared';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import EventEmitter from 'events';

interface ToolCallRecord {
  id: string;
  timestamp: Date;
  model: string;
  tool: string;
  args: any;
  response?: MCPInvokeResponse;
  error?: string;
  duration?: number;
}

/**
 * MCP Streamliner - Minimal tool use integration layer for Subproject 3
 * 
 * Core responsibilities:
 * 1. Tool Registry - Store descriptions and arg schemas
 * 2. Model Integration - Route and normalize tool calls
 * 3. Observability - Structured logging with correlation IDs
 * 
 * Principles:
 * - Simplicity first - no extra abstractions
 * - Functionality & observability before optimization
 * - All communication via stdio exclusively
 */
export class MCPStreamliner extends EventEmitter {
  private static instance: MCPStreamliner;
  private mcpManager: MCPManager;
  
  // Tool Registry
  private toolRegistry = new Map<string, {
    description: string;
    argsSchema: Record<string, any>;
    serverId: string;
    available: boolean;
  }>();
  
  // Debug tracking
  private recentCalls: Array<{
    id: string;
    timestamp: Date;
    model: string;
    tool: string;
    args: any;
    response?: any;
    error?: string;
    duration?: number;
  }> = [];
  
  private readonly MAX_RECENT_CALLS = 50;
  
  private constructor() {
    super();
    this.mcpManager = MCPManager.getInstance();
  }
  
  static getInstance(): MCPStreamliner {
    if (!MCPStreamliner.instance) {
      MCPStreamliner.instance = new MCPStreamliner();
    }
    return MCPStreamliner.instance;
  }
  
  /**
   * Initialize the streamliner
   */
  async initialize(): Promise<void> {
    logger.info('🚀 [MCPStreamliner] Initializing MCP Streamliner for tool use...');
    
    try {
      // Ensure MCP Manager is initialized
      await this.mcpManager.initialize();
      
      // Build initial tool registry
      await this.buildToolRegistry();
      
      // Subscribe to MCP Manager events
      this.mcpManager.on('toolsUpdated', () => this.buildToolRegistry());
      
      logger.info('✅ [MCPStreamliner] Initialized successfully');
    } catch (error) {
      logger.error('❌ [MCPStreamliner] Initialization failed:', error);
      throw error;
    }
  }
  
  /**
   * Build/rebuild tool registry from available MCP tools
   */
  private async buildToolRegistry(): Promise<void> {
    const startTime = Date.now();
    logger.info('📋 [MCPStreamliner] Building tool registry...');
    
    try {
      const tools = await this.mcpManager.listTools();
      this.toolRegistry.clear();
      
      for (const tool of tools) {
        // Extract args schema from tool.inputSchema
        const argsSchema = this.extractArgsSchema(tool.inputSchema);
        
        this.toolRegistry.set(tool.name, {
          description: tool.description || 'No description available',
          argsSchema,
          serverId: tool.serverId || 'unknown',
          available: true
        });
        
        logger.debug(`✓ Registered tool: ${tool.name} from ${tool.serverId}`);
      }
      
      const duration = Date.now() - startTime;
      logger.info(`✅ [MCPStreamliner] Tool registry built: ${this.toolRegistry.size} tools in ${duration}ms`);
      
    } catch (error) {
      logger.error('❌ [MCPStreamliner] Failed to build tool registry:', error);
    }
  }
  
  /**
   * Extract args schema from tool inputSchema
   */
  private extractArgsSchema(inputSchema: any): Record<string, any> {
    if (!inputSchema) return {};
    
    // Handle JSON Schema format
    if (inputSchema.type === 'object' && inputSchema.properties) {
      const schema: Record<string, any> = {};
      
      for (const [key, value] of Object.entries(inputSchema.properties)) {
        schema[key] = {
          type: (value as any).type || 'string',
          required: inputSchema.required?.includes(key) || false,
          description: (value as any).description
        };
      }
      
      return schema;
    }
    
    // Fallback to raw schema
    return inputSchema;
  }
  
  /**
   * Process a tool call from the model
   */
  async processToolCall(params: {
    model: string;
    toolName: string;
    args: any;
    correlationId?: string;
  }): Promise<MCPInvokeResponse> {
    const callId = params.correlationId || uuidv4();
    const startTime = Date.now();
    
    // Log incoming call
    logger.info(`🔧 [MCPStreamliner] Tool call ${callId}:`, {
      model: params.model,
      tool: params.toolName,
      args: params.args
    });
    
    const callRecord = {
      id: callId,
      timestamp: new Date(),
      model: params.model,
      tool: params.toolName,
      args: params.args
    };
    
    try {
      // Check if tool exists
      const toolInfo = this.toolRegistry.get(params.toolName);
      if (!toolInfo) {
        throw new Error(`Tool not found: ${params.toolName}`);
      }
      
      // Normalize arguments
      const normalizedArgs = this.normalizeArgs(params.args, toolInfo.argsSchema);
      
      logger.debug(`📝 [MCPStreamliner] Normalized args for ${params.toolName}:`, normalizedArgs);
      
      // Invoke tool via MCP Manager
      const request: MCPInvokeRequest = {
        serverId: "default",
        toolName: params.toolName,
        arguments: normalizedArgs
      };
      
      const response = await this.mcpManager.invokeTool(request);
      
      // Record success
      const duration = Date.now() - startTime;
      callRecord.response = response;
      callRecord.duration = duration;
      
      logger.info(`✅ [MCPStreamliner] Tool call ${callId} completed in ${duration}ms`);
      
      // Track call
      this.trackCall(callRecord);
      
      return response;
      
    } catch (error) {
      // Record error
      const duration = Date.now() - startTime;
      callRecord.error = error.message;
      callRecord.duration = duration;
      
      logger.error(`❌ [MCPStreamliner] Tool call ${callId} failed:`, error);
      
      // Track call
      this.trackCall(callRecord);
      
      // Return error response
      return {
        success: false,
        error: error.message,
        duration: duration,
        serverId: "default",
        toolName: params.toolName
      } as MCPInvokeResponse;
    }
  }
  
  /**
   * Normalize arguments based on schema
   */
  private normalizeArgs(args: any, schema: Record<string, any>): any {
    if (!schema || Object.keys(schema).length === 0) {
      return args;
    }
    
    const normalized: Record<string, any> = {};
    
    for (const [key, schemaInfo] of Object.entries(schema)) {
      const value = args[key];
      
      // Skip if not provided and not required
      if (value === undefined && !schemaInfo.required) {
        continue;
      }
      
      // Type conversion
      if (schemaInfo.type === 'number' && typeof value === 'string') {
        normalized[key] = parseFloat(value);
      } else if (schemaInfo.type === 'boolean' && typeof value === 'string') {
        normalized[key] = value.toLowerCase() === 'true';
      } else if (schemaInfo.type === 'array' && typeof value === 'string') {
        try {
          normalized[key] = JSON.parse(value);
        } catch {
          normalized[key] = [value];
        }
      } else {
        normalized[key] = value;
      }
    }
    
    return normalized;
  }
  
  /**
   * Get available tools for model
   */
  async getToolsForModel(modelName: string): Promise<MCPTool[]> {
    const tools = await this.mcpManager.listTools();
    
    // Currently return all tools - can add model-specific filtering later
    return tools;
  }
  
  /**
   * Track tool call for debugging
   */
  private trackCall(call: any): void {
    this.recentCalls.unshift(call);
    
    // Limit history size
    if (this.recentCalls.length > this.MAX_RECENT_CALLS) {
      this.recentCalls = this.recentCalls.slice(0, this.MAX_RECENT_CALLS);
    }
  }
  
  /**
   * Get recent tool calls for debugging
   */
  getRecentCalls(limit: number = 10): any[] {
    return this.recentCalls.slice(0, limit);
  }
  
  /**
   * Get tool registry info
   */
  getToolRegistry(): Map<string, any> {
    return new Map(this.toolRegistry);
  }
  
  /**
   * Check tool availability
   */
  async checkToolAvailability(toolName: string): Promise<boolean> {
    const servers = await this.mcpManager.getServers();
    
    for (const server of servers) {
      if (server.status === 'connected') {
        const tools = await this.mcpManager.listTools();
        if (tools.some(t => t.name === toolName)) {
          return true;
        }
      }
    }
    
    return false;
  }
}
