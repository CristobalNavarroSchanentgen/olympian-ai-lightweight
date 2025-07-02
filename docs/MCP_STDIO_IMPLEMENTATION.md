# MCP Stdio Implementation for Subproject 3

This document describes the implementation of stdio-based MCP (Model Context Protocol) servers for subproject 3 (multi-host deployment).

## Overview

Instead of running MCP servers as separate containers via HTTP transport, subproject 3 runs all MCP servers as child processes within the main backend container using stdio transport.

## Architecture

```
┌─────────────────────────────────────────────────┐
│ Olympian Backend Container (Subproject 3)       │
│                                                 │
│ ┌─────────────────┐                            │
│ │ Main Process    │                            │
│ │ (Node.js)       │                            │
│ │                 │                            │
│ │ ┌─────────────┐ │   stdio    ┌─────────────┐ │
│ │ │ MCPClient   │◄┼────────────► GitHub MCP  │ │
│ │ │ Stdio       │ │            │ (Child)     │ │
│ │ └─────────────┘ │            └─────────────┘ │
│ │                 │                            │
│ │                 │   stdio    ┌─────────────┐ │
│ │                 │◄──────────► NASA MCP    │ │
│ │                 │            │ (Child)     │ │
│ │                 │            └─────────────┘ │
│ │                 │                            │
│ │                 │   stdio    ┌─────────────┐ │
│ │                 │◄──────────► Context7 MCP │ │
│ │                 │            │ (Child)     │ │
│ │                 │            └─────────────┘ │
│ │                 │                            │
│ │                 │            + 3 more...    │ │
│ └─────────────────┘                            │
└─────────────────────────────────────────────────┘
```

## Implementation Details

### 1. Transport Detection
The system automatically detects subproject 3 mode and switches to stdio transport:

```typescript
// Environment detection
const SUBPROJECT = process.env.SUBPROJECT || '1';
const IS_SUBPROJECT_3 = SUBPROJECT === '3' || DEPLOYMENT_MODE === 'docker-multi-host';

// Use appropriate MCP services based on subproject
if (IS_SUBPROJECT_3) {
  // Use stdio-based MCP services
  const mcpParser = MCPConfigParserStdio.getInstance();
  const mcpClient = MCPClientStdio.getInstance();
} else {
  // Use HTTP-based MCP services (subprojects 1 & 2)
  const mcpParser = MCPConfigParser.getInstance();
  const mcpClient = MCPClient.getInstance();
}
```

### 2. Stdio MCP Configuration
MCP servers are configured in `mcp-config.stdio.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["--yes", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": ""
      },
      "timeout": 30000,
      "retries": 3
    }
  }
}
```

### 3. Child Process Management
Each MCP server runs as a child process:

```typescript
// Spawn MCP server process
const childProcess = spawn(command, args, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, ...server.env },
  cwd: process.cwd()
});

// Create stdio transport
const transport = new StdioClientTransport({
  reader: childProcess.stdout!,
  writer: childProcess.stdin!
});
```

### 4. Process Lifecycle Management
- **Startup**: Processes are spawned when the backend starts
- **Health Monitoring**: Regular health checks ensure processes are running
- **Cleanup**: Processes are properly terminated on shutdown
- **Recovery**: Failed processes can be restarted automatically

## Files Modified/Created

### New Files
1. **`packages/server/src/services/MCPConfigParserStdio.ts`**
   - Stdio-specific MCP configuration parser
   - Handles child process configuration

2. **`packages/server/src/services/MCPClientStdio.ts`**
   - Stdio-based MCP client implementation
   - Manages child process lifecycle and communication

3. **`mcp-config.stdio.json`**
   - Default stdio MCP configuration
   - Defines MCP servers as child processes

### Modified Files
1. **`packages/server/package.json`**
   - Added MCP server packages as dependencies

2. **`packages/server/src/index.ts`**
   - Added subproject detection logic
   - Conditional MCP service initialization

3. **`docker-compose.prod.yml`**
   - Added `SUBPROJECT=3` environment variable
   - Updated MCP configuration for stdio mode
   - Increased memory limits for child processes

4. **`docker/backend/Dockerfile`**
   - Installed MCP server packages globally
   - Added verification steps for MCP availability
   - Updated environment configuration

## Environment Variables

### Required for Subproject 3
- `SUBPROJECT=3` - Enables stdio MCP mode
- `MCP_TRANSPORT=stdio` - Forces stdio transport
- `MCP_CONFIG_PATH=/app/mcp-config.stdio.json` - Stdio config file

### Optional MCP Server Authentication
- `GITHUB_PERSONAL_ACCESS_TOKEN` - For GitHub MCP server
- `CONTEXT7_API_KEY` - For Context7 MCP server
- `BRAVE_API_KEY` - For web search functionality
- `GOOGLE_API_KEY` - For Google search integration
- `GOOGLE_CSE_ID` - Google Custom Search Engine ID

## Benefits of Stdio Mode

1. **Self-Contained**: No external MCP server containers required
2. **Resource Efficient**: Shared memory and CPU within single container
3. **Simplified Deployment**: One container with all MCP functionality
4. **Better Performance**: Direct stdio communication vs HTTP overhead
5. **Process Control**: Full lifecycle management of MCP servers

## Deployment

To deploy subproject 3 with stdio MCP mode:

```bash
# Build and deploy
make quick-docker-multi

# The system will automatically:
# 1. Detect SUBPROJECT=3 environment variable
# 2. Use stdio transport for MCP servers
# 3. Start MCP servers as child processes
# 4. Establish stdio communication channels
```

## Monitoring

Check MCP status via health endpoint:
```bash
curl http://localhost:8080/health
```

Response includes MCP mode information:
```json
{
  "status": "healthy",
  "subproject": "3",
  "mcpMode": "stdio",
  "mcpEnabled": true
}
```

## Troubleshooting

### MCP Servers Not Starting
1. Check if MCP packages are installed in container
2. Verify environment variables are set correctly
3. Check container logs for child process spawn errors

### Stdio Communication Issues
1. Ensure stdin/stdout pipes are not blocked
2. Check for proper process cleanup on restart
3. Verify MCP server package compatibility

### Performance Issues
1. Monitor memory usage of child processes
2. Adjust `NODE_OPTIONS` memory settings if needed
3. Consider process recycling for long-running servers

## Logs

MCP stdio activity can be monitored in backend logs:
```bash
# View backend logs
make logs-backend

# Look for stdio MCP initialization messages:
# "🚀 [MCP Client] Starting MCP server processes..."
# "✅ [MCP Client] Started github (stdio, 2024-11-05)"
```
