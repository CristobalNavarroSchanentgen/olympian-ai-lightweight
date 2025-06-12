#!/bin/bash

# Olympian AI Lightweight Docker Deployment Script
# Supports both same-host and multi-host deployments

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
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
    cp .env.docker "$ENV_FILE"
    echo -e "${YELLOW}📝 Please edit $ENV_FILE with your configuration${NC}"
    exit 1
fi

# Load environment
export $(cat "$ENV_FILE" | grep -v '^#' | xargs)

# Validate deployment mode
if [ "$DEPLOYMENT_MODE" = "multi-host" ]; then
    echo "Validating multi-host configuration..."
    
    # Check if required variables are set
    if [ -z "$MONGODB_URI" ] || [ -z "$OLLAMA_HOST" ]; then
        echo -e "${RED}❌ Missing required environment variables for multi-host deployment${NC}"
        echo "Please set MONGODB_URI and OLLAMA_HOST in $ENV_FILE"
        exit 1
    fi
    
    # Test MongoDB connection
    echo -n "Testing MongoDB connection... "
    if docker run --rm mongo:7 mongosh "$MONGODB_URI" --eval "db.adminCommand('ping')" &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${YELLOW}⚠️  Warning: Could not connect to MongoDB at $MONGODB_URI${NC}"
    fi
    
    # Test Ollama connection
    echo -n "Testing Ollama connection... "
    if curl -s "$OLLAMA_HOST/api/version" &> /dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        echo -e "${YELLOW}⚠️  Warning: Could not connect to Ollama at $OLLAMA_HOST${NC}"
    fi
fi

# Build images
echo ""
echo "Building Docker images..."
docker compose -f "$COMPOSE_FILE" build

# Start services
echo ""
echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# Wait for services to be ready
echo ""
echo "Waiting for services to be ready..."
sleep 5

# Check service health
echo ""
echo "Checking service health..."
if docker compose -f "$COMPOSE_FILE" ps | grep -q "unhealthy"; then
    echo -e "${RED}❌ Some services are unhealthy${NC}"
    docker compose -f "$COMPOSE_FILE" ps
    exit 1
fi

# Show running services
echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "Access the application at: http://localhost:${APP_PORT:-8080}"
echo ""
echo "Useful commands:"
echo "  View logs:    docker compose -f $COMPOSE_FILE logs -f"
echo "  Stop:         docker compose -f $COMPOSE_FILE down"
echo "  Restart:      docker compose -f $COMPOSE_FILE restart"
echo "  Update:       git pull && $0 --$DEPLOYMENT_MODE"