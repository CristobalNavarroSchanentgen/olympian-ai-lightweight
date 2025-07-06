import { OllamaStreamliner } from './OllamaStreamliner';
import { ToolIntegrationService } from './ToolIntegrationService';
import { MCPService } from './MCPService';
import { ProcessedRequest } from '@olympian/shared';
import { logger } from '../utils/logger';

/**
 * Tool-enabled Ollama Streamliner for Subproject 3
 * 
 * This extends the OllamaStreamliner class to add MCP tool integration
 * without modifying the original large file directly.
 */
export class ToolEnabledOllamaStreamliner extends OllamaStreamliner {
  private toolIntegrationService: ToolIntegrationService;
  private mcpService: MCPService | null = null;

  constructor() {
    super();
    this.toolIntegrationService = ToolIntegrationService.getInstance();
  }

  /**
   * Set MCP service reference for tool integration
   */
  setMCPService(mcpService: MCPService): void {
    this.mcpService = mcpService;
    this.toolIntegrationService.initialize(mcpService);
    logger.info('✅ [ToolEnabledOllamaStreamliner] MCP service connected for tool integration');
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
    
    // If model has tool capability and we have MCP service, inject tools
    if (capabilities.tools && this.mcpService) {
      const enhancedRequest = await this.toolIntegrationService.injectToolsIntoRequest(
        baseRequest,
        true
      );
      
      logger.info(`🔧 [ToolEnabledOllamaStreamliner] Injected tools for model ${request.model}`);
      return enhancedRequest;
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
    const hasToolCapability = capabilities.tools && this.mcpService !== null;
    
    if (!hasToolCapability) {
      // No tool capability, use parent implementation
      return super.streamChat(processedRequest, onToken, onComplete, clientIp);
    }

    // Enhanced streamChat with tool handling
    logger.info(`🔧 [ToolEnabledOllamaStreamliner] Starting tool-enabled stream for ${processedRequest.model}`);
    
    let toolCallsBuffer: any[] = [];
    let isWaitingForToolCalls = false;
    let fullResponseContent = '';
    
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
              // Parse tool calls
              const parsedCalls = this.toolIntegrationService.parseToolCalls({ 
                message: { tool_calls: toolCalls } 
              });
              
              logger.info(`🔨 [ToolEnabledOllamaStreamliner] Executing ${parsedCalls.length} tool calls`);
              
              // Execute tool calls
              const toolResults = await this.toolIntegrationService.executeToolCalls(parsedCalls);
              
              if (toolResults.length > 0) {
                logger.info(`🔄 [ToolEnabledOllamaStreamliner] Tool execution complete, continuing conversation`);
                
                // Format tool results as messages
                const toolMessages = this.toolIntegrationService.formatToolResultsAsMessages(toolResults);
                
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
                    ...toolMessages
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

// Export a factory function to create tool-enabled streamliner
export function createToolEnabledStreamliner(mcpService?: MCPService): ToolEnabledOllamaStreamliner {
  const streamliner = new ToolEnabledOllamaStreamliner();
  
  if (mcpService) {
    streamliner.setMCPService(mcpService);
  }
  
  return streamliner;
}
