# MCP Multi-Host Stdio Troubleshooting Guide

This guide addresses MCP issues in **Subproject 3** using stdio transport.

## Architecture Overview

Subproject 3 uses **stdio transport** with child processes:
- All MCP servers run as child processes within the backend container
- Communication via stdio (stdin/stdout) - no HTTP/network involved  
- Process spawning via npx/uv/uvx commands

## Common Issues

### 1. MCP Server Not Starting

**Diagnosis:**
```bash
curl http://localhost:4000/api/mcp/status
docker logs olympian-backend | grep MCP
```

**Solutions:**
- Check authentication tokens in environment variables
- Verify npx/uv package installation works
- Check local paths for AppleScript MCP server

### 2. Tool Discovery Failures  

**Diagnosis:**
```bash
curl http://localhost:4000/api/mcp/tools
curl http://localhost:4000/api/mcp/debug/tool-registry
```

**Solutions:**
- Restart backend container
- Clear tool cache: `curl -X DELETE http://localhost:4000/api/mcp/cache`

### 3. Resource Issues

**Solutions:**
- Increase container memory in docker-compose.prod.yml
- Monitor with `docker stats olympian-backend`

## Recovery Procedures

1. **Soft Reset:** Clear caches via API
2. **Hard Reset:** `docker restart olympian-backend`  
3. **Complete Rebuild:** `make docker-clean && make quick-docker-multi`

