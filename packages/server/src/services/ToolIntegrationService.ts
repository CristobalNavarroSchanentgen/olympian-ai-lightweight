import { MCPService } from './MCPService';
import { logger } from '../utils/logger';
import { ProcessedRequest } from '@olympian/shared';

/**
 * Tool Integration Service for Subproject 3
 * 
 * Handles the integration of MCP tools into the chat flow:
 * - Injects available tools into model context
 * - Parses tool calls from model responses
 * - Executes tools via MCP service
 * - Formats tool results for the model
 */

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters?: Record<string, any>;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string | Record<string, any>;
  };
}

interface ToolCallResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

export class ToolIntegrationService {
  private static instance: ToolIntegrationService;
  private mcpService: MCPService | null = null;

  private constructor() {}

  static getInstance(): ToolIntegrationService {
    if (!ToolIntegrationService.instance) {
      ToolIntegrationService.instance = new ToolIntegrationService();
    }
    return ToolIntegrationService.instance;
  }

  /**
   * Initialize with MCP service reference
   */
  initialize(mcpService: MCPService): void {
    this.mcpService = mcpService;
    logger.info('✅ [ToolIntegration] Service initialized with MCP service reference');
  }

  /**
   * Get available tools from MCP service and format for model
   */
  async getToolsForModel(): Promise<ToolDefinition[]> {
    if (!this.mcpService) {
      logger.warn('⚠️ [ToolIntegration] MCP service not initialized');
      return [];
    }

    try {
      const mcpTools = await this.mcpService.listTools();
      
      // Convert MCP tools to OpenAI-compatible format
      const toolDefinitions: ToolDefinition[] = mcpTools.map(tool => ({
        type: 'function' as const,
        function: {
          name: `${tool.serverId}_${tool.name}`.replace(/[^a-zA-Z0-9_]/g, '_'),
          description: tool.description || `Tool ${tool.name} from ${tool.serverId}`,
          parameters: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }));

      logger.debug(`🔧 [ToolIntegration] Formatted ${toolDefinitions.length} tools for model`);
      return toolDefinitions;
    } catch (error) {
      logger.error('❌ [ToolIntegration] Failed to get tools:', error);
      return [];
    }
  }

  /**
   * Inject tools into the processed request if model has tool capability
   */
  async injectToolsIntoRequest(
    request: ProcessedRequest,
    hasToolCapability: boolean
  ): Promise<ProcessedRequest> {
    if (!hasToolCapability || !this.mcpService) {
      return request;
    }

    try {
      const tools = await this.getToolsForModel();
      
      if (tools.length === 0) {
        logger.debug('🔧 [ToolIntegration] No tools available to inject');
        return request;
      }

      // Add tools to the request
      const enhancedRequest = {
        ...request,
        tools,
        tool_choice: 'auto' // Let the model decide when to use tools
      };

      logger.info(`✅ [ToolIntegration] Injected ${tools.length} tools into request for model ${request.model}`);
      return enhancedRequest;
    } catch (error) {
      logger.error('❌ [ToolIntegration] Failed to inject tools:', error);
      return request;
    }
  }

  /**
   * Parse tool calls from model response
   */
  parseToolCalls(response: any): ToolCall[] {
    try {
      // Check if response contains tool_calls
      if (!response.message?.tool_calls || !Array.isArray(response.message.tool_calls)) {
        return [];
      }

      const toolCalls: ToolCall[] = response.message.tool_calls.map((call: any, index: number) => ({
        id: call.id || `call_${Date.now()}_${index}`,
        type: 'function',
        function: {
          name: call.function.name,
          arguments: typeof call.function.arguments === 'string' 
            ? call.function.arguments 
            : JSON.stringify(call.function.arguments)
        }
      }));

      logger.info(`🔍 [ToolIntegration] Parsed ${toolCalls.length} tool calls from model response`);
      return toolCalls;
    } catch (error) {
      logger.error('❌ [ToolIntegration] Failed to parse tool calls:', error);
      return [];
    }
  }

  /**
   * Execute tool calls via MCP service
   */
  async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolCallResult[]> {
    if (!this.mcpService) {
      logger.warn('⚠️ [ToolIntegration] MCP service not initialized');
      return [];
    }

    const results: ToolCallResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        // Parse the tool name to extract serverId and actual tool name
        const parts = toolCall.function.name.split('_');
        if (parts.length < 2) {
          throw new Error(`Invalid tool name format: ${toolCall.function.name}`);
        }

        const serverId = parts[0];
        const toolName = parts.slice(1).join('_');

        // Parse arguments
        let args: Record<string, any> = {};
        if (typeof toolCall.function.arguments === 'string') {
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            logger.warn(`⚠️ [ToolIntegration] Failed to parse arguments for ${toolCall.function.name}`);
          }
        } else {
          args = toolCall.function.arguments;
        }

        logger.info(`🔨 [ToolIntegration] Executing tool: ${serverId}.${toolName}`);
        
        // Execute the tool via MCP service
        const result = await this.mcpService.callTool(serverId, toolName, args);

        // Format the result for the model
        const toolResult: ToolCallResult = {
          tool_call_id: toolCall.id,
          role: 'tool',
          content: typeof result === 'string' ? result : JSON.stringify(result)
        };

        results.push(toolResult);
        logger.info(`✅ [ToolIntegration] Tool execution successful: ${serverId}.${toolName}`);
      } catch (error) {
        logger.error(`❌ [ToolIntegration] Tool execution failed for ${toolCall.function.name}:`, error);
        
        // Add error result
        results.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          content: `Error executing tool: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    }

    return results;
  }

  /**
   * Check if a response contains tool calls
   */
  hasToolCalls(response: any): boolean {
    return !!(response.message?.tool_calls && response.message.tool_calls.length > 0);
  }

  /**
   * Format tool results as messages for the model
   */
  formatToolResultsAsMessages(results: ToolCallResult[]): Array<{ role: string; content: string }> {
    return results.map(result => ({
      role: result.role,
      content: result.content,
      tool_call_id: result.tool_call_id
    }));
  }
}
