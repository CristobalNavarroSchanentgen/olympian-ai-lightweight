# MCP Integration Debug Fixes

## Issues Found and Fixed

### 1. Environment Variable Interpolation
**Problem**: Environment variables in startup.sh were not being interpolated due to escaped dollar signs.
**Fix**: Removed backslashes from variable references in docker/backend/startup.sh

### 2. MCP Initialization Error Handling
**Problem**: MCP initialization failures caused the entire server to shut down.
**Fix**: Added try-catch block to continue server operation even if MCP fails to initialize.

### 3. STDIO Connection Timeouts
**Problem**: MCP servers using stdio transport could hang indefinitely during connection.
**Fix**: Added 10-second timeout for MCP server connections with proper cleanup.

### 4. Insufficient Logging
**Problem**: Hard to debug MCP issues due to limited logging.
**Fix**: Added more detailed logging at critical points in MCPManager.

## Current Configuration

- **MCP Servers**: 2 (context7, applescript)
- **Transport**: stdio
- **Config File**: mcp-config.multihost.json

## Debugging Tools Added

### debug-mcp-integration.sh
A comprehensive script that checks:
- Environment variables
- Config file existence
- npx availability
- MCP server command testing
- Docker logs

## Remaining Considerations

1. **NPX Caching**: Consider caching MCP server packages to avoid download on each startup
2. **Health Monitoring**: Implement periodic health checks for MCP servers
3. **Graceful Degradation**: Better handling when individual MCP servers fail
4. **Resource Management**: Monitor memory usage as MCP servers can be resource-intensive

## Testing

After rebuilding Docker images with these fixes:
```bash
# Rebuild and start multi-host deployment
make quick-docker-multi

# Monitor MCP logs
make mcp-monitor

# Check diagnostics
make mcp-diagnostics

# Run debug script
./scripts/debug-mcp-integration.sh
```

## Log Locations

- Backend logs: `docker logs olympian-backend-1`
- MCP events: Inside container at `/app/logs/mcp/`
- Process restarts: Inside container at `/app/logs/mcp/restarts.log`
