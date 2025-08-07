# MCP Diagnostics Guide

## Overview
Enhanced logging and diagnostic system for tracking MCP server lifecycle and shutdown issues.

## New Features

### 1. MCPLogger
- Tracks all MCP events (startup, shutdown, errors, health)
- Persistent JSON logging to `logs/mcp/mcp-events-*.log`
- In-memory event buffer for quick access
- Automatic report generation

### 2. ProcessWatchdog
- Monitors backend process restarts
- Detects rapid restart loops (< 60s)
- Tracks restart history with timestamps
- Logs to `logs/mcp/restarts.log`

### 3. Diagnostic Endpoints

#### `/api/mcp/health/detailed`
Returns comprehensive MCP health status including:
- Server status
- Recent events
- Health report

#### `/api/mcp/diagnostics`
Provides diagnostic information:
- Process info (PID, uptime, memory)
- Recent shutdowns
- Recent errors

#### `/api/mcp/process/health`
Shows process health:
- Current uptime
- Restart history
- Memory usage

## Usage

### Monitor MCP in Real-time
```bash
make mcp-monitor
```

### View MCP Diagnostics
```bash
make mcp-diagnostics
```

### Run Shutdown Monitor
```bash
./scripts/diagnose-mcp-shutdowns.sh
```

### Check Logs Manually
```bash
# View recent events
tail -f logs/mcp/mcp-events-*.log | jq '.'

# View restart history
cat logs/mcp/restarts.log | jq '.'
```

## Troubleshooting Shutdowns

1. Check for rapid restarts:
   - Look for restart events < 60s apart
   - Indicates process crashes or configuration issues

2. Examine shutdown triggers:
   - SIGTERM/SIGINT: Normal shutdown
   - UNCAUGHT_EXCEPTION: Code error
   - Process exit codes in logs

3. Review error events:
   - Stack traces in mcpLogger events
   - Process error handlers in logs

4. Monitor resource usage:
   - Memory leaks can cause restarts
   - Check Docker container limits

## Log File Locations
- MCP Events: `logs/mcp/mcp-events-YYYY-MM-DD.log`
- Process Restarts: `logs/mcp/restarts.log`
- Backend Logs: Docker logs olympian-backend
