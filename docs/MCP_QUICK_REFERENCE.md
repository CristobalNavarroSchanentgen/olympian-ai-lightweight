# MCP Quick Reference Guide

## Overview

The MCP (Model Context Protocol) implementation in Olympian AI has been dramatically simplified to use a single unified service.

## Key Changes

### Before (9+ Services)
- MCPService, MCPClient, MCPClientStdio, MCPConfigParser, MCPConfigParserStdio, MCPHealthChecker, MCPToolCache, MCPToolIntegrationService, ToolIntegrationService

### After (1 Service)
- **MCPManager** - Single unified service handling everything

## Quick Usage

### Initialize MCP
```typescript
import { MCPManager } from './services/MCPManager';

const mcp = MCPManager.getInstance();
await mcp.initialize();
```

### List Available Tools
```typescript
const tools = await mcp.listTools();
// Returns: MCPTool[] with all tools from all servers
```

### Call a Tool
```typescript
const result = await mcp.callTool('github', 'search_repositories', {
  query: 'mcp servers'
});
```

### Check Status
```typescript
const stats = mcp.getStats();
// Returns: { total: 3, running: 2, error: 1 }

const servers = mcp.getServers();
// Returns: MCPServer[] with status info
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/mcp/status` | Service status and stats |
| GET | `/api/mcp/servers` | List all MCP servers |
| GET | `/api/mcp/tools` | List all available tools |
| POST | `/api/mcp/tools/call` | Call a specific tool |
| POST | `/api/mcp/invoke` | Legacy tool invocation |
| POST | `/api/mcp/servers` | Add custom server |
| DELETE | `/api/mcp/servers/:id` | Remove server |
| GET | `/api/mcp/health` | Health check |

## Default MCP Servers

1. **GitHub** - Repository operations, issues, PRs
2. **Filesystem** - File system access within container
3. **Memory** - In-memory key-value storage

All servers are optional by default and won't block initialization if they fail.

## Configuration

### Environment Variables
```bash
MCP_ENABLED=true                    # Enable/disable MCP
GITHUB_PERSONAL_ACCESS_TOKEN=xxx    # For GitHub server
```

### Add Custom Server
```javascript
await mcp.addServer({
  id: 'custom',
  name: 'My Custom Server',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@my/custom-server'],
  env: { API_KEY: process.env.MY_API_KEY },
  optional: true,
  status: 'stopped'
});
```

## Architecture Benefits

1. **Simplicity**: 1 service instead of 9+
2. **Reliability**: Built-in retries and health monitoring
3. **Performance**: In-memory caching and efficient discovery
4. **Maintainability**: ~400 lines vs ~4000 lines of code

## Troubleshooting

### Check MCP Status
```bash
curl http://localhost:3001/api/mcp/status
```

### View Server Health
```bash
curl http://localhost:3001/api/mcp/health
```

### Check Logs
```bash
docker logs olympian-backend | grep MCP
```

### Common Issues

**Servers not starting**: Check environment variables (API tokens)
```bash
make show-env | grep -E "(GITHUB|MCP)"
```

**Tools not available**: Verify servers are running
```bash
curl http://localhost:3001/api/mcp/servers
```

**Connection timeouts**: Increase timeout
```bash
CONNECTION_TIMEOUT=30000  # 30 seconds
```

## For Developers

### Import Changes
```typescript
// Old (remove these)
import { MCPService } from './services/MCPService';
import { MCPClient } from './services/MCPClient';
import { MCPToolCache } from './services/MCPToolCache';

// New (use this)
import { MCPManager } from './services/MCPManager';
```

### Service Access
```typescript
// Old
const mcpService = new MCPService();
const mcpClient = MCPClient.getInstance();

// New
const mcp = MCPManager.getInstance();
```

### No Breaking Changes
- All API endpoints remain the same
- Frontend doesn't need any changes
- Tool format unchanged

## Related Documentation

- [Full Architecture Guide](./MCP_ARCHITECTURE.md) - Detailed technical documentation
- [Simplification Guide](./MCP_SIMPLIFICATION.md) - Migration details
- [Main README](../README.md) - Project overview
