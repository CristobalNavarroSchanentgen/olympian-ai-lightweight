# MCP (Model Context Protocol) Architecture

## Overview

The MCP architecture in Olympian AI Lightweight has been dramatically simplified from a complex multi-service system to a single, unified `MCPManager` service. This document describes the new architecture, its benefits, and usage patterns.

## Architecture Evolution

### Before (Complex Multi-Service)
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCPService    │────▶│  MCPClientStdio  │────▶│ MCPHealthChecker│
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                          │
         ▼                       ▼                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ MCPConfigParser │────▶│   MCPToolCache   │────▶│MCPToolIntegration│
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                          │
         ▼                       ▼                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MCPClient      │────▶│ToolIntegration   │────▶│   Complex Flow  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

### After (Unified Single Service)
```
┌─────────────────────────────────────────┐
│            MCPManager                   │
│  ┌─────────────────────────────────┐   │
│  │ • Server Management             │   │
│  │ • Tool Discovery & Caching      │   │
│  │ • Health Monitoring             │   │
│  │ • WebSocket Notifications       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  stdio processes │
         │  (npx servers)   │
         └──────────────────┘
```

## Core Components

### MCPManager (`packages/server/src/services/MCPManager.ts`)

The unified service that handles all MCP operations:

```typescript
class MCPManager extends EventEmitter {
  // Core functionality
  - Server lifecycle management
  - Tool discovery and caching
  - Health monitoring with retries
  - WebSocket event broadcasting
  
  // Key methods
  async initialize(): Promise<void>
  async addServer(config: MCPServer): Promise<void>
  async removeServer(serverId: string): Promise<void>
  async listTools(): Promise<MCPTool[]>
  async callTool(serverId: string, toolName: string, args: any): Promise<any>
  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse>
  getServers(): MCPServer[]
  getStats(): { total: number; running: number; error: number }
  async cleanup(): Promise<void>
}
```

## Key Features

### 1. Server Management
- Automatic initialization of default MCP servers (GitHub, filesystem, memory)
- Dynamic server addition/removal
- Graceful shutdown and cleanup
- All servers are optional by default (prevents blocking)

### 2. Tool Discovery
- Automatic tool discovery on server startup
- In-memory caching with usage tracking
- Tool name format: `serverId.toolName`
- Efficient tool listing across all servers

### 3. Health Monitoring
- Periodic health checks (30s intervals)
- Automatic retry logic (3 attempts)
- Server status tracking (running, error, stopped)
- Failure tracking and reporting

### 4. WebSocket Integration
- Real-time notifications for server events
- Broadcast updates to connected clients
- Event types: server_connected, server_removed, server_error

## Configuration

### Environment Variables
```bash
# MCP Configuration
MCP_ENABLED=true              # Enable/disable MCP services
CONNECTION_TIMEOUT=15000      # Connection timeout in ms
HEALTH_CHECK_INTERVAL=30000   # Health check interval in ms
MAX_HEALTH_FAILURES=3         # Max failures before marking server as error

# Server-specific
GITHUB_PERSONAL_ACCESS_TOKEN=xxx  # For GitHub MCP server
BRAVE_API_KEY=xxx                 # For Brave search server
```

### Default Servers
```javascript
[
  {
    id: 'github',
    name: 'github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    optional: true
  },
  {
    id: 'filesystem',
    name: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/app'],
    optional: true
  },
  {
    id: 'memory',
    name: 'memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    optional: true
  }
]
```

## API Endpoints

### Status & Health
```
GET /api/mcp/status
Response: {
  success: true,
  data: {
    initialized: true,
    stats: { total: 3, running: 2, error: 1 },
    servers: [...]
  }
}

GET /api/mcp/health
Response: {
  success: true,
  status: "healthy",
  stats: { total: 3, running: 2, error: 1 }
}
```

### Server Management
```
GET /api/mcp/servers
Response: {
  success: true,
  data: [
    {
      id: "github",
      name: "github",
      status: "running",
      transport: "stdio"
    }
  ]
}

POST /api/mcp/servers
Body: {
  name: "custom-server",
  command: "npx",
  args: ["-y", "@my/custom-server"],
  env: { API_KEY: "xxx" },
  optional: true
}

DELETE /api/mcp/servers/:serverId
```

### Tool Operations
```
GET /api/mcp/tools
Response: {
  success: true,
  data: {
    tools: [...],
    count: 15
  }
}

POST /api/mcp/tools/call
Body: {
  serverId: "github",
  toolName: "search_repositories",
  arguments: { query: "mcp" }
}

POST /api/mcp/invoke (legacy format)
Body: {
  serverId: "github",
  toolName: "search_repositories",
  arguments: { query: "mcp" }
}
```

## Integration with Chat

### ToolEnabledOllamaStreamliner

The streamliner integrates with MCPManager to provide tool capabilities to AI models:

```typescript
class ToolEnabledOllamaStreamliner extends OllamaStreamliner {
  // Automatically injects available tools into requests
  async processRequest(request, memoryConfig): Promise<ProcessedRequest>
  
  // Handles tool calls in streaming responses
  async streamChat(request, onToken, onComplete, clientIp): Promise<void>
}
```

### Tool Format in AI Requests
```javascript
{
  type: 'function',
  function: {
    name: 'github.search_repositories',  // serverId.toolName format
    description: 'Search GitHub repositories',
    parameters: { /* JSON Schema */ }
  }
}
```

## Error Handling

### Connection Failures
- Automatic retry with exponential backoff
- Optional servers don't block initialization
- Detailed error logging and tracking

### Tool Call Failures
- Graceful error responses
- Error tracking per server
- Automatic health status updates

### Server Crashes
- Automatic detection via health checks
- Status update to 'error'
- Prevents further tool calls

## Benefits of New Architecture

### 1. **Simplicity**
- Single service instead of 9+ interconnected services
- ~400 lines vs ~4000 lines of code
- Clear, linear initialization flow

### 2. **Reliability**
- Built-in retry logic
- Health monitoring
- Graceful degradation

### 3. **Performance**
- In-memory tool caching
- Reduced service coordination overhead
- Efficient tool discovery

### 4. **Maintainability**
- Single file to modify
- Clear responsibilities
- Easy to test

### 5. **Flexibility**
- All servers optional
- Dynamic server management
- Easy to add custom servers

## Migration from Old Architecture

### For Developers
1. Remove all imports of old MCP services
2. Replace with `import { MCPManager } from './services/MCPManager'`
3. Use `MCPManager.getInstance()` instead of individual services
4. No API changes - frontend remains compatible

### For Operations
1. No configuration changes required
2. Environment variables remain the same
3. Docker setup unchanged
4. Monitoring endpoints compatible

## Best Practices

### 1. Server Configuration
- Keep servers optional unless critical
- Provide meaningful descriptions
- Use environment variables for secrets

### 2. Tool Naming
- Use clear, descriptive tool names
- Follow the `serverId.toolName` convention
- Include good descriptions for AI understanding

### 3. Error Handling
- Always handle tool call failures gracefully
- Log errors for debugging
- Provide user-friendly error messages

### 4. Performance
- Tools are cached automatically
- Avoid calling `listTools()` repeatedly
- Use health stats for monitoring

## Troubleshooting

### Server Won't Start
```bash
# Check logs
docker logs olympian-backend

# Common issues:
- Missing environment variables (API keys)
- Network connectivity (for npx downloads)
- Incorrect command/args configuration
```

### Tools Not Available
```bash
# Check server status
curl http://localhost:3001/api/mcp/status

# Verify specific server
curl http://localhost:3001/api/mcp/servers
```

### Health Check Failures
```bash
# Check health endpoint
curl http://localhost:3001/api/mcp/health

# Review server logs for specific errors
# Servers marked as 'error' after 3 consecutive failures
```

## Future Enhancements

1. **Persistent Tool Cache** - Redis-backed caching for multi-instance deployments
2. **Tool Usage Analytics** - Track which tools are most used
3. **Dynamic Tool Loading** - Hot-reload tools without restart
4. **Tool Versioning** - Support multiple versions of the same tool
5. **Tool Permissions** - Role-based access to tools

## Conclusion

The new MCP architecture represents a significant simplification while maintaining all functionality. By consolidating into a single service, we've improved reliability, performance, and maintainability. The architecture is now more accessible to developers and easier to operate in production.
