# MCP Stdio Multihost Implementation

## Overview

This document describes the self-reliant stdio-based MCP (Model Context Protocol) implementation for **Subproject 3: Multi-host deployment**. The system runs MCP servers as **child processes** within the backend container using stdio transport, providing a fully self-contained architecture with no external dependencies.

## Architecture

### Key Design Principles

1. **Self-Reliant Architecture**: All MCP servers run as child processes within the backend container
2. **Stdio-Only Transport**: No HTTP containers - all communication uses stdio subprocess execution  
3. **Process-Based Execution**: Services spawn via npx/uv/uvx commands with environment isolation
4. **Zero External Dependencies**: No need for external MCP server installations or separate containers

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend Container                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────────────────────────┐  │
│  │   Backend    │────▶│     MCP Child Processes         │  │
│  │  Container   │     ├─────────────────────────────────┤  │
│  │             │     │ • npx @modelcontextprotocol/    │  │
│  │  MCP Client │     │   server-github                 │  │
│  │  - Stdio    │     │ • npx metmuseum-mcp             │  │
│  │  - Subprocs │     │ • uv applescript-mcp            │  │
│  │             │     │ • npx nasa-mcp-server           │  │
│  └─────────────┘     │ • uvx basic-memory              │  │
│                      │ • npx context7-mcp              │  │
│                      └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Configuration

### 1. MCP Configuration File

The system uses `mcp-config.multihost.json` which defines stdio commands for all MCP servers:


```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    },
    "met-museum": {
      "command": "npx",
      "args": ["-y", "metmuseum-mcp"]
    },
    "applescript_execute": {
      "command": "uv",
      "args": [
        "--directory",
        "/Users/cristobalnavarro/Servers/applescript-mcp",
        "run",
        "src/applescript_mcp/server.py"
      ]
    },
    "nasa-mcp": {
      "command": "npx",
      "args": ["-y", "@programcomputer/nasa-mcp-server@latest"],
      "env": {
        "NASA_API_KEY": "${NASA_API_KEY}"
      }
    },
    "basic-memory": {
      "command": "uvx",
      "args": ["basic-memory", "mcp"]
    },
    "Context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

### 2. Environment Variables

Set these in your `.env` file:

```bash
# Deployment mode - CRITICAL for subproject 3
DEPLOYMENT_MODE=multi-host
ENABLE_MULTI_HOST=true

# MCP Configuration - STDIO TRANSPORT
MCP_ENABLED=true
MCP_TRANSPORT=stdio
MCP_CONFIG_PATH=/app/mcp-config.multihost.json

# Authentication tokens for MCP child processes
GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
NASA_API_KEY=your_key_or_DEMO_KEY
BRAVE_API_KEY=your_key_here
CONTEXT7_API_KEY=your_key_here
```

