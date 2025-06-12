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
- **Proxy**: Integrated nginx in frontend container for optimal performance

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

#### Option B: Docker Same-Host with Ollama Container (One Command)

```bash
# Configure and deploy same-host Docker with containerized Ollama (auto-generates secure secrets)
make quick-docker-same
```

#### Option B2: Docker Same-Host with Existing Ollama (One Command) ⭐ NEW

```bash
# Configure and deploy same-host Docker using existing host Ollama (auto-generates secure secrets)
make quick-docker-same-existing
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
make env-docker-same              # Docker with Ollama container
make env-docker-same-existing     # Docker with existing host Ollama
# or env-dev, env-docker-multi

# Step 2: Check configuration
make show-env

# Step 3: Deploy
make docker-same                  # Docker with Ollama container
make docker-same-existing         # Docker with existing host Ollama
# or dev, docker-multi
```

## Environment Configuration

The application uses a single `.env` file that's automatically configured:

### 🔧 Automatic Configuration Commands

- `make env-dev` - Configure for development + generate secrets
- `make env-docker-same` - Configure for Docker same-host with Ollama container + generate secrets
- `make env-docker-same-existing` - Configure for Docker same-host with existing host Ollama + generate secrets ⭐ NEW
- `make env-docker-multi` - Configure for Docker multi-host + generate secrets

All environment commands automatically:
✅ Set appropriate service URLs  
✅ Generate secure JWT and session secrets  
✅ Configure deployment mode  

### 🚀 One-Step Deployment Commands

- `make quick-dev` - Configure + start development
- `make quick-docker-same` - Configure + deploy Docker same-host with Ollama container
- `make quick-docker-same-existing` - Configure + deploy Docker same-host with existing host Ollama ⭐ NEW

## Available Commands

### Setup & Environment
```bash
make setup                        # Initial project setup
make env-dev                      # Configure for development (auto-generates secrets)
make env-docker-same              # Configure for Docker same-host with Ollama container (auto-generates secrets)
make env-docker-same-existing     # Configure for Docker same-host with existing host Ollama (auto-generates secrets)
make env-docker-multi             # Configure for Docker multi-host (auto-generates secrets)
make show-env                     # Show current configuration and security status
make apply-secrets                # Generate and apply new secrets to existing .env
```

### Quick Deployment
```bash
make quick-dev                    # One-step development setup
make quick-docker-same            # One-step Docker same-host deployment (with Ollama container)
make quick-docker-same-existing   # One-step Docker same-host deployment (with existing host Ollama)
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
make docker-dev                   # Run development in Docker
make docker-same                  # Production deployment (same-host with Ollama container)
make docker-same-existing         # Production deployment (same-host with existing host Ollama)
make docker-multi                 # Production deployment (multi-host)
make docker-build                 # Build Docker images only
```

### Monitoring & Maintenance
```bash
make health-check                 # Check service health
make logs-dev                     # View development logs
make logs-prod                    # View production logs
make logs-same-existing           # View logs for same-host with existing Ollama deployment
make stop-dev                     # Stop development containers
make stop-prod                    # Stop production containers
make stop-same-existing           # Stop same-host with existing Ollama containers
make db-backup                    # Backup MongoDB
make db-restore                   # Restore MongoDB from latest backup
```

## Usage

1. **Access the application**:
   - Development: http://localhost:3000 (frontend) + http://localhost:4000 (backend)
   - Docker: http://localhost:8080 (or your configured APP_PORT)

2. **Auto-discover connections**: The app automatically scans for Ollama, MCP servers, and MongoDB

3. **Configure MCP**: Use the MCP Config panel to set up your MCP servers and tools

4. **Start chatting**: Select a model in Divine Dialog and start conversing

## Architecture Improvements

### 🚀 Integrated Nginx Frontend Architecture

The application now uses an optimized nginx architecture:

- **Unified Frontend Container**: Single container handles both static file serving and backend proxying
- **Optimized Performance**: Direct nginx serving with intelligent caching for static assets
- **Simplified Deployment**: No separate nginx proxy container needed
- **Health Monitoring**: Built-in health checks and monitoring endpoints

**Before (Issue)**:
```
Host:8080 → Nginx Proxy (empty, shows default page) ❌
              ↓
             Frontend Container (has files but not exposed) ⚠️
              ↓
             Backend Container
```

**After (Fixed)**:
```
Host:8080 → Frontend Container (nginx + React app + backend proxy) ✅
              ↓
             Backend Container
```

Benefits:
- ✅ **Eliminates Default Page Issue**: Frontend files are properly served
- ✅ **Better Performance**: Direct nginx serving with asset caching
- ✅ **Simplified Architecture**: Fewer containers and network hops
- ✅ **Easier Maintenance**: Single point for frontend and proxy configuration

## Deployment Configurations

Choose the deployment option that best fits your setup:

### 🏠 Development (make env-dev)
Best for: Local development and testing
- Ollama: Uses existing host installation at `localhost:11434`
- MongoDB: Uses local MongoDB installation
- All services run natively on host

### 🐳 Docker Same-Host with Ollama Container (make env-docker-same)
Best for: Production deployment where you want everything containerized
- Ollama: Downloads and runs in Docker container
- MongoDB: Runs in Docker container
- All services isolated in containers

### 🐳⚡ Docker Same-Host with Existing Ollama (make env-docker-same-existing) ⭐ NEW
Best for: Production deployment where Ollama is already running on host
- Ollama: Uses existing host installation via `host.docker.internal:11434`
- MongoDB: Runs in Docker container
- Hybrid approach - existing Ollama + containerized app services

### 🌐 Docker Multi-Host (make env-docker-multi)
Best for: Distributed deployment across multiple servers
- Ollama: Uses remote Ollama server
- MongoDB: Uses remote MongoDB server
- App services in containers, external dependencies on separate hosts

## Example Environment Configurations

After running the environment commands, your `.env` will be automatically configured:

### Development Setup (make env-dev)
```bash
DEPLOYMENT_MODE=development
MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite
OLLAMA_HOST=http://localhost:11434
JWT_SECRET=<auto-generated-secure-secret>
SESSION_SECRET=<auto-generated-secure-secret>
```

### Docker Same-Host with Ollama Container (make env-docker-same)
```bash
DEPLOYMENT_MODE=docker-same-host
MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite
OLLAMA_HOST=http://olympian-ollama:11434
JWT_SECRET=<auto-generated-secure-secret>
SESSION_SECRET=<auto-generated-secure-secret>
```

### Docker Same-Host with Existing Ollama (make env-docker-same-existing) ⭐ NEW
```bash
DEPLOYMENT_MODE=same-host-existing-ollama
MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite
OLLAMA_HOST=http://host.docker.internal:11434
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
make env-dev                      # or env-docker-same, env-docker-same-existing, env-docker-multi

# Apply new secrets to existing configuration
make apply-secrets
```

### Docker Issues
```bash
# Check service logs
make logs-prod                    # For standard same-host deployment
make logs-same-existing           # For same-host with existing Ollama

# Restart services
docker compose -f docker-compose.same-host.yml restart                    # Standard same-host
docker compose -f docker-compose.same-host-existing-ollama.yml restart    # Same-host with existing Ollama

# Rebuild images
make docker-build
```

### Frontend/Nginx Issues
```bash
# Check if you're seeing the default nginx page instead of the app
curl -I http://localhost:8080

# If you see "nginx/1.x.x" in Server header but app doesn't load:
# 1. Check if frontend container is healthy
docker ps --filter "name=olympian-frontend" --format "table {{.Names}}\t{{.Status}}"

# 2. Check frontend container logs
docker logs olympian-frontend

# 3. Verify nginx configuration is correct
docker exec olympian-frontend cat /etc/nginx/conf.d/default.conf

# 4. Test backend connectivity from frontend container
docker exec olympian-frontend curl -f http://backend:4000/api/health

# 5. Rebuild frontend with latest architecture fixes
make docker-build
docker compose down
docker compose up -d
```

### Ollama Connection Issues (Existing Host Ollama)
```bash
# Verify Ollama is running on host
curl http://localhost:11434/api/tags

# Check if Docker can reach host Ollama
docker run --rm --add-host host.docker.internal:host-gateway curlimages/curl curl -s http://host.docker.internal:11434/api/tags

# View container logs to debug connection
make logs-same-existing
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
├── .env.example                                    # Environment template (committed)
├── .env                                           # Your configuration (gitignored, auto-generated)
├── docker-compose.yml                             # Development Docker setup
├── docker-compose.same-host.yml                   # Same-host with Ollama container
├── docker-compose.same-host-existing-ollama.yml   # Same-host with existing Ollama ⭐ NEW
├── docker-compose.prod.yml                        # Production setup
├── packages/
│   ├── client/                                    # React frontend
│   ├── server/                                    # Express backend
│   └── shared/                                    # Shared types and utilities
├── docker/                                        # Docker configurations
│   ├── frontend/                                  # Frontend Dockerfile with integrated nginx
│   ├── backend/                                   # Backend Dockerfile
│   └── nginx/                                     # Nginx configurations
│       ├── conf.d/
│       │   ├── default.conf                       # Original nginx config (kept for reference)
│       │   └── frontend.conf                      # New integrated frontend config ⭐ NEW
│       └── nginx.conf                            # Main nginx configuration
├── scripts/                                       # Setup and deployment scripts
├── docs/                                          # Documentation
└── Makefile                                       # Automation commands
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
