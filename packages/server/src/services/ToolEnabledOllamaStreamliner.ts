import { OllamaStreamliner } from './OllamaStreamliner';
import { MCPStreamliner } from './MCPStreamliner';
import { ProcessedRequest } from '@olympian/shared';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tool-enabled Ollama Streamliner for Subproject 3
 * 
 * Extends OllamaStreamliner to add MCP tool integration
 * using the new MCPStreamliner for simplified tool use
 */
export class ToolEnabledOllamaStreamliner extends OllamaStreamliner {
  private mcpStreamliner: MCPStreamliner;
  private initialized = false;

  constructor() {
    super();
    this.mcpStreamliner = MCPStreamliner.getInstance();
  }

  /**
   * Initialize the tool-enabled streamliner
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('🔧 [ToolEnabledOllamaStreamliner] Initializing...');
    
    try {
      // Initialize base streamliner
      await super.initialize();
      
      // Initialize MCP streamliner
      await this.mcpStreamliner.initialize();
      
      this.initialized = true;
      logger.info('✅ [ToolEnabledOllamaStreamliner] Initialized successfully');
    } catch (error) {
      logger.error('❌ [ToolEnabledOllamaStreamliner] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Override processRequest to inject tools for capable models
   */
  async processRequest(
    request: any,
    memoryConfig?: any
  ): Promise<ProcessedRequest> {
    // Get the base processed request
    const baseRequest = await super.processRequest(request, memoryConfig);
    
    // Check if this model has tool capability
    const capabilities = await this.detectCapabilities(request.model);
    
    // If model has tool capability, inject tools
    if (capabilities.tools) {
      const correlationId = uuidv4();
      
      logger.info(`🛠️ [ToolEnabledOllamaStreamliner] Processing tool-capable request ${correlationId}`, {
        model: request.model,
        hasTools: true
      });
      
      // Get available tools from MCPStreamliner
      const tools = await this.mcpStreamliner.getToolsForModel(request.model);
      
      if (tools.length > 0) {
        // Add tools to the request in Ollama format
        baseRequest.tools = tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema || {}
          }
        }));
        
        logger.debug(`📋 [ToolEnabledOllamaStreamliner] Added ${tools.length} tools to request`);
        
        // Store correlation ID for tracking
        (baseRequest as any)._correlationId = correlationId;
      }
    }
    
    return baseRequest;
  }

  /**
   * Override stream method to handle tool calls
   */
  async *stream(
    request: any,
    memoryConfig?: any
  ): AsyncGenerator<any, void, unknown> {
    const correlationId = (request as any)._correlationId || uuidv4();
    
    try {
      // Stream from base implementation
      for await (const chunk of super.stream(request, memoryConfig)) {
        // Check if chunk contains tool call
        if (chunk.message?.tool_calls) {
          logger.info(`🔧 [ToolEnabledOllamaStreamliner] Tool calls detected in stream`);
          
          // Process each tool call
          for (const toolCall of chunk.message.tool_calls) {
            const toolResponse = await this.mcpStreamliner.processToolCall({
              model: request.model,
              toolName: toolCall.function.name,
              args: toolCall.function.arguments,
              correlationId: `${correlationId}-${toolCall.id || uuidv4()}`
            });
            
            // Inject tool response back into the stream
            if (toolResponse.success) {
              // Format response for Ollama
              const responseChunk = {
                ...chunk,
                tool_response: {
                  id: toolCall.id,
                  name: toolCall.function.name,
                  content: toolResponse.result
                }
              };
              
              yield responseChunk;
            } else {
              logger.error(`❌ Tool call failed: ${toolCall.function.name}`, toolResponse.error);
            }
          }
        } else {
          // Regular chunk, pass through
          yield chunk;
        }
      }
    } catch (error) {
      logger.error(`❌ [ToolEnabledOllamaStreamliner] Stream error:`, error);
      throw error;
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    return {
      ...super.getDebugInfo(),
      toolsEnabled: true,
      recentToolCalls: this.mcpStreamliner.getRecentCalls(10),
      toolRegistry: Array.from(this.mcpStreamliner.getToolRegistry().entries())
    };
  }
}
