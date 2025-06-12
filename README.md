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

#### Option A: Local Development (One Command)

```bash
# Configure and start development (auto-generates secure secrets)
make quick-dev
```

#### Option B: Docker Same-Host (One Command)

```bash
# Configure and deploy same-host Docker (auto-generates secure secrets)
make quick-docker-same
```

#### Option C: Docker Multi-Host

```bash
# Configure for multi-host (auto-generates secure secrets)
make env-docker-multi

# Edit .env to set your actual service IPs and credentials
nano .env

# Deploy the application
make docker-multi
```

### Alternative: Step-by-Step

If you prefer more control:

```bash
# Step 1: Configure environment (automatically generates secure secrets)
make env-docker-same     # or env-dev, env-docker-multi

# Step 2: Check configuration
make show-env

# Step 3: Deploy
make docker-same         # or dev, docker-multi
```

## Environment Configuration

The application uses a single `.env` file that's automatically configured:

### 🔧 Automatic Configuration Commands

- `make env-dev` - Configure for development + generate secrets
- `make env-docker-same` - Configure for Docker same-host + generate secrets  
- `make env-docker-multi` - Configure for Docker multi-host + generate secrets

All environment commands automatically:
✅ Set appropriate service URLs  
✅ Generate secure JWT and session secrets  
✅ Configure deployment mode  

### 🚀 One-Step Deployment Commands

- `make quick-dev` - Configure + start development
- `make quick-docker-same` - Configure + deploy Docker same-host

## Available Commands

### Setup & Environment
```bash
make setup              # Initial project setup
make env-dev            # Configure for development (auto-generates secrets)
make env-docker-same    # Configure for Docker same-host (auto-generates secrets)
make env-docker-multi   # Configure for Docker multi-host (auto-generates secrets)
make show-env           # Show current configuration and security status
make apply-secrets      # Generate and apply new secrets to existing .env
```

### Quick Deployment
```bash
make quick-dev          # One-step development setup
make quick-docker-same  # One-step Docker same-host deployment
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

## Example Deployment Configurations

After running the environment commands, your `.env` will be automatically configured:

### Development Setup (make env-dev)
```bash
DEPLOYMENT_MODE=development
MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite
OLLAMA_HOST=http://localhost:11434
JWT_SECRET=<auto-generated-secure-secret>
SESSION_SECRET=<auto-generated-secure-secret>
```

### Docker Same-Host Setup (make env-docker-same)
```bash
DEPLOYMENT_MODE=docker-same-host
MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite
OLLAMA_HOST=http://olympian-ollama:11434
JWT_SECRET=<auto-generated-secure-secret>
SESSION_SECRET=<auto-generated-secure-secret>
```

### Docker Multi-Host Setup (make env-docker-multi)
```bash
DEPLOYMENT_MODE=docker-multi-host
MONGODB_URI=mongodb://username:password@192.168.1.10:27017/olympian_ai_lite
OLLAMA_HOST=http://192.168.1.11:11434
JWT_SECRET=<auto-generated-secure-secret>
SESSION_SECRET=<auto-generated-secure-secret>
```

## Troubleshooting

### Environment Issues
```bash
# Check current configuration and security status
make show-env

# Reconfigure for your deployment mode (auto-generates new secrets)
make env-dev          # or env-docker-same, env-docker-multi

# Apply new secrets to existing configuration
make apply-secrets
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
├── .env                # Your configuration (gitignored, auto-generated)
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

## Security Features

- **🔐 Automatic Secret Generation** - All environment commands generate cryptographically secure JWT secrets
- **🛡️ Default Protection** - Deployment scripts detect and reject default/insecure secrets
- **📊 Security Status** - `make show-env` shows whether your secrets are secure
- **🔄 Secret Rotation** - `make apply-secrets` generates new secrets for existing configurations
- **🚫 Git Protection** - `.env` is automatically gitignored, only `.env.example` is committed

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Docker Deployment Guide](docker/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
