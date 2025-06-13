# Olympian AI Lightweight

A minimalist MCP client application focused on seamless Ollama integration with automatic connection discovery and intelligent request handling.

## Features

- **MCP Client**: Full MCP client implementation with tool discovery and invocation
- **Plugs (Auto-Discovery)**: Automatic scanning for Ollama instances, MCP servers, and MongoDB databases
- **MCP Config Panel**: Visual editor for MCP configuration and tool descriptions
- **Divine Dialog**: Advanced chat interface with model state indicators, image support, and persistent history
- **Ollama Streamliner**: Intelligent request handling based on model capabilities
- **Automatic Nginx Configuration**: Zero-config nginx setup with environment-based routing

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: MongoDB (local or remote)
- **Communication**: WebSockets for real-time streaming
- **MCP SDK**: Official MCP TypeScript SDK
- **Proxy**: Integrated nginx with automatic configuration

## Prerequisites

- Node.js 18+
- MongoDB (local or remote instance)
- Ollama installed and running
- MCP servers (optional)
- Docker & Docker Compose (for containerized deployment)
- Make (for running commands)

## Quick Start

### 🚀 Everything is done through Make!

All operations in Olympian AI Lightweight are handled through the Makefile for consistency and ease of use.

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight.git
cd olympian-ai-lightweight

# Run setup (installs dependencies and creates .env from template)
make setup
```

### 2. Choose Your Deployment Method

#### Option A: Local Development (One Command)

```bash
# Configure and start development (auto-generates secure secrets)
make quick-dev
```

#### Option B: Docker Development (One Command)

```bash
# Configure and start Docker development environment
make quick-docker-dev
```

#### Option C: Production Deployments

```bash
# Same-host with Ollama container
make quick-docker-same

# Same-host with existing Ollama
make quick-docker-same-existing

# Multi-host deployment (configure .env first)
make quick-docker-multi
```

## 🎯 Key Make Commands

### Quick Start Commands
```bash
make quick-dev                    # Development setup + start
make quick-docker-dev             # Docker dev setup + start
make quick-docker-same            # Production same-host with Ollama
make quick-docker-same-existing   # Production with existing Ollama
```

### Docker Operations
```bash
make docker-dev                   # Start Docker development
make docker-same                  # Deploy same-host with Ollama
make docker-same-existing         # Deploy with existing Ollama
make docker-multi                 # Deploy multi-host setup
make docker-down                  # Stop all containers
make docker-restart               # Restart containers
```

### Nginx Management
```bash
make nginx-test                   # Test nginx configuration
make nginx-reload                 # Reload nginx config
```

### Monitoring
```bash
make health-check                 # Check all services health
make health-check-dev             # Check dev services
make show-status                  # Show container status
make logs-frontend                # View frontend/nginx logs
make logs-backend                 # View backend logs
```

### Utilities
```bash
make shell-frontend               # Access frontend container shell
make shell-backend                # Access backend container shell
make show-env                     # Display current configuration
make reset-all                    # Reset everything (careful!)
```

## 🔧 Automatic Nginx Configuration

The application now features fully automatic nginx configuration that adapts based on your deployment mode:

### How It Works

1. **Environment Detection**: Reads `DEPLOYMENT_MODE` to determine configuration
2. **Dynamic URL Updates**: Automatically configures backend URLs
3. **Configuration Testing**: Validates nginx config before starting
4. **Zero Manual Setup**: No manual nginx configuration required

### Environment Variables

```bash
# These are automatically set by make commands
DEPLOYMENT_MODE=same-host         # or multi-host, development
BACKEND_HOST=backend              # Backend service hostname
BACKEND_PORT=4000                 # Backend service port
```

### Nginx Features

- ✅ Automatic backend URL configuration
- ✅ Deployment mode detection
- ✅ Health check endpoints
- ✅ Static asset caching
- ✅ WebSocket proxy support
- ✅ Security headers
- ✅ Gzip compression

## Available Commands

### Setup & Environment
```bash
make help                         # Show all available commands
make setup                        # Initial project setup
make env-dev                      # Configure for development
make env-docker-same              # Configure for same-host with Ollama
make env-docker-same-existing     # Configure for existing Ollama
make env-docker-multi             # Configure for multi-host
make show-env                     # Show current configuration
make apply-secrets                # Generate new secrets
```

### Development
```bash
make dev                          # Start development servers
make build                        # Build all packages
make test                         # Run tests
make lint                         # Run linter
make format                       # Format code
make clean                        # Clean build artifacts
```

### Docker Deployment
```bash
make docker-build                 # Build Docker images
make docker-dev                   # Run development in Docker
make docker-same                  # Deploy same-host with Ollama
make docker-same-existing         # Deploy with existing Ollama
make docker-multi                 # Deploy multi-host setup
make docker-down                  # Stop all containers
make docker-restart               # Restart containers
```

### Monitoring & Maintenance
```bash
make health-check                 # Check service health
make health-check-dev             # Check dev service health
make show-status                  # Show container status
make logs-dev                     # View development logs
make logs-prod                    # View production logs
make logs-frontend                # View frontend/nginx logs
make logs-backend                 # View backend logs
make nginx-test                   # Test nginx configuration
make nginx-reload                 # Reload nginx config
make db-backup                    # Backup MongoDB
make db-restore                   # Restore MongoDB
```

## Usage

1. **Access the application**:
   - Development: http://localhost:3000 (frontend) + http://localhost:4000 (backend)
   - Docker Dev: http://localhost:3000
   - Production: http://localhost:8080 (or your configured APP_PORT)

2. **Auto-discover connections**: The app automatically scans for Ollama, MCP servers, and MongoDB

3. **Configure MCP**: Use the MCP Config panel to set up your MCP servers and tools

4. **Start chatting**: Select a model in Divine Dialog and start conversing

## Architecture Improvements

### 🚀 Automatic Nginx Configuration

The application now features intelligent nginx configuration that automatically adapts to your deployment:

**Key Benefits**:
- ✅ **Zero Configuration**: Nginx automatically configures itself based on environment
- ✅ **Dynamic Backend URLs**: Backend host/port automatically detected and configured
- ✅ **Deployment Mode Aware**: Different configs for same-host vs multi-host
- ✅ **Health Monitoring**: Built-in health check endpoints
- ✅ **Configuration Validation**: Tests config before starting

**Architecture**:
```
Environment Variables
    ↓
docker-entrypoint.sh (reads env)
    ↓
Selects appropriate nginx config
    ↓
Updates backend URLs dynamically
    ↓
Tests configuration
    ↓
Starts nginx
```

## Deployment Configurations

All deployments are handled through make commands:

### 🏠 Development
```bash
make quick-dev                    # Local development
make quick-docker-dev             # Docker development
```

### 🐳 Production Same-Host
```bash
make quick-docker-same            # With Ollama container
make quick-docker-same-existing   # With existing Ollama
```

### 🌐 Production Multi-Host
```bash
make env-docker-multi             # Configure environment
# Edit .env for your IPs
make docker-multi                 # Deploy
```

## Troubleshooting

### Quick Fixes
```bash
# Check everything
make health-check
make show-status
make show-env

# View logs
make logs-frontend                # Nginx/frontend logs
make logs-backend                 # Backend logs

# Test nginx
make nginx-test

# Restart everything
make docker-restart

# Full reset (careful!)
make reset-all
```

### Nginx Issues
```bash
# Test nginx configuration
make nginx-test

# View nginx logs
make logs-frontend

# Access frontend container
make shell-frontend

# Check nginx config inside container
docker exec olympian-frontend cat /etc/nginx/conf.d/default.conf
```

### Connection Issues
```bash
# Check service health
make health-check

# Check if backend is accessible
docker exec olympian-frontend curl -f http://backend:4000/api/health

# For existing Ollama setup
curl http://localhost:11434/api/tags
```

## Project Structure

```
olympian-ai-lightweight/
├── Makefile                      # 🎯 All commands (use this!)
├── docker-compose.yml            # Development Docker setup
├── docker-compose.*.yml          # Various deployment configs
├── packages/
│   ├── client/                   # React frontend
│   ├── server/                   # Express backend
│   └── shared/                   # Shared types
├── docker/
│   ├── frontend/                 # Frontend + nginx
│   ├── backend/                  # Backend service
│   └── nginx/                    # Nginx configs
│       ├── docker-entrypoint.sh  # 🔧 Auto-config script
│       └── conf.d/               # Nginx configurations
├── docs/
│   └── nginx-configuration.md    # Nginx documentation
└── scripts/                      # Helper scripts
```

## Security Features

- **🔐 Automatic Secret Generation** - All environment commands generate secure secrets
- **🛡️ Configuration Validation** - Nginx config tested before starting
- **📊 Security Status** - `make show-env` shows security status
- **🔄 Secret Rotation** - `make apply-secrets` for new secrets
- **🚫 Git Protection** - `.env` is gitignored

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Nginx Configuration Guide](docs/nginx-configuration.md)
- [Docker Deployment Guide](docker/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
