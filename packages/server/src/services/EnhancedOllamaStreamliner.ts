import { ChatRequest, ProcessedRequest, ToolCall, ToolResult } from '@olympian/shared';
import { logger } from '../utils/logger';
import { MCPManager } from './MCPManager';
import { ToolNamespaceManager } from './ToolNamespaceManager';
import { HILManager } from './HILManager';
import { ToolSelectionService } from './ToolSelectionService';
import { v4 as uuidv4 } from 'uuid';
import { getDeploymentConfig } from '../config/deployment';

/**
 * Enhanced Ollama Streamliner following MCP Client for Ollama patterns
 * Focuses on proper streaming and tool handling without capability detection
 */
export class EnhancedOllamaStreamliner {
  private mcpManager: MCPManager;
  private namespaceManager: ToolNamespaceManager;
  private hilManager: HILManager;
  private toolSelection: ToolSelectionService;
  private deploymentConfig = getDeploymentConfig();
  
  constructor() {
    this.mcpManager = MCPManager.getInstance();
    this.namespaceManager = ToolNamespaceManager.getInstance();
    this.hilManager = HILManager.getInstance();
    this.toolSelection = ToolSelectionService.getInstance();
  }
  
  /**
   * Process request with proper tool injection
   */
  async processRequest(request: ChatRequest): Promise<ProcessedRequest> {
    const correlationId = uuidv4();
    
    logger.info(`🎯 Processing request \${correlationId}`, {
      model: request.model,
      hasImages: !!request.images?.length
    });
    
    // Build messages array with context
    const messages = await this.buildMessageContext(request);
    
    // Get only enabled tools in Ollama format
    const enabledTools = this.toolSelection.getEnabledTools();
    const tools = enabledTools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema || {}
      }
    }));
    
    const processedRequest: ProcessedRequest = {
      model: request.model,
      messages,
      stream: true,
      tools: tools.length > 0 ? tools : undefined,
      options: {
        temperature: request.temperature || 0.7,
        top_p: request.top_p || 0.9,
        seed: request.seed,
        num_ctx: request.num_ctx || 4096
      }
    };
    
    // Store correlation ID for tracking
    (processedRequest as any)._correlationId = correlationId;
    
    logger.debug(`📋 Request prepared with \${tools.length} tools`);
    
    return processedRequest;
  }
  
  /**
   * Enhanced streaming with proper tool handling
   */
  async *stream(
    request: ProcessedRequest
  ): AsyncGenerator<any, void, unknown> {
    const correlationId = (request as any)._correlationId || uuidv4();
    const host = this.getOllamaHost();
    
    logger.info(`🌊 Starting stream \${correlationId} to \${host}`);
    
    try {
      // Make Ollama API call
      const response = await fetch(`\${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });
      
      if (!response.ok) {
        throw new Error(`Ollama error: \${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              
              // Handle tool calls
              if (chunk.message?.tool_calls) {
                for (const toolCall of chunk.message.tool_calls) {
                  const toolResponse = await this.handleToolCall(
                    toolCall,
                    correlationId
                  );
                  
                  // Inject tool response into stream
                  yield {
                    ...chunk,
                    tool_response: toolResponse
                  };
                }
              } else {
                // Regular content chunk
                yield chunk;
              }
              
            } catch (e) {
              logger.error(`Error parsing chunk: \${e}`);
            }
          }
        }
      }
      
    } catch (error) {
      logger.error(`Stream error \${correlationId}:`, error);
      throw error;
    }
  }
  
  /**
   * Handle tool call with HIL support
   */
  private async handleToolCall(
    toolCall: any,
    correlationId: string
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const toolCallId = toolCall.id || uuidv4();
    
    logger.info(`🔧 Tool call \${toolCallId}`, {
      name: toolCall.function.name,
      correlationId
    });
    
    try {
      // Check if tool is enabled
      if (!this.toolSelection.isToolEnabled(toolCall.function.name)) {
        return {
          id: toolCallId,
          success: false,
          error: 'Tool is disabled',
          duration: Date.now() - startTime
        };
      }
      
      // Parse namespace
      const parsed = this.namespaceManager.parseToolName(toolCall.function.name);
      if (!parsed) {
        throw new Error(`Invalid tool name: \${toolCall.function.name}`);
      }
      
      // Request HIL confirmation if enabled
      if (this.hilManager.isEnabled()) {
        const approved = await this.hilManager.requestConfirmation({
          toolName: toolCall.function.name,
          arguments: toolCall.function.arguments,
          serverId: parsed.serverId
        });
        
        if (!approved) {
          return {
            id: toolCallId,
            success: false,
            error: 'Tool call rejected by user',
            duration: Date.now() - startTime
          };
        }
      }
      
      // Parse arguments if they're a string
      let args = toolCall.function.arguments;
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch (e) {
          logger.warn('Failed to parse tool arguments as JSON');
        }
      }
      
      // Execute tool with original name
      const originalName = this.namespaceManager.getOriginalToolName(toolCall.function.name);
      const response = await this.mcpManager.invokeTool({
        serverId: parsed.serverId,
        toolName: originalName || parsed.toolName,
        arguments: args
      });
      
      return {
        id: toolCallId,
        success: response.success,
        result: response.result,
        error: response.error,
        duration: Date.now() - startTime,
        serverId: parsed.serverId,
        toolName: parsed.toolName
      };
      
    } catch (error: any) {
      logger.error(`Tool call failed \${toolCallId}:`, error);
      
      return {
        id: toolCallId,
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    }
  }
  
  /**
   * Get Ollama host from deployment config
   */
  private getOllamaHost(): string {
    return this.deploymentConfig.ollama.host;
  }
  
  /**
   * Build message context with history if needed
   */
  private async buildMessageContext(request: ChatRequest): Promise<any[]> {
    const messages = [];
    
    // Add system message if configured
    const systemPrompt = this.deploymentConfig.systemPrompt || 
      'You are a helpful AI assistant with access to various tools.';
    
    messages.push({
      role: 'system',
      content: systemPrompt
    });
    
    // Add conversation history if available
    if (request.messages && Array.isArray(request.messages)) {
      messages.push(...request.messages);
    } else {
      // Add current message
      messages.push({
        role: 'user',
        content: request.content || request.prompt || '',
        images: request.images
      });
    }
    
    return messages;
  }
  
  /**
   * Check if model is compatible
   */
  isCompatibleModel(model: string): boolean {
    const compatibleModels = (process.env.COMPATIBLE_MODELS || 'qwen2.5,qwen3,llama3.1,llama3.2,mistral,deepseek-r1')
      .split(',')
      .map(m => m.trim());
    
    const baseModel = model.split(':')[0];
    return compatibleModels.includes(baseModel);
  }
  
  /**
   * Get streamliner stats
   */
  getStats(): {
    hilEnabled: boolean;
    totalTools: number;
    enabledTools: number;
    servers: number;
  } {
    const toolStats = this.toolSelection.getStats();
    
    return {
      hilEnabled: this.hilManager.isEnabled(),
      totalTools: toolStats.totalTools,
      enabledTools: toolStats.enabledTools,
      servers: toolStats.servers
    };
  }
  
  /**
   * Direct stream without tool handling (for non-tool models)
   */
  async *directStream(
    request: ProcessedRequest
  ): AsyncGenerator<any, void, unknown> {
    const host = this.getOllamaHost();
    
    // Remove tools from request for direct streaming
    const cleanRequest = { ...request };
    delete cleanRequest.tools;
    
    try {
      const response = await fetch(`\${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanRequest)
      });
      
      if (!response.ok) {
        throw new Error(`Ollama error: \${response.statusText}`);
      }
      
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }
      
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const chunk = JSON.parse(line);
              yield chunk;
            } catch (e) {
              logger.error(`Error parsing chunk: \${e}`);
            }
          }
        }
      }
    } catch (error) {
      logger.error('Direct stream error:', error);
      throw error;
    }
  }
}
