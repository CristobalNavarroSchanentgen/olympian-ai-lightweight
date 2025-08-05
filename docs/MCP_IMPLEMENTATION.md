# Model Context Protocol (MCP) Implementation Guide

## Overview

This implementation follows all MCP best practices and guidelines to provide a robust, enterprise-grade MCP client system. The architecture is built with simplicity and strong fundamentals in mind.

## Architecture Components

### Core Services

1. **MCPConfigParser** - Handles configuration discovery and endpoint validation
2. **MCPHealthChecker** - Proactive health monitoring with exponential backoff
3. **MCPToolCache** - Efficient tool discovery and caching with hit/miss tracking
4. **MCPClientService** - Enhanced MCP client with protocol negotiation and fallback

### Key Features

- ✅ **Tool Discovery and Initialization** - JSON-RPC 2.0 with capability negotiation
- ✅ **Local Tool Caching** - Efficient access with background refresh
- ✅ **Health Checking** - Proactive endpoint testing with failover
- ✅ **Metadata Field Support** - `_meta` field for contextual data
- ✅ **Fallback Strategies** - Automatic server failover and recovery
- ✅ **Configuration Discovery** - Endpoint extraction from multiple sources
- ✅ **Protocol Backwards Compatibility** - Streamable HTTP with SSE fallback

## Configuration

### Deployment-Specific Configurations

Olympian AI Lightweight provides deployment-specific MCP configurations:

#### Subproject 3: Multi-Host Deployment (HTTP-Only)

For multi-host deployments, the system enforces a **self-reliant, process-based architecture** with stdio-only transports. See [MCP_HTTP_MULTIHOST.md](./MCP_HTTP_MULTIHOST.md) for detailed documentation.

**Key Features:**
- All MCP servers run as child processes
- Stdio-only transport (no HTTP support)
- Process-based execution
- Zero external dependencies

**Quick Setup:**
```bash
# Configure environment
cp .env.example .env
# Edit .env with your tokens

# Start multihost deployment
make quick-docker-multi
```

### Basic Configuration File

For custom configurations, create a configuration file at one of these locations:
- `~/.config/mcp/config.json`
- `~/.mcp/config.json`
- `~/.olympian-ai-lite/mcp_config.json`
- `./mcp-config.json`

```json
{
  "mcpServers": {
    "web_search": {
      "url": "https://api.example.com/mcp",
      "type": "server",
      "auth": "Bearer your-api-key-here"
    }
  }
}
```

### Server Configuration Options

Each server can be configured with:

```typescript
{
  url: string;                    // Connection endpoint
  type: 'server' | 'discovery_channel' | 'registry';
  auth?: string;                  // Authentication (Bearer token, API key)
  headers?: Record<string, string>;
  timeout?: number;               // Request timeout (default: 30000ms)
  retries?: number;               // Max retries (default: 3)
}
```

### Transport Types

- **`streamable_http`** - Modern HTTP transport (recommended)
- **`http`** - Legacy HTTP (auto-upgrades to streamable_http)
- **`sse`** - Server-Sent Events (fallback)

**Note: HTTP transport is not supported in multihost deployment mode - stdio only.

## API Endpoints

### Core MCP Operations

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp/status` | GET | Comprehensive system status |
| `/api/mcp/servers` | GET | List all MCP servers |
| `/api/mcp/servers` | POST | Add new MCP server |
| `/api/mcp/servers/:id` | GET | Get server details |
| `/api/mcp/servers/:id/start` | POST | Start server |
| `/api/mcp/servers/:id/stop` | POST | Stop server |

### Tool Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp/tools` | GET | Get all cached tools |
| `/api/mcp/tools/search` | GET | Search tools by name/pattern |
| `/api/mcp/tools/:name/best` | GET | Get best tool for name |
| `/api/mcp/tools/select` | POST | Smart tool selection |
| `/api/mcp/invoke` | POST | Invoke tool with fallback |

### Health & Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp/health` | GET | Overall health status |
| `/api/mcp/servers/:id/health` | GET | Server health status |
| `/api/mcp/servers/:id/health-check` | POST | Force health check |
| `/api/mcp/metrics` | GET | System metrics |
| `/api/mcp/diagnostics` | POST | Run diagnostics |

### Cache Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/mcp/cache/status` | GET | Cache statistics |
| `/api/mcp/servers/:id/cache/refresh` | POST | Refresh server cache |
| `/api/mcp/servers/:id/cache` | DELETE | Invalidate server cache |
| `/api/mcp/cache` | DELETE | Clear all caches |

## Usage Examples

### 1. Adding an MCP Server

```bash
curl -X POST http://localhost:3001/api/mcp/servers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "custom-server",
    "transport": "streamable_http",
    "endpoint": "http://custom-server:3000/mcp",
    "timeout": 30000,
    "priority": 1
  }'
```

### 2. Invoking a Tool

```bash
curl -X POST http://localhost:3001/api/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "server_123",
    "toolName": "search",
    "arguments": {
      "query": "example search"
    },
    "metadata": {
      "requestId": "req_456",
      "userId": "user_789"
    }
  }'
```

### 3. Smart Tool Selection

```bash
curl -X POST http://localhost:3001/api/mcp/tools/select \
  -H "Content-Type: application/json" \
  -d '{
    "query": "search web for information",
    "context": {
      "domain": "technology"
    }
  }'
```

## Best Practices Implementation

### 1. Tool Discovery and Initialization

The system follows the complete MCP initialization flow:

1. **Configuration Parsing** - Extract endpoints from config files
2. **Connection Establishment** - JSON-RPC 2.0 with timeout handling
3. **Protocol Negotiation** - Capability exchange and version checking
4. **Tool Discovery** - Concurrent discovery with caching
5. **Health Monitoring** - Background health checks with exponential backoff

### 2. Metadata Field Support

The implementation supports both argument merging and metadata field patterns:

```typescript
// Metadata field approach (recommended)
{
  "serverId": "server_123",
  "toolName": "search",
  "arguments": {
    "query": "example"
  },
  "metadata": {
    "userId": "user_789",
    "sessionId": "session_456"
  }
}
```

### 3. Fallback and Recovery

Automatic failover is implemented with:
- **Server Health Tracking** - Continuous health monitoring
- **Tool Availability Mapping** - Multiple servers per tool
- **Priority-Based Selection** - Healthy servers preferred
- **Exponential Backoff** - Failed servers get reduced priority

### 4. Caching Strategy

Tool caching follows these principles:
- **Local Storage** - Tools cached in memory for fast access
- **Hit/Miss Tracking** - Performance metrics collection
- **Background Refresh** - Expired caches refreshed automatically
- **Invalidation** - Manual and automatic cache clearing

## Architecture Benefits

### Simple & Strong Fundamentals

- **Separation of Concerns** - Each service has a single responsibility
- **Event-Driven Design** - Loose coupling with event emitters
- **Singleton Pattern** - Shared state management
- **Error Boundaries** - Comprehensive error handling
- **Resource Management** - Proper cleanup and shutdown

### Enterprise Features

- **Health Monitoring** - Proactive issue detection
- **Metrics Collection** - Performance and usage tracking
- **Configuration Discovery** - Multiple config sources
- **Protocol Compatibility** - Support for all MCP transport types
- **Graceful Degradation** - Continues working with partial failures

## Troubleshooting

### Common Issues

1. **Connection Timeouts**
   - Check server endpoints in health status
   - Verify network connectivity
   - Increase timeout values in configuration

2. **Tool Not Found**
   - Check cache status and refresh if needed
   - Verify server is running and healthy
   - Check tool discovery logs

3. **Authentication Errors**
   - Verify API keys and tokens in configuration
   - Check server authentication requirements
   - Review server logs for auth failures

### Diagnostic Commands

```bash
# Check overall system health
curl http://localhost:3001/api/mcp/health

# Run comprehensive diagnostics
curl -X POST http://localhost:3001/api/mcp/diagnostics

# Check cache status
curl http://localhost:3001/api/mcp/cache/status

# Force health check on specific server
curl -X POST http://localhost:3001/api/mcp/servers/SERVER_ID/health-check
```

## Integration with Subprojects

This MCP implementation is designed to work seamlessly with all deployment modes:

1. **Same-host with Ollama container** - Basic HTTP configuration
2. **Same-host with existing Ollama** - Connects to existing services
3. **Multi-host deployment** - Self-reliant container-based architecture (see [MCP_HTTP_MULTIHOST.md](./MCP_HTTP_MULTIHOST.md))

The system automatically detects the deployment configuration and optimizes accordingly.

## Performance Considerations

- **Connection Pooling** - Reuses connections for efficiency
- **Concurrent Discovery** - Parallel tool discovery during startup
- **Background Processing** - Health checks and cache refresh don't block requests
- **Memory Management** - Proper cleanup prevents memory leaks
- **Rate Limiting** - Prevents overwhelming MCP servers

## Security Features

- **Authentication Support** - Bearer tokens and API keys
- **Request Validation** - Zod schema validation for all inputs
- **Error Sanitization** - Prevents information leakage
- **Timeout Protection** - Prevents hanging requests
- **Resource Limits** - Configurable limits for safety

This implementation provides a production-ready MCP client that follows all best practices while maintaining simplicity and strong architectural foundations.
