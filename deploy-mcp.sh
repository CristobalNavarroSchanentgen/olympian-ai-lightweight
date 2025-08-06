#!/bin/bash

# Deploy script for MCP Architecture
set -e

echo ================================================
echo   Olympian AI - MCP Architecture Deployment
echo ================================================
echo

# Check for required environment variables
if [ -f .env ]; then
    source .env
    echo Environment file loaded
else
    echo No .env file found. Creating from template...
    cp .env.example .env 2>/dev/null || echo '# MCP Configuration' > .env
fi

echo
echo MCP Architecture Configuration:
echo -------------------------------
echo - 3 MCP Servers: GitHub, AppleScript, Context7
echo - HIL Protection: ENABLED with 30 second timeout
echo - Tool Namespacing: Active
echo - Compatible Models: qwen2.5, qwen3, llama3.1, llama3.2, mistral, deepseek-r1

echo
echo Building and starting services...
echo

# Build and start with both compose files
docker-compose -f docker-compose.multihost.yml -f docker-compose.mcp.yml up -d --build

echo
echo ================================================
echo   MCP Architecture Deployment Complete!
echo ================================================
echo
echo Service URLs:
echo   - Frontend: http://localhost:80
echo   - Backend API: http://localhost:4000/api
echo   - Health Check: http://localhost:4000/health
echo
echo Management Commands:
echo   - View logs: docker-compose -f docker-compose.multihost.yml logs -f
echo   - Stop services: docker-compose -f docker-compose.multihost.yml down
echo   - Restart: docker-compose -f docker-compose.multihost.yml restart
echo
echo HIL Protection is ENABLED
echo All tool executions will require user approval via the UI
echo
