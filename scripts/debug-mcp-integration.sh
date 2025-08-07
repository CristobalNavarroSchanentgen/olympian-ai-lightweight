#!/bin/bash

echo "=== MCP Integration Debug Script ==="
echo "Testing MCP configuration and initialization"
echo ""

# Check environment
echo "[1/5] Checking Environment Variables"
echo "MCP_ENABLED: ${MCP_ENABLED:-not set}"
echo "MCP_CONFIG_PATH: ${MCP_CONFIG_PATH:-not set}"
echo "MCP_TRANSPORT: ${MCP_TRANSPORT:-not set}"
echo ""

# Check config files
echo "[2/5] Checking MCP Config Files"
if [ -f "mcp-config.multihost.json" ]; then
    echo "✅ mcp-config.multihost.json exists"
    echo "Servers configured:"
    cat mcp-config.multihost.json | grep '"command"' | wc -l | xargs echo "  - Count:"
else
    echo "❌ mcp-config.multihost.json not found"
fi
echo ""

# Check npx availability
echo "[3/5] Checking npx availability"
which npx >/dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ npx found at: $(which npx)"
else
    echo "❌ npx not found in PATH"
fi
echo ""

# Test MCP server commands
echo "[4/5] Testing MCP Server Commands"
echo "Testing context7 server..."
timeout 5 npx -y @upstash/context7-mcp@latest --version 2>/dev/null
if [ $? -eq 124 ]; then
    echo "✅ context7 server responds (timeout expected for stdio mode)"
else
    echo "⚠️ context7 server test result: $?"
fi

echo "Testing applescript server..."
timeout 5 npx -y @sampullman/applescript-mcp@latest --version 2>/dev/null
if [ $? -eq 124 ]; then
    echo "✅ applescript server responds (timeout expected for stdio mode)"
else
    echo "⚠️ applescript server test result: $?"
fi
echo ""

# Check Docker logs for MCP
echo "[5/5] Recent MCP-related Docker logs"
docker logs olympian-backend-1 2>&1 | grep -E "MCP|mcp" | tail -10 || echo "No backend-1 container logs"
echo ""

echo "=== Debug Complete ==="
