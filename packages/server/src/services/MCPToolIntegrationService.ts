import { logger } from '../utils/logger';
import { MCPService } from './MCPService';
import { MCPTool } from '@olympian/shared';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
  error?: boolean;
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * MCP Tool Integration Service
 * 
 * This service bridges the gap between Ollama models with tool capabilities
 * and the MCP tool ecosystem. It handles:
 * - Converting MCP tools to Ollama-compatible tool definitions
 * - Parsing tool calls from model responses
 * - Executing tool calls via MCP
 * - Formatting tool results for the model
 */
export class MCPToolIntegrationService {
  private static instance: MCPToolIntegrationService;
  private mcpService: MCPService | null = null;
  private toolCache: Map<string, MCPTool> = new Map();
  private toolServerMap: Map<string, string> = new Map(); // tool name -> server id
  private lastToolRefresh: Date | null = null;
  private readonly TOOL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): MCPToolIntegrationService {
    if (!MCPToolIntegrationService.instance) {
      MCPToolIntegrationService.instance = new MCPToolIntegrationService();
    }
    return MCPToolIntegrationService.instance;
  }

  /**
   * Set the MCP service reference
   */
  setMCPService(service: MCPService): void {
    this.mcpService = service;
    logger.info('✅ [MCPToolIntegration] MCP service reference set');
  }

  /**
   * Check if MCP tools are available
   */
  isAvailable(): boolean {
    return this.mcpService !== null;
  }

  /**
   * Refresh the tool cache if needed
   */
  private async refreshToolCacheIfNeeded(): Promise<void> {
    if (!this.mcpService) {
      throw new Error('MCP service not initialized');
    }

    const now = new Date();
    if (this.lastToolRefresh && 
        (now.getTime() - this.lastToolRefresh.getTime()) < this.TOOL_CACHE_TTL) {
      return; // Cache is still fresh
    }

    logger.info('🔄 [MCPToolIntegration] Refreshing tool cache...');
    
    try {
      const tools = await this.mcpService.listTools();
      
      // Clear and rebuild caches
      this.toolCache.clear();
      this.toolServerMap.clear();
      
      for (const tool of tools) {
        const fullToolName = `${tool.serverId}_${tool.name}`;
        this.toolCache.set(fullToolName, tool);
        this.toolServerMap.set(fullToolName, tool.serverId);
      }
      
      this.lastToolRefresh = now;
      logger.info(`✅ [MCPToolIntegration] Tool cache refreshed: ${tools.length} tools available`);
    } catch (error) {
      logger.error('❌ [MCPToolIntegration] Failed to refresh tool cache:', error);
      throw error;
    }
  }

  /**
   * Get all available tools formatted for Ollama
   */
  async getOllamaToolDefinitions(): Promise<OllamaToolDefinition[]> {
    await this.refreshToolCacheIfNeeded();
    
    const definitions: OllamaToolDefinition[] = [];
    
    for (const [fullToolName, tool] of this.toolCache) {
      try {
        const definition = this.convertToOllamaFormat(fullToolName, tool);
        definitions.push(definition);
      } catch (error) {
        logger.warn(`⚠️ [MCPToolIntegration] Failed to convert tool ${fullToolName}:`, error);
      }
    }
    
    logger.debug(`📋 [MCPToolIntegration] Prepared ${definitions.length} tool definitions for Ollama`);
    return definitions;
  }

  /**
   * Convert an MCP tool to Ollama-compatible format
   */
  private convertToOllamaFormat(fullToolName: string, tool: MCPTool): OllamaToolDefinition {
    // Parse the input schema (assuming it's JSON Schema format)
    const inputSchema = tool.inputSchema as any;
    
    // Build Ollama-compatible parameters
    const parameters: OllamaToolDefinition['function']['parameters'] = {
      type: 'object',
      properties: {},
      required: []
    };
    
    if (inputSchema.properties) {
      parameters.properties = inputSchema.properties;
    }
    
    if (inputSchema.required && Array.isArray(inputSchema.required)) {
      parameters.required = inputSchema.required;
    }
    
    return {
      type: 'function',
      function: {
        name: fullToolName,
        description: tool.description || `Tool from ${tool.serverId}`,
        parameters
      }
    };
  }

  /**
   * Parse tool calls from Ollama response
   */
  parseToolCallsFromResponse(response: any): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    
    // Ollama returns tool_calls in the message
    if (response.message?.tool_calls && Array.isArray(response.message.tool_calls)) {
      for (const call of response.message.tool_calls) {
        if (call.function) {
          toolCalls.push({
            id: call.id || `call_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: {
              name: call.function.name,
              arguments: typeof call.function.arguments === 'string' 
                ? call.function.arguments 
                : JSON.stringify(call.function.arguments)
            }
          });
        }
      }
    }
    
    return toolCalls;
  }

  /**
   * Execute a tool call via MCP
   */
  async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.mcpService) {
      throw new Error('MCP service not initialized');
    }
    
    const fullToolName = toolCall.function.name;
    const serverId = this.toolServerMap.get(fullToolName);
    
    if (!serverId) {
      logger.error(`❌ [MCPToolIntegration] Unknown tool: ${fullToolName}`);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: `Error: Unknown tool ${fullToolName}`,
        error: true
      };
    }
    
    // Extract the original tool name (remove server prefix)
    const originalToolName = fullToolName.substring(serverId.length + 1);
    
    try {
      // Parse arguments
      let args: Record<string, any>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (error) {
        logger.error(`❌ [MCPToolIntegration] Invalid arguments for ${fullToolName}:`, error);
        return {
          tool_call_id: toolCall.id,
          role: 'tool',
          content: `Error: Invalid arguments - ${error}`,
          error: true
        };
      }
      
      logger.info(`🔧 [MCPToolIntegration] Executing tool: ${fullToolName} with args:`, args);
      
      // Execute via MCP
      const result = await this.mcpService.callTool(serverId, originalToolName, args);
      
      // Format result
      let content: string;
      if (typeof result === 'string') {
        content = result;
      } else if (result && typeof result === 'object') {
        // Handle different content formats from MCP
        if (Array.isArray(result)) {
          // Handle array of content items (common in MCP)
          content = result.map(item => {
            if (typeof item === 'string') return item;
            if (item.type === 'text' && item.text) return item.text;
            return JSON.stringify(item);
          }).join('\n');
        } else if ('type' in result && result.type === 'text' && 'text' in result) {
          content = result.text;
        } else {
          content = JSON.stringify(result, null, 2);
        }
      } else {
        content = String(result);
      }
      
      logger.info(`✅ [MCPToolIntegration] Tool execution successful: ${fullToolName}`);
      
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content,
        error: false
      };
      
    } catch (error) {
      logger.error(`❌ [MCPToolIntegration] Tool execution failed for ${fullToolName}:`, error);
      return {
        tool_call_id: toolCall.id,
        role: 'tool',
        content: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
        error: true
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results = await Promise.all(
      toolCalls.map(call => this.executeToolCall(call))
    );
    return results;
  }

  /**
   * Clear the tool cache (useful when MCP servers change)
   */
  clearCache(): void {
    this.toolCache.clear();
    this.toolServerMap.clear();
    this.lastToolRefresh = null;
    logger.info('🧹 [MCPToolIntegration] Tool cache cleared');
  }

  /**
   * Get tool by full name
   */
  getTool(fullToolName: string): MCPTool | undefined {
    return this.toolCache.get(fullToolName);
  }

  /**
   * Get all cached tools
   */
  getCachedTools(): MCPTool[] {
    return Array.from(this.toolCache.values());
  }
}
