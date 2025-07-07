# MCP Architecture Simplification

## Overview

This refactoring simplifies the MCP (Model Context Protocol) client architecture for subproject 3 by consolidating multiple service files into a unified `MCPManager` class.

## Changes Made

### 1. **Unified MCPManager Service** (`packages/server/src/services/MCPManager.ts`)
- Combines functionality from 8+ separate service files
- Manages server lifecycle, tool discovery, health monitoring, and WebSocket notifications
- Simple singleton pattern with clear responsibilities
- ~400 lines instead of ~4000 lines across multiple files

### 2. **Simplified API Layer** (`packages/server/src/api/mcp.ts`)
- Clean REST endpoints using the unified MCPManager
- Removed complex subproject detection logic
- ~150 lines instead of ~400 lines

### 3. **Streamlined Server Initialization** (`packages/server/src/index.ts`)
- Single MCP initialization call
- Removed complex service dependencies
- ~250 lines instead of ~700 lines

### 4. **Updated Tool Integration** (`packages/server/src/services/ToolEnabledOllamaStreamliner.ts`)
- Direct use of MCPManager for tool operations
- Simplified tool calling logic
- Better error handling

## Architecture Benefits

1. **Less Code**: Reduced from ~4000+ lines to ~1000 lines
2. **Fewer Dependencies**: Single service instead of 8+ interconnected services
3. **Easier Testing**: Clear boundaries and single responsibility
4. **Better Performance**: Less overhead from service coordination
5. **Maintainability**: Simple to understand and modify

## API Endpoints

```
GET  /api/mcp/status      - Service status and statistics
GET  /api/mcp/servers     - List all MCP servers
GET  /api/mcp/tools       - List all available tools
POST /api/mcp/tools/call  - Call a specific tool
POST /api/mcp/invoke      - Legacy tool invocation format
POST /api/mcp/servers     - Add a new MCP server
DELETE /api/mcp/servers/:id - Remove a server
GET  /api/mcp/health      - Health check
```

## Usage Example

```typescript
import { MCPManager } from './services/MCPManager';

// Initialize
const mcp = MCPManager.getInstance();
await mcp.initialize();

// List tools
const tools = await mcp.listTools();

// Call a tool
const result = await mcp.callTool('github', 'search_repositories', {
  query: 'mcp servers'
});

// Add custom server
await mcp.addServer({
  id: 'custom',
  name: 'My Custom Server',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@my/custom-server'],
  env: { API_KEY: 'xxx' },
  optional: true,
  status: 'stopped'
});
```

## Removed Files (to be deleted)

The following files are no longer needed and can be removed:

1. `MCPService.ts` - Replaced by MCPManager
2. `MCPClient.ts` - Legacy HTTP client, not needed
3. `MCPClientStdio.ts` - Functionality merged into MCPManager
4. `MCPConfigParser.ts` - No longer needed
5. `MCPConfigParserStdio.ts` - No longer needed
6. `MCPHealthChecker.ts` - Integrated into MCPManager
7. `MCPToolCache.ts` - Simplified caching in MCPManager
8. `MCPToolIntegrationService.ts` - Merged into streamliner

## Migration Notes

1. The new architecture uses stdio transport exclusively (npx subprocess model)
2. All servers are optional by default to prevent blocking
3. Health monitoring is built-in with automatic retry
4. WebSocket notifications are integrated if WebSocketService is available
5. No breaking changes to the API - frontend remains compatible
