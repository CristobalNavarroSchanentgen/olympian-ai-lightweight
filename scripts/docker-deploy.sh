#!/bin/bash

# Olympian AI Lightweight Docker Deployment Script
# Supports both same-host and multi-host deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DEPLOYMENT_MODE="multi-host"
ENV_FILE=".env"
COMPOSE_FILE="docker-compose.prod.yml"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --same-host)
            DEPLOYMENT_MODE="same-host"
            COMPOSE_FILE="docker-compose.same-host.yml"
            shift
            ;;
        --multi-host)
            DEPLOYMENT_MODE="multi-host"
            COMPOSE_FILE="docker-compose.prod.yml"
            shift
            ;;
        --env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --same-host     Deploy with all services on same host"
            echo "  --multi-host    Deploy with services on different hosts (default)"
            echo "  --env-file      Specify environment file (default: .env)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}🐳 Olympian AI Lightweight Docker Deployment${NC}"
echo -e "Deployment Mode: ${YELLOW}$DEPLOYMENT_MODE${NC}"
echo -e "Compose File: ${YELLOW}$COMPOSE_FILE${NC}"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

# Check environment file
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}⚠️  Environment file not found. Creating from template...${NC}"
    if [ -f ".env.example" ]; then
        cp .env.example "$ENV_FILE"
        echo -e "${BLUE}📝 Created $ENV_FILE from .env.example${NC}"
        echo ""
        echo -e "${YELLOW}Please configure $ENV_FILE for Docker deployment:${NC}"
        echo "  1. Set your JWT_SECRET and SESSION_SECRET with secure values"
        echo "  2. For same-host: Uncomment the docker-same-host section"
        echo "  3. For multi-host: Uncomment and configure the docker-multi-host section"
        echo ""
        echo "You can generate secure secrets with:"
        echo "  openssl rand -base64 32"
        echo ""
        echo "Run this command again after configuring $ENV_FILE"
        exit 1
    else
        echo -e "${RED}❌ No .env.example template found${NC}"
        echo "Please run 'make setup' first to initialize the project"
        exit 1
    fi
fi

# Load environment variables
export $(cat "$ENV_FILE" | grep -v '^#' | grep -v '^$' | xargs)

# Validate required environment variables
echo "Validating environment configuration..."

# Check JWT secrets
if [ "$JWT_SECRET" = "your-jwt-secret-key-here-replace-in-production" ] || [ "$SESSION_SECRET" = "your-session-secret-key-here-replace-in-production" ]; then
    echo -e "${RED}❌ Default security keys detected${NC}"
    echo "Please set secure JWT_SECRET and SESSION_SECRET in $ENV_FILE"
    echo "Generate secure keys with: openssl rand -base64 32"
    exit 1
fi

# Validate deployment mode configuration
if [ "$DEPLOYMENT_MODE" = "multi-host" ]; then
    echo "Validating multi-host configuration..."
    
    # Check if required variables are set for multi-host
    if [[ "$MONGODB_URI" == *"localhost"* ]] || [[ "$OLLAMA_HOST" == *"localhost"* ]]; then
        echo -e "${YELLOW}⚠️  Warning: Using localhost URLs in multi-host deployment${NC}"
        echo "Please configure external service URLs in $ENV_FILE for multi-host deployment"
        echo "Current MONGODB_URI: $MONGODB_URI"
        echo "Current OLLAMA_HOST: $OLLAMA_HOST"
        echo ""
        echo "For multi-host deployment, uncomment and configure the docker-multi-host section in $ENV_FILE"
        exit 1
    fi
    
    # Test MongoDB connection
    echo -n "Testing MongoDB connection... "
    if timeout 5 docker run --rm mongo:7 mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')" &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${YELLOW}⚠️  Warning: Could not connect to MongoDB at $MONGODB_URI${NC}"
        echo "Please ensure MongoDB is running and accessible"
    fi
    
    # Test Ollama connection
    echo -n "Testing Ollama connection... "
    if timeout 5 curl -s "$OLLAMA_HOST/api/version" &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${YELLOW}⚠️  Warning: Could not connect to Ollama at $OLLAMA_HOST${NC}"
        echo "Please ensure Ollama is running and accessible"
    fi
elif [ "$DEPLOYMENT_MODE" = "same-host" ]; then
    echo "Configuring for same-host deployment..."
    echo "All services will run in Docker containers on this host"
fi

# Build images
echo ""
echo "Building Docker images..."
if ! docker compose -f "$COMPOSE_FILE" build; then
    echo -e "${RED}❌ Failed to build Docker images${NC}"
    exit 1
fi

# Start services
echo ""
echo "Starting services..."
if ! docker compose -f "$COMPOSE_FILE" up -d; then
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
fi

# Wait for services to be ready
echo ""
echo "Waiting for services to be ready..."
sleep 10

# Check service health
echo ""
echo "Checking service health..."
if docker compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
    echo -e "${RED}❌ Some services are unhealthy${NC}"
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "Check logs with: docker compose -f $COMPOSE_FILE logs"
    exit 1
fi

# Show running services
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
docker compose -f "$COMPOSE_FILE" ps

# Determine access URL
ACCESS_PORT=${APP_PORT:-8080}
echo ""
echo -e "${GREEN}🌐 Access the application at: http://localhost:$ACCESS_PORT${NC}"
echo ""
echo "Useful commands:"
echo "  View logs:    docker compose -f $COMPOSE_FILE logs -f"
echo "  Stop:         docker compose -f $COMPOSE_FILE down"
echo "  Restart:      docker compose -f $COMPOSE_FILE restart"
echo "  Update:       git pull && $0 --$DEPLOYMENT_MODE"
echo ""
echo "Configuration:"
echo "  Environment:  $ENV_FILE"
echo "  Compose file: $COMPOSE_FILE"
echo "  Mode:         $DEPLOYMENT_MODE"
