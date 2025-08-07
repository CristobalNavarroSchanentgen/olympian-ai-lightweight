# MCP Restart Loop Resolution

## Problem Identified
The backend was restarting every 5-6 seconds due to a health check failure loop:

1. Docker health check calls `/api/multihost/health/simple` endpoint
2. Endpoint checks if coordination service is connected
3. During startup, coordination service takes time to initialize
4. Health check immediately returns 503 (unhealthy) if not connected
5. Docker marks container as unhealthy and restarts it
6. Process repeats indefinitely

## Root Cause
- Health check was too strict during startup phase
- No grace period for services to initialize
- Coordination service needs time to connect to Redis

## Solution Implemented

### 1. Grace Period for Startup
Added 30-second startup grace period where health checks pass regardless of coordination status:
```javascript
const uptime = process.uptime();
const isStartingUp = uptime < 30;
if (coordinationConnected || isStartingUp) {
  // Return healthy or "starting" status
}
```

### 2. Enhanced Logging
- MCP logger now properly logs events with correct template literals
- Added shutdown trigger tracking with stack traces
- Added startup/initialization timing logs
- Health check logs its status for debugging

### 3. Status Differentiation
Health check now returns three states:
- "healthy" - Fully connected and operational
- "starting" - Within startup grace period
- "unhealthy" - Failed after grace period

## Monitoring Commands
```bash
# View MCP diagnostics
make mcp-diagnostics

# Monitor MCP events in real-time
make mcp-monitor

# Check logs
docker logs olympian-backend-1 --tail 50
```

## Verification
After deployment, the backend should:
1. Start and show "starting" status for up to 30 seconds
2. Initialize coordination service
3. Transition to "healthy" status
4. No more restart loops

## Additional Improvements
- Process watchdog tracks restart history
- MCP logger captures all lifecycle events
- Diagnostic endpoints provide detailed health information
