# MCP Integration Credential Fix

## Problem
The MCP Manager was repeatedly shutting down and restarting every 5 seconds due to:
1. Attempting to start MCP servers without valid credentials
2. Health check endpoint returning 503 when no servers were running
3. Error handling that crashed the entire service when individual servers failed

## Solution
1. **Credential Validation**: MCPManager now validates credentials before attempting to start servers:
   - GitHub server only starts if GITHUB_PERSONAL_ACCESS_TOKEN is set and not a placeholder
   - Context7 server only starts if UPSTASH credentials are set and not placeholders
   - AppleScript server always starts (no credentials needed)

2. **Health Check Fix**: MCP health endpoint now returns 200 OK even when no servers are running
   - MCP is treated as optional functionality
   - Status field indicates "no-servers" when none are running

3. **Error Handling**: Server startup failures are logged but don't crash the service

## Configuration
To enable MCP servers, set the following environment variables in `.env`:
- `GITHUB_PERSONAL_ACCESS_TOKEN`: Your GitHub PAT (not "your_github_token_here")
- `UPSTASH_REDIS_REST_URL`: Your Upstash Redis URL (not "your_upstash_url_here")
- `UPSTASH_REDIS_REST_TOKEN`: Your Upstash Redis token (not "your_upstash_token_here")

## Status
- Fixed: 2025-08-07
- Subproject: Multi-host deployment (priority)
- Files modified:
  - packages/server/src/services/MCPManager.ts
  - packages/server/src/api/mcp.ts
