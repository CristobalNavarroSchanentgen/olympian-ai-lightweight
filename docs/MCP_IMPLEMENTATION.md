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

### 1. Subproject-Specific Configurations

Olympian AI Lightweight provides pre-configured MCP setups for each deployment subproject:

#### Subproject 3: Multi-Host Deployment (Default Configuration)

For multi-host deployments, use the default configuration provided in `mcp-config.multihost.json`:

```json
{
  "mcpServers": {
    "met-museum": {
      "command": "npx",
      "args": ["-y", "metmuseum-mcp"]
    },
    "applescript_execute": {
      "command": "uv",
      "args": [
        "--directory",
        "/Users/YOUR_USERNAME/Servers/applescript-mcp",
        "run",
        "src/applescript_mcp/server.py"
      ]
    },
    "nasa-mcp": {
      "command": "npx",
      "args": ["-y", "@programcomputer/nasa-mcp-server@latest"],
      "env": {
        "NASA_API_KEY": "YOUR_NASA_API_KEY_HERE"
      }
    },
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_GITHUB_TOKEN_HERE"
      }
    },
    "basic-memory": {
      "command": "uvx",
      "args": [
        "basic-memory",
        "mcp"
      ]
    },
    "Context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

**Setup Instructions for Subproject 3:**

1. Copy `mcp-config.multihost.json` to your preferred location:
   ```bash
   cp mcp-config.multihost.json ~/.config/mcp/config.json
   # OR
   cp mcp-config.multihost.json ~/.olympian-ai-lite/mcp_config.json
   ```

2. Configure your credentials:
   ```bash
   # Replace placeholder values with your actual credentials
   sed -i 's/YOUR_USERNAME/your-actual-username/g' ~/.config/mcp/config.json
   sed -i 's/YOUR_NASA_API_KEY_HERE/your-nasa-api-key/g' ~/.config/mcp/config.json
   sed -i 's/YOUR_GITHUB_TOKEN_HERE/your-github-token/g' ~/.config/mcp/config.json
   ```

3. Install required dependencies:
   ```bash
   # For AppleScript MCP (macOS only)
   pip install uv
   
   # For NASA and GitHub MCP servers
   npm install -g @programcomputer/nasa-mcp-server@latest
   npm install -g @modelcontextprotocol/server-github
   
   # For Context7 and Memory servers
   npm install -g @upstash/context7-mcp
   pip install basic-memory
   ```

#### Multi-Host Specific Features

The multihost configuration includes servers optimized for distributed deployments:

- **Met Museum MCP**: Provides access to Metropolitan Museum of Art collections
- **AppleScript MCP**: Enables automation of macOS applications (if running on macOS host)
- **NASA MCP**: Provides access to NASA APIs and space data
- **GitHub MCP**: Integrates with GitHub repositories and operations
- **Basic Memory**: Provides persistent memory across chat sessions
- **Context7**: Provides documentation and context retrieval capabilities

### 2. Basic Configuration File

For custom configurations, create a configuration file at one of these locations:
- `~/.config/mcp/config.json`
- `~/.mcp/config.json`
- `~/.olympian-ai-lite/mcp_config.json`
- `./mcp-config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "url": "stdio://node filesystem-server.js",
      "type": "server",
      "timeout": 30000,
      "retries": 3
    },
    "web_search": {
      "url": "https://api.example.com/mcp",
      "type": "server",
      "auth": "Bearer your-api-key-here"
    }
  }
}
```

### 3. Server Configuration Options

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

### 4. Transport Types

- **`stdio`** - For local command-line tools
- **`streamable_http`** - Modern HTTP transport (recommended)
- **`http`** - Legacy HTTP (auto-upgrades to streamable_http)
- **`sse`** - Server-Sent Events (fallback)

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
curl -X POST http://localhost:3001/api/mcp/servers \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "filesystem",
    "command": "node",
    "args": ["filesystem-server.js"],
    "transport": "stdio",
    "timeout": 30000,
    "priority": 1
  }'
```

### 2. Invoking a Tool

```bash
curl -X POST http://localhost:3001/api/mcp/invoke \\
  -H "Content-Type: application/json" \\
  -d '{
    "serverId": "server_123",
    "toolName": "read_file",
    "arguments": {
      "path": "/path/to/file.txt"
    },
    "metadata": {
      "requestId": "req_456",
      "userId": "user_789"
    }
  }'
```

### 3. Smart Tool Selection

```bash
curl -X POST http://localhost:3001/api/mcp/tools/select \\
  -H "Content-Type: application/json" \\
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

This MCP implementation is designed to work seamlessly with all three subprojects:

1. **Same-host with Ollama container** - Uses stdio transport for local communication
2. **Same-host with existing Ollama** - Connects to existing Ollama MCP servers
3. **Multi-host deployment** - Supports distributed MCP server architecture with pre-configured defaults

The system automatically detects the deployment configuration and optimizes accordingly. For subproject 3, the `mcp-config.multihost.json` file provides a comprehensive set of MCP servers optimized for distributed deployments.

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
