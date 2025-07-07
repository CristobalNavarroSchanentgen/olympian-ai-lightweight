# Tool Injection Fix for Subproject 3 (Multi-host Deployment)

## Issue
The OllamaStreamliner service was not properly injecting MCP tools into prompts for models with tool capabilities. This prevented models from using available MCP tools.

## Solution Overview
The fix involves:
1. Importing and initializing the MCPToolIntegrationService in OllamaStreamliner
2. Modifying the `processRequest` method to inject tools when the model has tool capability
3. Updating the streaming response handler to process tool calls
4. Executing tool calls via MCP and continuing the conversation with results

## Key Changes

### 1. Import MCPToolIntegrationService
```typescript
import { MCPToolIntegrationService } from './MCPToolIntegrationService';
```

### 2. Initialize in Constructor
```typescript
private toolIntegrationService: MCPToolIntegrationService;

constructor() {
  // ... existing initialization ...
  
  // Initialize tool integration service
  this.toolIntegrationService = MCPToolIntegrationService.getInstance();
}
```

### 3. Update ProcessedRequest Interface
The ProcessedRequest type needs to support tools:
```typescript
interface ProcessedRequest {
  model: string;
  messages: Array<{ role: string; content: string; images?: string[] }>;
  stream: boolean;
  tools?: any[];  // Add tools array
  tool_choice?: string;  // Add tool choice
}
```

### 4. Inject Tools in processRequest
```typescript
async processRequest(
  request: ChatRequest,
  memoryConfig?: MemoryConfig
): Promise<ProcessedRequest> {
  // ... existing code ...

  // Standard text handling with tool injection
  let processedRequest = this.formatTextRequest(request, messages);
  
  // NEW: Inject tools if model has tool capability
  if (capabilities.tools && this.toolIntegrationService.isAvailable()) {
    logger.info(`🔧 Model '${request.model}' has tool capability, injecting MCP tools...`);
    
    try {
      const toolDefinitions = await this.toolIntegrationService.getOllamaToolDefinitions();
      
      if (toolDefinitions.length > 0) {
        processedRequest = {
          ...processedRequest,
          tools: toolDefinitions,
          tool_choice: 'auto'
        };
        
        logger.info(`✅ Injected ${toolDefinitions.length} MCP tools into request`);
      }
    } catch (error) {
      logger.error(`❌ Failed to inject tools:`, error);
      // Continue without tools rather than failing the request
    }
  }
  
  return processedRequest;
}
```

### 5. Update StreamResult Interface
```typescript
interface StreamResult {
  fullContent: string;
  thinking?: ThinkingProcessingResult;
  toolCalls?: Array<{
    id: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}
```

### 6. Update OllamaStreamResponse Interface
```typescript
interface OllamaStreamResponse {
  message?: {
    content?: string;
    tool_calls?: Array<{
      id?: string;
      function: {
        name: string;
        arguments: string | Record<string, any>;
      };
    }>;
  };
  done?: boolean;
  done_reason?: string;
  error?: string;
}
```

### 7. Handle Tool Calls in streamChat
```typescript
async streamChat(
  processedRequest: ProcessedRequest,
  onToken: (token: string) => void,
  onComplete?: (result: StreamResult) => void,
  clientIp?: string
): Promise<void> {
  // ... existing code ...
  
  let accumulatedToolCalls: Array<{
    id?: string;
    function: {
      name: string;
      arguments: string | Record<string, any>;
    };
  }> = [];
  
  // In the JSON parsing loop:
  if (json.message?.tool_calls && json.message.tool_calls.length > 0) {
    logger.info(`🔧 Tool calls detected in stream: ${json.message.tool_calls.length} calls`);
    
    for (const toolCall of json.message.tool_calls) {
      const callWithId = {
        ...toolCall,
        id: toolCall.id || `call_${Date.now()}_${Math.random().toString(36).substring(7)}`
      };
      accumulatedToolCalls.push(callWithId);
    }
  }
  
  // After stream completion, execute tool calls:
  if (accumulatedToolCalls.length > 0 && this.toolIntegrationService.isAvailable()) {
    logger.info(`🔧 Executing ${accumulatedToolCalls.length} tool calls...`);
    
    try {
      const toolCalls = accumulatedToolCalls.map(call => ({
        id: call.id!,
        type: 'function' as const,
        function: {
          name: call.function.name,
          arguments: typeof call.function.arguments === 'string' 
            ? call.function.arguments 
            : JSON.stringify(call.function.arguments)
        }
      }));
      
      const toolResults = await this.toolIntegrationService.executeToolCalls(toolCalls);
      
      if (toolResults.length > 0) {
        logger.info(`✅ Tool execution complete, ${toolResults.length} results received`);
        
        // Continue conversation with tool results
        const toolResponseRequest = {
          ...processedRequest,
          messages: [
            ...processedRequest.messages,
            {
              role: 'assistant',
              content: fullResponseContent || '',
              tool_calls: toolCalls
            },
            ...toolResults.map(result => ({
              role: 'tool',
              content: result.content,
              tool_call_id: result.tool_call_id
            }))
          ]
        };
        
        // Make another request to get final response
        await this.streamChat(toolResponseRequest, onToken, onComplete, clientIp);
        return;
      }
    } catch (error) {
      logger.error(`❌ Tool execution failed:`, error);
    }
  }
  
  // ... rest of existing completion logic ...
}
```

## Implementation Steps

1. Update the shared types to include tools in ProcessedRequest
2. Modify OllamaStreamliner.ts with the changes above
3. Ensure MCPToolIntegrationService is properly initialized
4. Test with a model that has tool capabilities

## Testing

To test the fix:
1. Start the multi-host deployment: `make quick-docker-multi`
2. Select a model with tool capabilities (e.g., qwen2.5:14b-instruct-q4_0)
3. Ask a question that would benefit from tool use
4. Verify that tools are injected and executed properly

## Benefits

- Models with tool capabilities can now use MCP tools
- Seamless integration with existing chat flow
- Proper error handling if tools fail
- Maintains backward compatibility with non-tool models
