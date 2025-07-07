# MCP Service Error Isolation and Resilience

## Overview

This document describes the enhanced error isolation and resilience features implemented for the MCP (Model Context Protocol) services in subproject 3 (multi-host deployment). These improvements ensure that MCP server failures do not prevent AI models from being available in the chat interface.

## Key Improvements

### 1. Separation of Concerns

The initialization process has been refactored to clearly separate:
- **Core Services**: Database, Ollama health check, artifacts (essential for chat)
- **MCP Services**: Tool calling capabilities (optional enhancement)
- **Multi-host Services**: Redis coordination, monitoring (optional for scaling)
- **Model Loading**: Progressive model capability detection (gracefully degraded)

### 2. All MCP Servers Are Optional by Default

In the enhanced `MCPService.ts`:
- All MCP servers are now marked as `optional: true` by default
- Failed servers don't block the initialization of other servers
- The service tracks failed servers and continues with available ones

### 3. Enhanced Error Handling

#### Retry Logic
- Failed MCP servers are retried up to 3 times (configurable via `MCP_MAX_RETRIES`)
- Retry delay of 5 seconds between attempts (configurable via `MCP_RETRY_DELAY`)
- Connection timeout of 15 seconds (configurable via `MCP_CONNECTION_TIMEOUT`)

#### Error Isolation
- Each MCP server runs in its own process (via npx)
- Failures are contained and don't cascade to other services
- Detailed error tracking with failure counts and timestamps

### 4. Improved Health Monitoring

The service now provides comprehensive health information:

```typescript
interface HealthSummary {
  totalServers: number;
  runningServers: number;
  failedServers: number;
  stoppedServers: number;
  healthPercentage: number;
  issues: Array<{ server: string; error: string }>;
}
```

### 5. Enhanced Service Status Tracking

The main server (`index.ts`) now tracks the initialization status of all services:

```typescript
const serviceStatus = {
  core: { initialized: false, error: null },
  multiHost: { initialized: false, error: null },
  mcp: { initialized: false, error: null },
  models: { initialized: false, error: null }
};
```

### 6. Detailed Health Endpoint

The `/health` endpoint now provides detailed service status:

```json
{
  "status": "healthy",
  "services": {
    "core": "ready",
    "multiHost": "ready",
    "mcp": "ready",
    "models": "ready"
  },
  "mcpHealth": {
    "totalServers": 6,
    "runningServers": 4,
    "failedServers": 2,
    "healthPercentage": 67,
    "issues": [
      { "server": "brave-search", "error": "Missing API key" }
    ]
  }
}
```

## Configuration

### Environment Variables

- `MCP_ENABLED`: Enable/disable MCP services (default: `true`)
- `MCP_OPTIONAL`: Allow server to start even if MCP fails (default: `true`)
- `MCP_CONNECTION_TIMEOUT`: Connection timeout in ms (default: `15000`)
- `MCP_RETRY_DELAY`: Delay between retry attempts in ms (default: `5000`)
- `MCP_MAX_RETRIES`: Maximum retry attempts (default: `3`)

### Example Configuration

```env
# Make MCP services optional (recommended for production)
MCP_OPTIONAL=true
MCP_ENABLED=true

# Adjust timeouts for slower environments
MCP_CONNECTION_TIMEOUT=30000
MCP_RETRY_DELAY=10000
MCP_MAX_RETRIES=5
```

## Startup Behavior

1. **Core services** initialize first (database, Ollama, artifacts)
2. **Multi-host services** initialize if enabled (Redis coordination)
3. **MCP services** initialize with error isolation:
   - Each server starts independently
   - Failed servers are tracked but don't block others
   - Retry logic attempts to recover failed servers
4. **Model loading** starts (can work without MCP)

## Failure Scenarios

### Scenario 1: Some MCP Servers Fail

- System continues with available MCP servers
- Failed servers are logged with error details
- Chat functionality remains fully operational
- Only specific tool-calling features may be unavailable

### Scenario 2: All MCP Servers Fail

- System continues without MCP functionality
- Chat and model features work normally
- Health endpoint shows MCP as "failed" or "disabled"
- Warning logged but server starts successfully

### Scenario 3: Critical Service Fails

- If database or Ollama fails, server exits (these are essential)
- MCP and multi-host failures don't prevent server startup
- Clear error messages indicate which services failed

## Monitoring and Debugging

### Logs

Enhanced logging provides clear visibility:

```
✅ [Server] Modern MCP service initialized: 4/6 servers running
⚠️ [Server] 2 MCP servers failed to start:
   - brave-search: Missing API key
   - postgres: Connection timeout after 15000ms
```

### Health Checks

Use the `/health` endpoint to monitor service status:

```bash
curl http://localhost:3001/health | jq .
```

### MCP-Specific Endpoints

```bash
# List available MCP servers and their status
curl http://localhost:3001/api/mcp/servers

# Get detailed server health
curl http://localhost:3001/api/mcp/health
```

## Best Practices

1. **Production Deployment**
   - Always set `MCP_OPTIONAL=true` in production
   - Configure appropriate timeouts based on your infrastructure
   - Monitor the health endpoint for service degradation

2. **Development**
   - Can set `MCP_OPTIONAL=false` to catch configuration issues early
   - Use shorter timeouts for faster feedback
   - Check logs for detailed error information

3. **Troubleshooting**
   - Check environment variables for API keys (GITHUB_PERSONAL_ACCESS_TOKEN, etc.)
   - Verify network connectivity for npx package downloads
   - Review server logs for specific error messages
   - Use health endpoints to identify failing services

## Summary

The enhanced MCP service implementation ensures that:
- AI chat functionality is never blocked by MCP server failures
- Clear separation between essential and optional services
- Comprehensive error tracking and health monitoring
- Graceful degradation when optional services fail
- Easy configuration for different deployment scenarios

This design follows the principle of "fail gracefully" - ensuring the core AI functionality remains available even when enhancement features encounter issues.
