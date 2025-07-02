# MCP HTTP Multihost Implementation

## Overview

This document describes the self-reliant HTTP-only MCP (Model Context Protocol) implementation for **Subproject 3: Multi-host deployment**. The system is designed to run MCP servers as containers within the Docker network, providing a fully self-contained architecture with no external dependencies.

## Architecture

### Key Design Principles

1. **Self-Reliant Architecture**: All MCP servers run as Docker containers within the same network
2. **HTTP-Only Transport**: No stdio support - all communication uses HTTP/SSE protocols
3. **Container-Based Networking**: Services communicate via Docker service names
4. **Zero External Dependencies**: No need for external MCP server installations

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Network (olympian-network)         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐     ┌─────────────────────────────────┐  │
│  │   Backend    │────▶│     MCP Server Containers       │  │
│  │  Container   │     ├─────────────────────────────────┤  │
│  │             │     │ • mcp-github     (port 3001)    │  │
│  │  MCP Client │     │ • mcp-nasa       (port 3002)    │  │
│  │  - HTTP     │     │ • mcp-metmuseum  (port 3003)    │  │
│  │  - SSE      │     │ • mcp-context7   (port 3004)    │  │
│  │             │     │ • mcp-applescript (port 3005)   │  │
│  └─────────────┘     │ • mcp-websearch  (port 3006)    │  │
│                      └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Configuration

### 1. MCP Configuration File

The system uses `mcp-config.multihost.json` which defines HTTP endpoints for all MCP servers:

```json
{
  "mcpServers": {
    "github": {
      "url": "http://mcp-github:3001/mcp",
      "type": "server",
      "auth": "Bearer YOUR_GITHUB_TOKEN",
      "timeout": 30000,
      "retries": 3
    },
    // ... other servers
  }
}
```

### 2. Environment Variables

Set these in your `.env` file:

```bash
# Deployment mode - CRITICAL for subproject 3
DEPLOYMENT_MODE=multi-host
ENABLE_MULTI_HOST=true

# MCP Configuration
MCP_ENABLED=true
MCP_TRANSPORT=http
MCP_CONFIG_PATH=/app/mcp-config.multihost.json

# Authentication tokens
GITHUB_PERSONAL_ACCESS_TOKEN=your_token_here
NASA_API_KEY=your_key_or_DEMO_KEY
BRAVE_API_KEY=your_key_here
```

### 3. Docker Compose Configuration

The `docker-compose.prod.yml` defines all MCP servers as separate containers:

```yaml
services:
  mcp-github:
    image: node:20-alpine
    container_name: olympian-mcp-github
    command: >
      sh -c "
        npm install -g @modelcontextprotocol/server-github@latest &&
        npx @modelcontextprotocol/server-github --transport http --port 3001
      "
    environment:
      GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_PERSONAL_ACCESS_TOKEN}
    networks:
      - olympian-network
```

## Implementation Details

### HTTP-Only Transport Enforcement

The implementation enforces HTTP-only transports at multiple levels:

1. **MCPClient.ts**: Rejects any non-HTTP transport configurations
2. **MCPConfigParser.ts**: Filters out stdio configurations during parsing
3. **API Routes**: Validates that only HTTP transports are accepted

### Container Networking

MCP servers are accessed using Docker service names:
- Internal: `http://mcp-github:3001/mcp`
- External (if needed): `http://localhost:3001/mcp`

### Health Checking

The system includes proactive health monitoring:
- Regular health checks for all MCP servers
- Automatic failover to healthy servers
- Exponential backoff for failed servers

### Tool Caching

Tools are cached locally for efficient access:
- Background refresh of tool lists
- Hit/miss tracking for optimization
- Automatic cache invalidation

## API Endpoints

### Server Management
- `GET /api/mcp/servers` - List all HTTP MCP servers
- `POST /api/mcp/servers` - Add new HTTP server
- `DELETE /api/mcp/servers/:id` - Remove server
- `POST /api/mcp/servers/:id/start` - Start server
- `POST /api/mcp/servers/:id/stop` - Stop server

### Tool Operations
- `GET /api/mcp/tools` - List all available tools
- `POST /api/mcp/invoke` - Invoke a tool with fallback support
- `POST /api/mcp/tools/select` - Smart tool selection

### Health & Monitoring
- `GET /api/mcp/health` - Overall health status
- `POST /api/mcp/servers/:id/health-check` - Force health check
- `GET /api/mcp/metrics` - System metrics

## Deployment

### Quick Start

1. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your tokens
   ```

2. Start the multihost deployment:
   ```bash
   make quick-docker-multi
   ```

3. Verify MCP servers are running:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
   ```

### Troubleshooting

1. **Check container logs**:
   ```bash
   docker logs olympian-mcp-github
   ```

2. **Verify network connectivity**:
   ```bash
   docker exec olympian-backend curl http://mcp-github:3001/health
   ```

3. **Check configuration loading**:
   ```bash
   curl http://localhost:4000/api/mcp/config/discovery
   ```

## Security Considerations

1. **Authentication**: Each MCP server uses its own authentication tokens
2. **Network Isolation**: MCP servers are only accessible within the Docker network
3. **No External Access**: MCP servers don't need to be exposed to the host

## Migration from External MCP Servers

If migrating from external MCP server setup:

1. Remove any stdio-based configurations
2. Update configuration to use HTTP endpoints
3. Ensure all authentication tokens are set
4. Restart the deployment

## Benefits of Self-Reliant Architecture

1. **Portability**: Entire system can be deployed anywhere with Docker
2. **Consistency**: Same MCP server versions across all deployments
3. **Isolation**: No conflicts with host system MCP installations
4. **Scalability**: Easy to add or remove MCP servers
5. **Maintainability**: All configurations in one place

## Future Enhancements

1. **Custom MCP Servers**: Add your own MCP servers as containers
2. **Load Balancing**: Multiple instances of the same MCP server
3. **Persistent Storage**: Volume mounts for MCP server data
4. **Monitoring**: Prometheus/Grafana integration for metrics

## Related Documentation

- [MCP_IMPLEMENTATION.md](./MCP_IMPLEMENTATION.md) - General MCP implementation guide
- [MULTI_HOST_RECOVERY.md](./MULTI_HOST_RECOVERY.md) - Recovery procedures
- [docker-compose.prod.yml](../docker-compose.prod.yml) - Docker configuration
