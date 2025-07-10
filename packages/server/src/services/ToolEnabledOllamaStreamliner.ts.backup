import { OllamaStreamliner } from './OllamaStreamliner';
import { ToolIntegrationService } from './ToolIntegrationService';
import { MCPManager } from './MCPManager';
import { MCPService } from './MCPService';
import { ProcessedRequest } from '@olympian/shared';
import { logger } from '../utils/logger';

/**
 * Tool-enabled Ollama Streamliner
 * 
 * Extends OllamaStreamliner to add MCP tool integration
 * using the simplified MCPManager
 */
export class ToolEnabledOllamaStreamliner extends OllamaStreamliner {
  private mcpService?: MCPService;

  constructor() {
    super();
  }

  /**
   * Set MCP service (used by StreamlinerFactory)
   */
  setMCPService(mcpService: MCPService): void {
    this.mcpService = mcpService;
    logger.info('🔧 [ToolEnabledOllamaStreamliner] MCP service set');
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
      const tools = await this.mcpManager.listTools();
      
      if (tools.length > 0) {
        // Add tools to the request
        baseRequest.tools = tools.map(tool => ({
          type: 'function',
          function: {
            name: `${tool.serverId}.${tool.name}`,
            description: tool.description,
            parameters: tool.inputSchema
          }
        }));
        
        logger.info(`🔧 [ToolEnabledOllamaStreamliner] Injected ${tools.length} tools for model ${request.model}`);
      }
    }
    
    return baseRequest;
  }

  /**
   * Override streamChat to handle tool calls
   */
  async streamChat(
    processedRequest: ProcessedRequest,
    onToken: (token: string) => void,
    onComplete?: (result: any) => void,
    clientIp?: string
  ): Promise<void> {
    const capabilities = await this.detectCapabilities(processedRequest.model);
    
    if (!capabilities.tools) {
      // No tool capability, use parent implementation
      return super.streamChat(processedRequest, onToken, onComplete, clientIp);
    }

    // Enhanced streamChat with tool handling
    logger.info(`🔧 [ToolEnabledOllamaStreamliner] Starting tool-enabled stream for ${processedRequest.model}`);
    
    let fullResponseContent = '';
    let isWaitingForToolCalls = false;
    
    // Create a wrapper for onToken to intercept tool calls
    const wrappedOnToken = (token: string) => {
      fullResponseContent += token;
      
      // Check if this looks like the start of tool calls
      if (token.includes('"tool_calls"') || token.includes('"function"')) {
        isWaitingForToolCalls = true;
        logger.debug('🔧 [ToolEnabledOllamaStreamliner] Detected potential tool call in stream');
      }
      
      // Only forward non-tool tokens to client
      if (!isWaitingForToolCalls) {
        onToken(token);
      }
    };
    
    // Create enhanced onComplete handler
    const wrappedOnComplete = async (result: any) => {
      try {
        // Parse the full response to check for tool calls
        const toolCallMatch = fullResponseContent.match(/"tool_calls"\s*:\s*(\[[^\]]*\])/);
        
        if (toolCallMatch) {
          logger.info('🔧 [ToolEnabledOllamaStreamliner] Processing tool calls from response');
          
          try {
            const toolCalls = JSON.parse(toolCallMatch[1]);
            
            if (toolCalls && toolCalls.length > 0) {
              logger.info(`🔨 [ToolEnabledOllamaStreamliner] Executing ${toolCalls.length} tool calls`);
              
              // Execute tool calls
              const toolResults = await Promise.all(
                toolCalls.map(async (call: any) => {
                  try {
                    // Parse server.tool format
                    const [serverId, toolName] = call.function.name.split('.');
                    const result = await this.mcpManager.callTool(
                      serverId,
                      toolName,
                      call.function.arguments
                    );
                    
                    return {
                      tool_call_id: call.id,
                      role: 'tool',
                      name: call.function.name,
                      content: JSON.stringify(result)
                    };
                  } catch (error) {
                    return {
                      tool_call_id: call.id,
                      role: 'tool',
                      name: call.function.name,
                      content: JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })
                    };
                  }
                })
              );
              
              if (toolResults.length > 0) {
                logger.info(`🔄 [ToolEnabledOllamaStreamliner] Tool execution complete, continuing conversation`);
                
                // Create continuation request with tool results
                const continuationRequest = {
                  ...processedRequest,
                  messages: [
                    ...processedRequest.messages,
                    { 
                      role: 'assistant', 
                      content: fullResponseContent.replace(toolCallMatch[0], '').trim(),
                      tool_calls: toolCalls 
                    },
                    ...toolResults
                  ]
                };
                
                // Continue the conversation
                await this.streamChat(continuationRequest, onToken, onComplete, clientIp);
                return;
              }
            }
          } catch (error) {
            logger.error('❌ [ToolEnabledOllamaStreamliner] Error processing tool calls:', error);
          }
        }
        
        // No tool calls or error, proceed with normal completion
        if (onComplete) {
          onComplete(result);
        }
      } catch (error) {
        logger.error('❌ [ToolEnabledOllamaStreamliner] Error in wrapped onComplete:', error);
        if (onComplete) {
          onComplete(result);
        }
      }
    };
    
    // Call parent streamChat with wrapped handlers
    return super.streamChat(processedRequest, wrappedOnToken, wrappedOnComplete, clientIp);
  }
}

// Export singleton instance
export const toolEnabledOllamaStreamliner = new ToolEnabledOllamaStreamliner();
