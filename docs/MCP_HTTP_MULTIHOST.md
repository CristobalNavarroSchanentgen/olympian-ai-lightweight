# MCP HTTP-Only Configuration for Multihost Deployment

This document describes the HTTP-only Model Context Protocol (MCP) configuration for **Subproject 3: Multi-host deployment** (`make quick-docker-multi`).

## Overview

Subproject 3 has been refactored to use **pure HTTP transport** for MCP communication, completely removing stdio support to enable robust multi-host deployments. This architecture allows MCP servers to run independently on the host machine while the Olympian AI application runs in Docker containers.

## Key Changes

### 🚫 Stdio Support Removed
- All stdio-based transport logic has been removed from the multihost deployment
- MCPClient automatically rejects stdio configurations in multihost mode
- MCPConfigParser validates configurations to ensure HTTP-only compliance

### 🌐 HTTP-Only Transport
- Uses JSON-RPC 2.0 over HTTP as specified in the MCP protocol
- Supports both single JSON responses and Server-Sent Events (SSE) streaming
- Implements proper HTTP headers for MCP protocol compliance

### 🔧 Architecture Changes
- **MCPClient.ts**: Removed stdio transport creation and child process management
- **MCPConfigParser.ts**: Added multihost validation and stdio rejection
- **mcp-config.multihost.json**: Pure HTTP configuration with comprehensive documentation

## Configuration Format

The `mcp-config.multihost.json` follows the HTTP-only MCP specification:

```json
{
  "mcpServers": {
    "server-name": {
      "transport": "http",
      "endpoint": "http://host.docker.internal:3001/mcp",
      "description": "Server description",
      "optional": true,
      "timeout": 30000,
      "retries": 3,
      "headers": {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "MCP-Protocol-Version": "2024-11-05",
        "Authorization": "Bearer token-if-needed"
      }
    }
  }
}
```

## Supported MCP Servers

The configuration includes the following HTTP-based MCP servers:

| Server | Port | Description | Authentication |
|--------|------|-------------|----------------|
| github | 3001 | GitHub repository access | Bearer token required |
| nasa-mcp | 3002 | NASA space data | API key optional |
| met-museum | 3003 | Metropolitan Museum API | None |
| Context7 | 3004 | Documentation search | None |
| applescript-mcp | 3005 | macOS automation | None |
| web-search | 3006 | Web search capabilities | API key optional |

## HTTP Transport Specification

### JSON-RPC 2.0 over HTTP
- **Method**: POST for client-to-server messages
- **Content-Type**: `application/json`
- **Accept**: `application/json, text/event-stream`
- **Protocol Version**: Specified in `MCP-Protocol-Version` header

### Request Format
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { "param": "value" }
  }
}
```

### Response Format
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool response"
      }
    ]
  }
}
```

## Setup and Deployment

### 1. Environment Configuration

Set the following environment variables for multihost mode:

```bash
export DEPLOYMENT_MODE=multi-host
export ENABLE_MULTI_HOST=true
export MCP_HTTP_ONLY=true
export NODE_ENV=multihost

# Authentication tokens (replace with actual values)
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your_actual_token
export NASA_API_KEY=your_nasa_key_if_needed
export BRAVE_API_KEY=your_brave_key_if_needed
```

### 2. Start MCP Servers on Host

Before starting the Olympian AI application, start the MCP servers on your host machine:

```bash
# GitHub MCP Server
npx -y @modelcontextprotocol/server-github --transport http --port 3001 &

# NASA MCP Server  
npx -y @programcomputer/nasa-mcp-server@latest --transport http --port 3002 &

# Met Museum MCP Server
npx -y metmuseum-mcp --transport http --port 3003 &

# Context7 MCP Server
npx -y @upstash/context7-mcp --transport http --port 3004 &

# AppleScript MCP Server (macOS only)
npx -y @sampullman/applescript-mcp --transport http --port 3005 &

# Web Search MCP Server
npx -y @modelcontextprotocol/server-brave-search --transport http --port 3006 &
```

### 3. Deploy Olympian AI

```bash
# Start multihost deployment
make quick-docker-multi
```

## Validation and Debugging

### Configuration Validation

The system automatically validates the configuration for HTTP-only compliance:

```javascript
// Check validation results
const configParser = MCPConfigParser.getInstance();
const results = configParser.getHttpOnlyValidationResults();

console.log('Accepted endpoints:', results.acceptedEndpoints);
console.log('Rejected stdio endpoints:', results.rejectedStdioEndpoints);
console.log('Invalid HTTP endpoints:', results.invalidHttpEndpoints);
```

### Debug Logs

Enable detailed MCP logging:

```bash
export DEBUG=mcp:*
export LOG_LEVEL=debug
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Connection timeout | MCP server not running | Check server status on host |
| Host resolution error | Docker networking issue | Verify `host.docker.internal` resolution |
| 405 Method Not Allowed | Server doesn't support HTTP POST | Ensure server uses HTTP transport |
| stdio rejection | Legacy config detected | Use HTTP endpoints only |
| Authentication failure | Invalid tokens | Check environment variables |

## Security Considerations

### Authentication
- Use Bearer tokens for authenticated services
- Store tokens in environment variables, not config files
- Rotate tokens regularly

### Network Security
- Servers should validate Origin header to prevent DNS rebinding
- Bind to localhost (127.0.0.1) when running locally
- Use HTTPS endpoints in production environments

### CORS Configuration
- Configure CORS properly for cross-origin requests
- Set appropriate Access-Control-Allow-Origin headers

## Performance Optimization

### Connection Management
- HTTP connections are reused when possible
- Connection pooling is implemented for efficiency
- Timeout values are optimized for each server type

### Retry Logic
- Exponential backoff for failed requests
- Configurable retry counts per server
- Fallback servers for high availability

### Caching
- Tool definitions and capabilities are cached
- Cache invalidation on server restart
- Configurable cache TTL values

## Migration from Stdio

If migrating from stdio-based configurations:

1. **Update transport type**: Change `"transport": "stdio"` to `"transport": "http"`
2. **Add endpoint URL**: Replace command/args with HTTP endpoint
3. **Add HTTP headers**: Include required MCP headers
4. **Start servers separately**: Run MCP servers as independent processes
5. **Update environment**: Set multihost deployment variables

### Example Migration

**Before (stdio):**
```json
{
  "command": "npx @modelcontextprotocol/server-github",
  "args": ["--stdio"],
  "env": {
    "GITHUB_PERSONAL_ACCESS_TOKEN": "token"
  }
}
```

**After (HTTP):**
```json
{
  "transport": "http",
  "endpoint": "http://host.docker.internal:3001/mcp",
  "headers": {
    "Authorization": "Bearer token",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream",
    "MCP-Protocol-Version": "2024-11-05"
  }
}
```

## Protocol Compliance

This implementation follows the official MCP specification:
- **JSON-RPC 2.0**: Standard request/response format
- **HTTP Transport**: POST requests with proper headers
- **SSE Streaming**: Optional for long-running operations
- **Session Management**: Mcp-Session-Id header support
- **Error Handling**: Standard JSON-RPC error codes

## Support and Troubleshooting

For issues with the HTTP-only multihost deployment:

1. Check server logs for HTTP-specific errors
2. Verify network connectivity between container and host
3. Validate JSON-RPC message format
4. Ensure proper authentication headers
5. Review security and CORS configuration

The system provides comprehensive logging and error reporting to help diagnose issues quickly.
