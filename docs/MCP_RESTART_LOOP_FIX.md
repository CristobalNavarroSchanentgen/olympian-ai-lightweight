# MCP Server Restart Loop Fix

## Problem
MCP servers were causing the backend to restart every 5 seconds due to missing/placeholder credentials.

## Root Cause
- MCP servers (GitHub, Context7, AppleScript) were configured in mcp-config.multihost.json
- Environment variables contained placeholder values ("your_token_here")
- When MCP servers failed to start with invalid credentials, they caused the entire server to restart

## Solution
Modified MCPManager.ts to:
1. Check for placeholder credentials before attempting to start MCP servers
2. Skip servers with missing or placeholder credentials with a warning
3. Continue server initialization without the affected MCP servers

## Changes Made
- Updated packages/server/src/services/MCPManager.ts addServer method
- Added credential validation to detect placeholder values
- Changed NODE_ENV from development to production in .env

## Result
- Server now starts successfully without restart loops
- MCP servers with valid credentials will start normally
- MCP servers with placeholder credentials are skipped with warnings
