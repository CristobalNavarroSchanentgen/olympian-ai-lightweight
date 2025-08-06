#!/bin/bash

echo "🔧 Testing MCP Server Initialization"
echo "====================================="

# Test stdio MCP servers can be spawned
echo ""
echo "Testing MCP server commands:"

# Test GitHub server
echo -n "GitHub MCP: "
if npx -y @modelcontextprotocol/server-github@latest --help > /dev/null 2>&1; then
    echo "✅ Available"
else
    echo "❌ Not available"
fi

# Test Context7 server  
echo -n "Context7 MCP: "
if npx -y @upstash/context7-mcp@latest --help > /dev/null 2>&1; then
    echo "✅ Available"
else
    echo "❌ Not available"
fi

# Test AppleScript server
echo -n "AppleScript MCP: "
if npx -y @sampullman/applescript-mcp@latest --help > /dev/null 2>&1; then
    echo "✅ Available"
else
    echo "❌ Not available"
fi

# Test NASA server
echo -n "NASA MCP: "
if npx -y @programcomputer/nasa-mcp-server@latest --help > /dev/null 2>&1; then
    echo "✅ Available"
else
    echo "❌ Not available"
fi

# Test Met Museum server
echo -n "Met Museum MCP: "
if npx -y metmuseum-mcp@latest --help > /dev/null 2>&1; then
    echo "✅ Available"
else
    echo "❌ Not available"
fi

echo ""
echo "📋 MCP Configuration Check:"
if [ -f mcp-config.multihost.json ]; then
    echo "✅ Config file exists"
    echo "Configured servers:"
    cat mcp-config.multihost.json | grep '"' | grep -E '^\s+"[^"]+":' | sed 's/.*"\([^"]*\)".*/  - \1/'
else
    echo "❌ mcp-config.multihost.json not found"
fi
