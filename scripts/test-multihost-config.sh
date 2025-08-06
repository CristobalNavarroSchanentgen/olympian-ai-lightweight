#!/bin/bash

echo "🔍 Testing Multi-Host Configuration"
echo "===================================="

# Check .env file
if [ -f .env ]; then
    source .env
    echo "✅ .env file found"
    
    # Validate critical settings
    if [ "$DEPLOYMENT_MODE" = "docker-multi-host" ]; then
        echo "✅ Deployment mode: docker-multi-host"
    else
        echo "❌ Deployment mode not set to docker-multi-host"
    fi
    
    if [ -n "$OLLAMA_HOST" ]; then
        echo "✅ OLLAMA_HOST configured: $OLLAMA_HOST"
        # Test Ollama connection
        if curl -s -f "$OLLAMA_HOST/api/tags" > /dev/null 2>&1; then
            echo "✅ Ollama is accessible"
        else
            echo "⚠️  Cannot reach Ollama at $OLLAMA_HOST"
        fi
    else
        echo "❌ OLLAMA_HOST not configured"
    fi
    
    if [ -n "$MONGODB_URI" ]; then
        echo "✅ MONGODB_URI configured"
        if [[ "$MONGODB_URI" == *"replicaSet"* ]]; then
            echo "✅ MongoDB configured with replica set"
        else
            echo "⚠️  MongoDB not configured with replica set (required for artifacts)"
        fi
    else
        echo "❌ MONGODB_URI not configured"
    fi
    
    if [ "$MCP_ENABLED" = "true" ]; then
        echo "✅ MCP enabled"
        if [ -f mcp-config.multihost.json ]; then
            echo "✅ MCP config file exists"
        else
            echo "❌ mcp-config.multihost.json missing"
        fi
    else
        echo "⚠️  MCP disabled"
    fi
    
    # Check GitHub token
    if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ] && [ "$GITHUB_PERSONAL_ACCESS_TOKEN" != "your_github_token_here" ]; then
        echo "✅ GitHub token configured"
    else
        echo "⚠️  GitHub token not configured"
    fi
    
else
    echo "❌ .env file not found"
fi

echo ""
echo "📋 Docker Compose Files:"
echo "========================"
[ -f docker-compose.prod.yml ] && echo "✅ docker-compose.prod.yml exists" || echo "❌ docker-compose.prod.yml missing"
[ -f docker-compose.multihost.yml ] && echo "✅ docker-compose.multihost.yml exists" || echo "❌ docker-compose.multihost.yml missing"

echo ""
echo "🚀 Ready to deploy? Run: make quick-docker-multi"
