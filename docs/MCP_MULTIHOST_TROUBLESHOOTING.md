# MCP Multi-Host Deployment Troubleshooting Guide

This guide specifically addresses MCP (Model Context Protocol) integration issues in **Subproject 3** (multi-host deployment).

## Problem Overview

The original issue was that MCP servers appeared in the UI with connection timeout errors, even though they were running on the host machine. This was due to a configuration mismatch between local process spawning and external server connections.

## Root Cause

The original `mcp-config.multihost.json` was configured for **stdio transport** (spawning child processes), but the user had MCP servers running externally on the **host machine**. The containerized application couldn't reach these servers because:

1. **Transport mismatch**: stdio vs HTTP/SSE
2. **Network isolation**: Container couldn't reach `localhost` on host  
3. **Missing authentication**: No environment variables for tokens

## Solution Implemented

### 1. Updated MCP Configuration (`mcp-config.multihost.json`)

Changed from stdio transport to HTTP/SSE transport:

```json
{
  "mcpServers": {
    "github": {
      "transport": "sse",
      "endpoint": "http://host.docker.internal:3001/sse",
      "description": "GitHub MCP server for repository access",
      "optional": true,
      "timeout": 30000,
      "retries": 3,
      "headers": {
        "Authorization": "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}",
        "Content-Type": "application/json"
      }
    }
    // ... other servers
  }
}
```

**Key changes:**
- `transport`: "sse" instead of stdio commands
- `endpoint`: HTTP URLs using `host.docker.internal`
- `headers`: Authentication via environment variables
- `timeout`/`retries`: Robust connection handling

### 2. Updated Docker Compose (`docker-compose.prod.yml`)

Added MCP-specific environment variables:

```yaml
environment:
  # MCP Configuration
  MCP_ENABLED: ${MCP_ENABLED:-true}
  MCP_OPTIONAL: ${MCP_OPTIONAL:-true}
  MCP_TRANSPORT: ${MCP_TRANSPORT:-sse}
  MCP_CONFIG_PATH: ${MCP_CONFIG_PATH:-/app/mcp-config.multihost.json}
  
  # MCP Authentication
  GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN:-}
  NASA_API_KEY: ${NASA_API_KEY:-DEMO_KEY}
  
  # MCP Endpoints
  MCP_GITHUB_ENDPOINT: ${MCP_GITHUB_ENDPOINT:-http://host.docker.internal:3001/sse}
  MCP_NASA_ENDPOINT: ${MCP_NASA_ENDPOINT:-http://host.docker.internal:3002/sse}
  MCP_METMUSEUM_ENDPOINT: ${MCP_METMUSEUM_ENDPOINT:-http://host.docker.internal:3003/sse}
  MCP_CONTEXT7_ENDPOINT: ${MCP_CONTEXT7_ENDPOINT:-http://host.docker.internal:3004/sse}
```

### 3. Updated Environment Configuration (`.env.example`)

Added comprehensive MCP configuration examples with default endpoints and authentication.

## Setup Instructions

### Step 1: Configure Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# MCP Configuration
MCP_ENABLED=true
MCP_OPTIONAL=true
MCP_TRANSPORT=sse

# Authentication tokens
GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here
NASA_API_KEY=your_nasa_api_key_here

# Endpoints (optional - defaults will be used)
MCP_GITHUB_ENDPOINT=http://host.docker.internal:3001/sse
MCP_NASA_ENDPOINT=http://host.docker.internal:3002/sse
MCP_METMUSEUM_ENDPOINT=http://host.docker.internal:3003/sse
MCP_CONTEXT7_ENDPOINT=http://host.docker.internal:3004/sse
```

### Step 2: Start MCP Servers on Host

**Important**: Your MCP servers need to support HTTP/SSE transport, not just stdio.

#### GitHub MCP Server (Port 3001)
```bash
export GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
npx -y @modelcontextprotocol/server-github --transport sse --port 3001
```

#### NASA MCP Server (Port 3002)  
```bash
export NASA_API_KEY=your_key_here
npx -y @programcomputer/nasa-mcp-server@latest --transport sse --port 3002
```

#### Met Museum MCP Server (Port 3003)
```bash
npx -y metmuseum-mcp --transport sse --port 3003
```

#### Context7 MCP Server (Port 3004)
```bash
npx -y @upstash/context7-mcp --transport sse --port 3004
```

### Step 3: Deploy Application

```bash
make quick-docker-multi
```

## Troubleshooting

### Common Issues

#### 1. "Connection timeout after 30000ms"

**Cause**: MCP server not reachable from container

**Solutions**:
- ✅ Verify MCP server is running on host: `curl http://localhost:3001/health`
- ✅ Check if server supports HTTP/SSE transport
- ✅ Verify `host.docker.internal` resolves in container: `docker exec olympian-backend ping host.docker.internal`
- ✅ Check port conflicts: `netstat -tulpn | grep :3001`

#### 2. "Server not found" errors

**Cause**: Configuration file not mounted or transport mismatch

**Solutions**:
- ✅ Verify mount: `docker exec olympian-backend ls -la /app/mcp-config.multihost.json`
- ✅ Check transport: ensure servers support `sse` or `streamable_http`
- ✅ Validate JSON: `cat mcp-config.multihost.json | jq .`

#### 3. Authentication failures

**Cause**: Missing or invalid tokens

**Solutions**:
- ✅ Check environment variables in container: `docker exec olympian-backend env | grep MCP`
- ✅ Verify GitHub token scopes: `repo`, `read:user`, `read:org`
- ✅ Test NASA API key: `curl "https://api.nasa.gov/planetary/apod?api_key=your_key"`

#### 4. "MCP servers appear but don't work"

**Cause**: servers started with stdio, need HTTP

**Solutions**:
- ✅ Stop stdio-based servers
- ✅ Restart with `--transport sse` or HTTP support
- ✅ Check server documentation for HTTP transport support

### Advanced Troubleshooting

#### Check Container Network Connectivity

```bash
# Test host resolution
docker exec olympian-backend ping host.docker.internal

# Test MCP server endpoints
docker exec olympian-backend curl -v http://host.docker.internal:3001/health
docker exec olympian-backend curl -v http://host.docker.internal:3002/health
```

#### Verify MCP Client Configuration

```bash
# Check mounted config
docker exec olympian-backend cat /app/mcp-config.multihost.json | jq .

# Check environment variables
docker exec olympian-backend env | grep -E "(MCP|GITHUB|NASA)"

# Check MCP client logs
docker logs olympian-backend | grep -i mcp
```

#### Test MCP Server Individually

```bash
# Test GitHub server
curl -H "Authorization: Bearer your_token" \
  http://localhost:3001/api/tools

# Test NASA server
curl http://localhost:3002/api/apod

# Test Met Museum server  
curl http://localhost:3003/api/search?q=picasso
```

## MCP Server Compatibility

### Servers with HTTP/SSE Support ✅

- ✅ **@modelcontextprotocol/server-github**: Supports SSE transport
- ✅ **@programcomputer/nasa-mcp-server**: Supports HTTP transport
- ✅ **@upstash/context7-mcp**: Supports SSE transport

### Servers requiring stdio only ❌

- ❌ **metmuseum-mcp**: May only support stdio (needs verification)
- ❌ **applescript_execute**: macOS-specific, stdio only
- ❌ **basic-memory**: Usually stdio-based

### Workaround for stdio-only servers

If a server only supports stdio transport, you can:

1. **Use a proxy**: Run a simple HTTP-to-stdio proxy
2. **Fork and modify**: Add HTTP transport support
3. **Use alternative**: Find similar server with HTTP support

## Network Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Host Machine  │    │ Docker Container│    │   MCP Servers   │
│                 │    │                 │    │                 │
│ ┌─────────────┐ │    │ ┌─────────────┐ │    │ ┌─────────────┐ │
│ │   Olympian  │ │    │ │   Backend   │ │    │ │   GitHub    │ │
│ │    (Web)    │ │    │ │   Service   │ │    │ │  :3001      │ │
│ │   :8080     │ │    │ │   :4000     │ │    │ └─────────────┘ │
│ └─────────────┘ │    │ └─────────────┘ │    │ ┌─────────────┐ │
│                 │    │        │        │    │ │    NASA     │ │
│ ┌─────────────┐ │    │        │        │    │ │   :3002     │ │
│ │   Ollama    │ │    │        │        │    │ └─────────────┘ │
│ │   :11434    │ │◄───┼────────┼────────┼────┤ ┌─────────────┐ │
│ └─────────────┘ │    │        │        │    │ │ Met Museum  │ │
│                 │    │        │        │    │ │   :3003     │ │
│ ┌─────────────┐ │    │        │        │    │ └─────────────┘ │
│ │   MongoDB   │ │    │        │        │    │ ┌─────────────┐ │
│ │   :27017    │ │◄───┼────────┼────────┼────┤ │  Context7   │ │
│ └─────────────┘ │    │        │        │    │ │   :3004     │ │
│                 │    │        │        │    │ └─────────────┘ │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                    host.docker.internal
                          resolution
```

## Migration Checklist

If migrating from stdio to HTTP transport:

- [ ] ✅ Stop all stdio-based MCP servers
- [ ] ✅ Update `.env` with authentication tokens
- [ ] ✅ Start MCP servers with HTTP/SSE transport
- [ ] ✅ Verify servers respond to HTTP requests
- [ ] ✅ Rebuild and restart containers: `make quick-docker-multi`
- [ ] ✅ Check MCP servers appear without timeout errors
- [ ] ✅ Test MCP tool functionality in chat

## Future Improvements

1. **Auto-discovery**: Automatically detect running MCP servers
2. **Health monitoring**: Regular health checks with failover
3. **Load balancing**: Distribute requests across multiple instances
4. **Retry logic**: Exponential backoff for failed connections
5. **Fallback chains**: Graceful degradation when servers unavailable

## Getting Help

If issues persist:

1. **Check logs**: `docker logs olympian-backend | grep -i mcp`
2. **Verify network**: Test `host.docker.internal` connectivity
3. **Validate config**: Ensure JSON syntax and server support
4. **Test individually**: Verify each MCP server works standalone
5. **Review environment**: Check all required variables are set

The key insight is that **multi-host deployments require HTTP-based MCP connections**, not stdio process spawning, due to Docker's network isolation.
