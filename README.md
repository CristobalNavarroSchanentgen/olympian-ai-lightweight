# Olympian AI Lightweight

A minimalist MCP client application focused on seamless Ollama integration with automatic connection discovery and intelligent request handling.

## Features

- **MCP Client**: Full MCP client implementation with tool discovery and invocation
- **Plugs (Auto-Discovery)**: Automatic scanning for Ollama instances, MCP servers, and MongoDB databases
- **MCP Config Panel**: Visual editor for MCP configuration and tool descriptions
- **Divine Dialog**: Advanced chat interface with model state indicators, image support, and persistent history
- **Chat Memory**: Intelligent conversation context management for coherent multi-turn conversations
- **Vision Capabilities**: Process images with vision models or hybrid vision/text processing
- **Ollama Streamliner**: Intelligent request handling based on model capabilities
- **Automatic Nginx Configuration**: Zero-config nginx setup with environment-based routing

## What's New: Development Mode with Hot Reloading 🔥

The latest version includes a development mode for multi-host deployment that provides hot reloading for React components:

- **🚀 Hot Reloading**: Edit React components and see changes instantly
- **📦 Volume Mounts**: Source files mounted directly into containers
- **🔧 Automatic Cache Busting**: Production builds always reflect latest changes
- **💡 Smart Build System**: Detects source file changes automatically

**📚 Documentation**: [Docker Build Caching Guide](docs/DOCKER_BUILD_CACHING.md) - Complete guide to development workflow

## What's New: Vision Capabilities 🎨

The latest version includes comprehensive vision support for processing images with AI models:

- **🔍 Intelligent Vision Detection**: Automatic 8-method detection system for vision capabilities
- **🖼️ Image Upload**: Drag-and-drop or browse to upload images in chat
- **🤖 Vision Model Detection**: Automatically identifies vision-capable models
- **🔄 Hybrid Processing**: Use separate vision and text models for flexibility
- **💡 Smart Fallback**: Clear guidance when vision models are needed
- **📎 Multiple Formats**: Support for PNG, JPG, JPEG, GIF, and WebP

**📚 Documentation**:
- [Vision Capabilities (User Guide)](docs/VISION_CAPABILITIES.md) - Complete user documentation
- [Vision Detection Technical](docs/VISION_DETECTION_TECHNICAL.md) - Deep technical implementation details
- [Multi-Host Vision Troubleshooting](docs/MULTI_HOST_VISION_TROUBLESHOOTING.md) - **NEW!** Fix vision issues in multi-host deployments

## What's New: Chat Memory Feature 🧠

The latest version includes an intelligent chat memory system that automatically maintains conversation context:

- **Automatic Context Management**: Previous messages are automatically included when chatting
- **Smart Token Management**: Optimizes context size based on model capabilities
- **Configurable Memory**: Customize how many messages and tokens to include
- **Auto-cleanup**: Prevents memory overflow in long conversations
- **Memory Statistics**: Monitor token usage and conversation length

[Read the full Chat Memory documentation](docs/CHAT_MEMORY.md)

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

#### Option D: Development Mode with Hot Reloading (NEW!)

```bash
# For multi-host development with hot reloading
make dev-multi

# This provides instant updates for React component changes!
```

## 🎯 Key Make Commands

### Quick Start Commands
```bash
make quick-dev                    # Development setup + start
make quick-docker-dev             # Docker dev setup + start
make quick-docker-same            # Production same-host with Ollama
make quick-docker-same-existing   # Production with existing Ollama
make dev-multi                    # Development mode with hot reloading (NEW!)
```

### Docker Operations
```bash
make docker-dev                   # Start Docker development
make docker-same                  # Deploy same-host with Ollama
make docker-same-existing         # Deploy with existing Ollama
make docker-multi                 # Deploy multi-host setup
make docker-down                  # Stop all containers
make docker-restart               # Restart containers
make rebuild-frontend             # Rebuild only frontend (NEW!)
make rebuild-backend              # Rebuild only backend (NEW!)
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
make logs-frontend-dev            # View frontend dev server logs (NEW!)
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
make dev-multi                    # Start multi-host dev with hot reloading
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
   - Dev Mode: http://localhost:8080 (app) + http://localhost:5173 (Vite dev server)

2. **Auto-discover connections**: The app automatically scans for Ollama, MCP servers, and MongoDB

3. **Configure MCP**: Use the MCP Config panel to set up your MCP servers and tools

4. **Start chatting**: Select a model in Divine Dialog and start conversing
   - Your conversation history is automatically maintained
   - The AI has context of previous messages
   - Upload images for vision models to analyze
   - Monitor memory usage with the new API endpoints

## Architecture Improvements

### 🎨 Vision Processing System

The application now supports comprehensive image processing with intelligent model selection:

**Key Benefits**:
- ✅ **Automatic Vision Detection**: 8-method intelligent detection system identifies which models support vision
- ✅ **Hybrid Processing**: Use separate vision and text models for maximum flexibility
- ✅ **Smart Fallback**: Clear guidance when vision capabilities are needed
- ✅ **Multiple Formats**: Support for common image formats
- ✅ **Performance Optimized**: Caching and load balancing for optimal performance

**Architecture**:
```
Image Upload
    ↓
Intelligent Vision Detection (8 methods)
    ↓ 
Direct Vision (if supported) OR Hybrid Processing
    ↓
AI Response with Image Understanding
```

**Technical Implementation**:
For detailed technical information about how vision detection works, including the 8-method detection system, API communication, caching strategies, and deployment-specific configurations, see our comprehensive technical documentation:

📖 **[Vision Detection Technical Guide](docs/VISION_DETECTION_TECHNICAL.md)**

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

### 🧠 Chat Memory System

The new chat memory system provides intelligent context management:

**Key Features**:
- **Automatic History Loading**: Previous messages included in AI context
- **Token Budget Management**: Optimizes based on model's context window
- **Configurable Limits**: Control message count and token usage
- **Auto-cleanup**: Prevents unbounded memory growth
- **Real-time Monitoring**: Track memory usage via API

**Architecture**:
```
User Message
    ↓
ChatMemoryService loads history
    ↓
OllamaStreamliner includes context
    ↓
AI responds with full conversation awareness
    ↓
Response saved to history
```

## Deployment Configurations

All deployments are handled through make commands:

### 🏠 Development
```bash
make quick-dev                    # Local development
make quick-docker-dev             # Docker development
make dev-multi                    # Multi-host dev with hot reloading (NEW!)
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

### Development Mode Issues

See the comprehensive [Docker Build Caching Guide](docs/DOCKER_BUILD_CACHING.md) for:
- How to use development mode effectively
- Troubleshooting hot reloading issues
- Understanding the build cache system
- Best practices for development workflow

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

### Vision Model Issues

**For comprehensive multi-host vision troubleshooting, see: [Multi-Host Vision Troubleshooting Guide](docs/MULTI_HOST_VISION_TROUBLESHOOTING.md)**

Quick checks:
```bash
# Check vision health status
curl http://localhost:8080/api/health/vision

# Check available vision models
curl http://localhost:8080/api/chat/vision-models

# Pull a vision model if none available
ollama pull llava:13b

# Check model capabilities
curl http://localhost:8080/api/chat/models/{modelName}/capabilities

# Debug vision detection (see technical docs for detailed debugging)
docker logs olympian-backend | grep "Vision detection"
```

### Chat Memory Issues
```bash
# Check memory stats for a conversation
curl http://localhost:8080/api/chat/conversations/{conversationId}/memory-stats

# Clear old messages if needed
curl -X POST http://localhost:8080/api/chat/conversations/{conversationId}/clear-old-messages \
  -H "Content-Type: application/json" \
  -d '{"keepLast": 50}'
```

## Project Structure

```
olympian-ai-lightweight/
├── Makefile                      # 🎯 All commands (use this!)
├── docker-compose.yml            # Development Docker setup
├── docker-compose.dev.yml        # 🔥 Development mode with hot reloading
├── docker-compose.*.yml          # Various deployment configs
├── packages/
│   ├── client/                   # React frontend
│   ├── server/                   # Express backend
│   │   └── services/
│   │       ├── ChatMemoryService.ts      # 🧠 Memory management
│   │       ├── OllamaStreamliner.ts      # 🎨 Vision processing & detection
│   │       └── OllamaHealthCheck.ts      # 🔍 Health monitoring
│   └── shared/                   # Shared types
├── docker/
│   ├── frontend/                 # Frontend + nginx
│   ├── backend/                  # Backend service
│   └── nginx/                    # Nginx configs
│       ├── docker-entrypoint.sh  # 🔧 Auto-config script
│       └── conf.d/               # Nginx configurations
├── docs/
│   ├── nginx-configuration.md              # Nginx documentation
│   ├── CHAT_MEMORY.md                      # Chat memory documentation
│   ├── VISION_CAPABILITIES.md              # Vision features user guide
│   ├── VISION_DETECTION_TECHNICAL.md       # 🔬 Technical implementation details
│   ├── MULTI_HOST_VISION_TROUBLESHOOTING.md # 🔍 Multi-host vision fixes
│   └── DOCKER_BUILD_CACHING.md             # 🔥 Docker caching & dev guide
└── scripts/                      # Helper scripts
    └── generate-build-args.sh    # 🔧 Auto cache-busting script
```

## Security Features

- **🔐 Automatic Secret Generation** - All environment commands generate secure secrets
- **🛡️ Configuration Validation** - Nginx config tested before starting
- **📊 Security Status** - `make show-env` shows security status
- **🔄 Secret Rotation** - `make apply-secrets` for new secrets
- **🚫 Git Protection** - `.env` and `.env.build` are gitignored

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Nginx Configuration Guide](docs/nginx-configuration.md)
- [Chat Memory Feature](docs/CHAT_MEMORY.md)
- [Vision Capabilities (User Guide)](docs/VISION_CAPABILITIES.md)
- [Vision Detection Technical](docs/VISION_DETECTION_TECHNICAL.md) - Technical deep dive
- [Multi-Host Vision Troubleshooting](docs/MULTI_HOST_VISION_TROUBLESHOOTING.md) - Fix vision issues
- [Docker Build Caching Guide](docs/DOCKER_BUILD_CACHING.md) - Development workflow & caching
- [Docker Deployment Guide](docker/README.md)
- [Contributing Guide](CONTRIBUTING.md)

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
