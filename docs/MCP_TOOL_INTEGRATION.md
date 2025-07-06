# MCP Tool Integration for Subproject 3

## Overview

This document describes the implementation of MCP (Model Context Protocol) tool integration for subproject 3 (Multi-host deployment) in the Olympian AI Lightweight system.

## Architecture

The tool integration feature consists of several key components:

### 1. ToolIntegrationService (`packages/server/src/services/ToolIntegrationService.ts`)

This service handles:
- Converting MCP tools to OpenAI-compatible format
- Injecting tools into model requests
- Parsing tool calls from model responses
- Executing tool calls via MCP service
- Formatting tool results for the model

### 2. ToolEnabledOllamaStreamliner (`packages/server/src/services/ToolEnabledOllamaStreamliner.ts`)

An extended version of OllamaStreamliner that:
- Inherits all base functionality
- Adds tool injection to processRequest
- Intercepts tool calls during streaming
- Handles tool execution and continuation
- Maintains backward compatibility

### 3. StreamlinerFactory (`packages/server/src/api/StreamlinerFactory.ts`)

A factory that:
- Detects if running in subproject 3
- Creates appropriate streamliner instance
- Manages MCP service connection
- Provides singleton access

## How It Works

### 1. Initialization Flow

```
Server Start
    ↓
Initialize MCP Service (in index.ts)
    ↓
Create ToolEnabledOllamaStreamliner (via factory)
    ↓
Connect MCP Service to Streamliner
    ↓
Ready for Tool-Enabled Chat
```

### 2. Chat Request Flow with Tools

```
User Message
    ↓
Model Capability Check (has tools?)
    ↓
Inject Available MCP Tools
    ↓
Send to Ollama with Tools
    ↓
Stream Response
    ↓
Detect Tool Calls in Response
    ↓
Execute Tools via MCP
    ↓
Continue Conversation with Results
    ↓
Final Response to User
```

### 3. Tool Call Format

The system uses OpenAI-compatible tool format:

```json
{
  "type": "function",
  "function": {
    "name": "serverId_toolName",
    "description": "Tool description",
    "parameters": {
      "type": "object",
      "properties": {},
      "required": []
    }
  }
}
```

## Implementation Details

### Tool Name Mapping

MCP tools are namespaced with their server ID to avoid conflicts:
- MCP Tool: `github.create_issue` 
- Model Tool: `github_create_issue`

### Tool Execution Flow

1. Model returns tool_calls in response
2. Parse tool calls and extract server/tool names
3. Execute via MCPService.callTool()
4. Format results as tool messages
5. Continue conversation with tool results

### Error Handling

- Tool execution failures return error messages
- Conversation continues even if tools fail
- All errors are logged for debugging

## Configuration

### Environment Variables

- `SUBPROJECT=3` - Enable subproject 3 mode
- `DEPLOYMENT_MODE=docker-multi-host` - Alternative activation
- `MCP_ENABLED=true` - Enable MCP services (default)
- `MCP_OPTIONAL=true` - Continue if MCP fails (default)

### Model Requirements

Models must have tool capability detected or configured:
- Official capabilities field includes "tools"
- Programmatic tool testing passes
- Custom capability configuration enables tools

## Integration Steps

To complete the integration in existing files:

### 1. Update `packages/server/src/index.ts`

After MCP initialization, add:

```typescript
// Connect MCP service to streamliner for tool integration
if (IS_SUBPROJECT_3 && mcpService) {
  try {
    const { updateStreamlinerMCPService } = require('./api/StreamlinerFactory');
    updateStreamlinerMCPService(mcpService);
    console.log('✅ [Server] Connected MCP service to tool-enabled streamliner');
  } catch (error) {
    console.warn('⚠️ [Server] Failed to connect MCP service to streamliner:', error);
  }
}
```

### 2. Update `packages/server/src/api/chat.ts`

Replace:
```typescript
const streamliner = new OllamaStreamliner();
```

With:
```typescript
import { getStreamlinerInstance } from './StreamlinerFactory';
const streamliner = getStreamlinerInstance();
```

## Testing

### Manual Testing

1. Start subproject 3: `make quick-docker-multi`
2. Select a model with tool capability (e.g., llama3.2)
3. Send a message that would benefit from tools
4. Observe tool execution in logs
5. Verify tool results in response

### Example Conversation

```
User: "What files are in the current directory?"

Model: I'll check the current directory for you.
[Executes filesystem_list_directory tool]

Based on the directory listing, here are the files...
```

## Limitations

1. Tool calls are sequential, not parallel
2. Maximum tool call depth is limited by context
3. Tool results must fit in remaining context window
4. Only stdio-based MCP servers supported in subproject 3

## Future Enhancements

1. Parallel tool execution
2. Tool call batching
3. Streaming tool results
4. Tool usage analytics
5. Custom tool filtering per model

## Troubleshooting

### Tools Not Being Injected

1. Check model has tool capability
2. Verify MCP service is initialized
3. Confirm running in subproject 3 mode
4. Check MCP servers are running

### Tool Calls Not Executed

1. Verify tool name format is correct
2. Check MCP server is responding
3. Review tool arguments parsing
4. Check error logs for details

### Conversation Not Continuing

1. Ensure tool results are formatted correctly
2. Check context window limits
3. Verify streaming completion detection
4. Review recursive call handling

## Related Files

- `/packages/server/src/services/MCPService.ts` - MCP server management
- `/packages/server/src/api/mcp.ts` - MCP API endpoints
- `/packages/server/src/services/OllamaStreamliner.ts` - Base streaming logic
- `/packages/server/src/services/CustomModelCapabilityService.ts` - Model capabilities
