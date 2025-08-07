#!/bin/sh
echo "[STARTUP WRAPPER] Starting backend process at $(date)"
echo "[STARTUP WRAPPER] Environment:"
echo "  - NODE_ENV: $NODE_ENV"
echo "  - MCP_ENABLED: $MCP_ENABLED"
echo "  - ENABLE_MULTI_HOST: $ENABLE_MULTI_HOST"
echo "  - HOSTNAME: $HOSTNAME"
echo "  - Process PID: $$"

# Create logs directory
mkdir -p /app/logs/mcp

# Start the application
echo "[STARTUP WRAPPER] Executing: node packages/server/dist/index.js"
exec node packages/server/dist/index.js
