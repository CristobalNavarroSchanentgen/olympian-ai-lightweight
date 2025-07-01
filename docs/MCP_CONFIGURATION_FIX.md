# MCP Configuration Fix for Subproject 3 (Multi-host Deployment)

## Issue Summary

The MCP (Model Context Protocol) configuration file `mcp-config.multihost.json` was not being loaded during application startup in subproject 3, causing MCP services to remain unavailable.

## Root Cause Analysis

1. **File Path Mismatch**: The MCPConfigParser was looking for `mcp-config.json` but the repository contained `mcp-config.multihost.json`
2. **Missing Mount**: The Docker container wasn't mounting the config file
3. **Initialization Gap**: MCP services weren't being initialized during server startup
4. **Format Mismatch**: The config file was in standard Claude Desktop format, but the parser expected a different format

## Solution Overview

### 1. Enhanced MCPConfigParser (`packages/server/src/services/MCPConfigParser.ts`)

**Key Improvements:**
- Added deployment-mode aware configuration path resolution
- Support for both standard MCP config format and internal URL-based format
- Multihost-specific configuration file paths:
  ```
  - mcp-config.multihost.json
  - .mcp-config.multi-host.json  
  - /app/mcp-config.multihost.json (Docker)
  - /config/mcp-config.json (Docker)
  ```

**Configuration Format Support:**
- **Standard Format** (Claude Desktop compatible):
  ```json
  {
    "mcpServers": {
      "github": {
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-github"],
        "env": {
          "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
        }
      }
    }
  }
  ```
- **Internal Format** (URL-based):
  ```json
  {
    "mcpServers": {
      "server-name": {
        "url": "http://example.com/mcp",
        "type": "server",
        "timeout": 30000
      }
    }
  }
  ```

### 2. Server Initialization Updates (`packages/server/src/index.ts`)

**Added MCP Initialization:**
- Parse MCP configuration during server startup
- Initialize MCP clients with discovered servers
- Health status reporting in startup logs
- Graceful fallback when MCP fails (development mode)
- Proper cleanup during shutdown

### 3. Docker Configuration (`docker-compose.prod.yml`)

**Container Mounting:**
```yaml
volumes:
  # Mount MCP config file
  - ./mcp-config.multihost.json:/app/mcp-config.multihost.json:ro
  - ./mcp-config.multihost.json:/config/mcp-config.json:ro
```

**Environment Variables:**
```yaml
environment:
  DEPLOYMENT_MODE: ${DEPLOYMENT_MODE:-multi-host}
  ENABLE_MULTI_HOST: ${ENABLE_MULTI_HOST:-true}
  MCP_OPTIONAL: ${MCP_OPTIONAL:-false}
```

### 4. MCPClient Updates (`packages/server/src/services/MCPClient.ts`)

**New Methods:**
- `getInstance()`: Singleton pattern support
- `initialize(servers?: MCPServer[])`: Accept servers from config
- `getHealthStats()`: Health reporting for startup logs
- `cleanup()`: Graceful shutdown

## Testing Instructions

### 1. Verify Configuration Loading

```bash
# Check that config file exists
ls -la mcp-config.multihost.json

# Verify file format
cat mcp-config.multihost.json | jq .
```

### 2. Test Local Development

```bash
# Set environment variables
export DEPLOYMENT_MODE=multi-host
export ENABLE_MULTI_HOST=true
export MCP_OPTIONAL=true

# Start server
npm run dev
```

**Expected Output:**
```
🔍 [MCP Config] Initialized with deployment mode: multi-host, multihost: true
🔧 [Server] Initializing MCP services...
📊 [Server] MCP configuration loaded: {
  totalEndpoints: 6,
  serverEndpoints: 6,
  discoveryChannels: 0,
  registries: 0
}
🚀 [Server] Initializing MCP clients...
✅ [Server] MCP services initialized with 6 servers
📊 [Server] MCP Health: X/6 servers healthy
```

### 3. Test Multi-host Deployment

```bash
# Build and start containers
make quick-docker-multi

# Check logs for MCP initialization
docker logs olympian-backend 2>&1 | grep -E "(MCP|🔧)"
```

**Expected Logs:**
```
🔍 [MCP Config] Parsing MCP configuration files...
✅ [MCP Config] Loaded standard MCP configuration from: /app/mcp-config.multihost.json
🔧 [Server] Initializing MCP services...
📊 [Server] MCP configuration loaded: { totalEndpoints: 6, ... }
✅ [Server] MCP services initialized with 6 servers
🔧 [Server] MCP services: X/6 servers healthy
```

### 4. Verify API Endpoints

```bash
# Check MCP status via API
curl http://localhost:8080/api/mcp/status

# Expected response:
{
  "servers": [...],
  "health": {...},
  "metrics": {...}
}
```

### 5. Test Individual MCP Servers

Each server in the config should be accessible:

```bash
# Test met-museum server
curl -X POST http://localhost:8080/api/mcp/invoke \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "met-museum",
    "toolName": "search_objects",
    "arguments": {"q": "paintings"}
  }'
```

## Configuration Customization

### Adding New MCP Servers

Edit `mcp-config.multihost.json`:

```json
{
  "mcpServers": {
    "your-server": {
      "command": "node",
      "args": ["your-mcp-server.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### Environment-Specific Configs

Create deployment-specific configs:
- `mcp-config.development.json`
- `mcp-config.staging.json`
- `mcp-config.production.json`

Set `DEPLOYMENT_MODE` environment variable to load the appropriate config.

## Troubleshooting

### Config Not Loading

1. **Check file permissions:**
   ```bash
   ls -la mcp-config.multihost.json
   ```

2. **Verify Docker mount:**
   ```bash
   docker exec olympian-backend ls -la /app/mcp-config.multihost.json
   ```

3. **Check logs for parsing errors:**
   ```bash
   docker logs olympian-backend 2>&1 | grep -E "(MCP Config|❌)"
   ```

### MCP Servers Not Starting

1. **Check environment variables:**
   ```bash
   docker exec olympian-backend env | grep -E "(DEPLOYMENT_MODE|MCP)"
   ```

2. **Verify server commands are available:**
   ```bash
   docker exec olympian-backend which npx
   docker exec olympian-backend npx -y @modelcontextprotocol/server-github --help
   ```

3. **Check server-specific errors:**
   ```bash
   docker logs olympian-backend 2>&1 | grep -E "(MCP Client|⚠️|❌)"
   ```

### Network Connectivity Issues

1. **Test container networking:**
   ```bash
   docker exec olympian-backend ping host.docker.internal
   ```

2. **Check port bindings:**
   ```bash
   docker ps | grep olympian
   ```

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DEPLOYMENT_MODE` | `development` | Controls config file priority |
| `ENABLE_MULTI_HOST` | `false` | Enables multi-host features |
| `MCP_OPTIONAL` | `false` | Continue if MCP fails to initialize |

## Files Modified

1. `packages/server/src/services/MCPConfigParser.ts` - Enhanced config parsing
2. `packages/server/src/index.ts` - Added MCP initialization
3. `docker-compose.prod.yml` - Added config mounting
4. `packages/server/src/services/MCPClient.ts` - Added singleton pattern
5. `docs/MCP_CONFIGURATION_FIX.md` - This documentation

## Verification Checklist

- [ ] Config file is properly mounted in Docker container
- [ ] Environment variables are set correctly
- [ ] MCP services initialize during server startup
- [ ] Health status shows connected servers
- [ ] API endpoints respond correctly
- [ ] Logs show successful MCP initialization
- [ ] No configuration parsing errors in logs

This fix ensures that MCP services are properly initialized in subproject 3 (multi-host deployment) and provides robust configuration loading with proper error handling and fallback mechanisms.
