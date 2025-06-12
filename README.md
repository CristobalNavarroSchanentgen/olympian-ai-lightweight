# Olympian AI Lightweight

A minimalist MCP client application focused on seamless Ollama integration with automatic connection discovery and intelligent request handling.

## Features

- **MCP Client**: Full MCP client implementation with tool discovery and invocation
- **Plugs (Auto-Discovery)**: Automatic scanning for Ollama instances, MCP servers, and MongoDB databases
- **MCP Config Panel**: Visual editor for MCP configuration and tool descriptions
- **Divine Dialog**: Advanced chat interface with model state indicators, image support, and persistent history
- **Ollama Streamliner**: Intelligent request handling based on model capabilities

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: MongoDB (local or remote)
- **Communication**: WebSockets for real-time streaming
- **MCP SDK**: Official MCP TypeScript SDK

## Prerequisites

- Node.js 18+
- MongoDB (local or remote instance)
- Ollama installed and running
- MCP servers (optional)
- Docker & Docker Compose (for containerized deployment)

## Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight.git
cd olympian-ai-lightweight

# Run setup script
make setup
# Or manually:
# npm install
# cp packages/server/.env.example packages/server/.env

# Start development servers
make dev
# Or: npm run dev
```

### Docker Deployment

The application supports two deployment modes:

#### 1. Same-Host Deployment
All services (Ollama, MongoDB, MCP) run on the same host in different containers:

```bash
# Deploy everything on the same host
make docker-same
# Or: ./scripts/docker-deploy.sh --same-host
```

#### 2. Multi-Host Deployment
Services run on different hosts in your local network:

```bash
# Configure your service endpoints
cp .env.docker .env
# Edit .env with your MongoDB, Ollama, and MCP host IPs

# Deploy the application
make docker-multi
# Or: ./scripts/docker-deploy.sh --multi-host
```

## Configuration

### Environment Variables

Key configuration in `.env.docker`:

```bash
# Deployment mode: 'same-host' or 'multi-host'
DEPLOYMENT_MODE=multi-host

# Multi-host configuration
MONGODB_URI=mongodb://192.168.1.10:27017/olympian_ai_lite
OLLAMA_HOST=http://192.168.1.11:11434

# Multiple Ollama instances (optional)
OLLAMA_HOSTS=192.168.1.11:11434,192.168.1.12:11434
OLLAMA_LOAD_BALANCER=round-robin
```

### Application Configuration

The application stores configuration in `~/.olympian-ai-lite/`:
- `mcp_config.json` - MCP server configurations
- `tool_overrides.json` - Custom tool descriptions
- `backups/` - Configuration backups

## Usage

1. **Access the application**: http://localhost:8080 (or your configured port)
2. **Auto-discover connections**: The app will automatically scan for Ollama, MCP servers, and MongoDB
3. **Configure MCP**: Use the MCP Config panel to set up your MCP servers and tools
4. **Start chatting**: Select a model in Divine Dialog and start conversing

## Available Commands

```bash
# Development
make dev              # Start development servers
make build            # Build all packages
make test             # Run tests
make lint             # Run linter

# Docker
make docker-dev       # Run development in Docker
make docker-same      # Production deployment (same-host)
make docker-multi     # Production deployment (multi-host)

# Utilities
make health-check     # Check service health
make db-backup        # Backup MongoDB
make db-restore       # Restore MongoDB
```

## Project Structure

```
olympian-ai-lightweight/
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Express backend
│   └── shared/          # Shared types and utilities
├── docker/              # Docker configurations
│   ├── frontend/        # Frontend Dockerfile
│   ├── backend/         # Backend Dockerfile
│   └── nginx/           # Nginx configuration
├── docs/                # Documentation
└── scripts/             # Deployment scripts
```

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Docker Deployment Guide](docker/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
