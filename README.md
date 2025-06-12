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

### 1. Initial Setup

```bash
# Clone the repository
git clone https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight.git
cd olympian-ai-lightweight

# Run setup (installs dependencies and creates .env from template)
make setup
```

### 2. Choose Your Deployment Method

#### Option A: Local Development

```bash
# Configure for development (uses localhost services)
make env-dev

# Generate secure secrets
make generate-secrets
# Copy the generated JWT_SECRET and SESSION_SECRET to your .env file

# Start development servers
make dev
```

#### Option B: Docker Same-Host (All services in containers)

```bash
# Configure for Docker same-host deployment
make env-docker-same

# Generate and set secure secrets in .env
make generate-secrets

# Deploy everything on the same host
make docker-same
```

#### Option C: Docker Multi-Host (External services)

```bash
# Configure for Docker multi-host deployment
make env-docker-multi

# Edit .env to set your actual service IPs and credentials
# Set your MongoDB URI, Ollama host, etc.
nano .env

# Generate and set secure secrets
make generate-secrets

# Deploy the application
make docker-multi
```

## Environment Configuration

The application uses a single `.env` file for all configurations:

### Development Setup
```bash
DEPLOYMENT_MODE=development
MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite
OLLAMA_HOST=http://localhost:11434
JWT_SECRET=your-secure-jwt-secret
SESSION_SECRET=your-secure-session-secret
```

### Docker Same-Host Setup
```bash
DEPLOYMENT_MODE=docker-same-host
MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite
OLLAMA_HOST=http://olympian-ollama:11434
JWT_SECRET=your-secure-jwt-secret
SESSION_SECRET=your-secure-session-secret
```

### Docker Multi-Host Setup
```bash
DEPLOYMENT_MODE=docker-multi-host
MONGODB_URI=mongodb://username:password@192.168.1.10:27017/olympian_ai_lite
OLLAMA_HOST=http://192.168.1.11:11434
# Optional: Multiple Ollama instances
OLLAMA_HOSTS=192.168.1.11:11434,192.168.1.12:11434
JWT_SECRET=your-secure-jwt-secret
SESSION_SECRET=your-secure-session-secret
```

## Available Commands

### Setup & Environment
```bash
make setup              # Initial project setup
make env-dev            # Configure for development
make env-docker-same    # Configure for Docker same-host
make env-docker-multi   # Configure for Docker multi-host
make generate-secrets   # Generate secure JWT secrets
make show-env           # Show current configuration
```

### Development
```bash
make dev                # Start development servers
make build              # Build all packages
make test               # Run tests
make lint               # Run linter
make format             # Format code
make clean              # Clean build artifacts
```

### Docker Deployment
```bash
make docker-dev         # Run development in Docker
make docker-same        # Production deployment (same-host)
make docker-multi       # Production deployment (multi-host)
make docker-build       # Build Docker images only
```

### Monitoring & Maintenance
```bash
make health-check       # Check service health
make logs-dev           # View development logs
make logs-prod          # View production logs
make stop-dev           # Stop development containers
make stop-prod          # Stop production containers
make db-backup          # Backup MongoDB
make db-restore         # Restore MongoDB from latest backup
```

## Usage

1. **Access the application**:
   - Development: http://localhost:3000 (frontend) + http://localhost:4000 (backend)
   - Docker: http://localhost:8080 (or your configured APP_PORT)

2. **Auto-discover connections**: The app automatically scans for Ollama, MCP servers, and MongoDB

3. **Configure MCP**: Use the MCP Config panel to set up your MCP servers and tools

4. **Start chatting**: Select a model in Divine Dialog and start conversing

## Troubleshooting

### Environment Issues
```bash
# Check current configuration
make show-env

# Reconfigure for your deployment mode
make env-dev          # or env-docker-same, env-docker-multi

# Generate new secrets if needed
make generate-secrets
```

### Docker Issues
```bash
# Check service logs
make logs-prod

# Restart services
docker compose -f docker-compose.same-host.yml restart

# Rebuild images
make docker-build
```

### Development Issues
```bash
# Check if services are running
make health-check

# Restart development environment
make stop-dev
make dev
```

## Project Structure

```
olympian-ai-lightweight/
├── .env.example         # Environment template (committed)
├── .env                # Your configuration (gitignored)
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Express backend
│   └── shared/          # Shared types and utilities
├── docker/              # Docker configurations
│   ├── frontend/        # Frontend Dockerfile
│   ├── backend/         # Backend Dockerfile
│   └── nginx/           # Nginx configuration
├── scripts/             # Setup and deployment scripts
├── docs/                # Documentation
└── Makefile            # Automation commands
```

## Security Notes

- **Never commit `.env`** - it contains secrets and is automatically gitignored
- **Always set secure secrets** - use `make generate-secrets` to create strong JWT secrets
- **Update default credentials** - change default MongoDB credentials in multi-host deployments
- **Use HTTPS in production** - configure proper SSL certificates for production deployments

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Docker Deployment Guide](docker/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
