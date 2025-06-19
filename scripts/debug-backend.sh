#!/bin/bash

# Backend Startup Debug Script
# Helps diagnose why the backend container is failing health checks

set -e

# Colors for output
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

echo -e "${CYAN}🔍 Backend Startup Debugging${RESET}"
echo ""

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo -e "${CYAN}📋 Configuration Check${RESET}"
echo "OLLAMA_HOST: ${OLLAMA_HOST}"
echo "MONGODB_URI: ${MONGODB_URI}"
echo ""

# Test external services accessibility
echo -e "${CYAN}🌐 Testing External Services${RESET}"

# Test Ollama connectivity
echo -e "${YELLOW}Testing Ollama at ${OLLAMA_HOST}...${RESET}"
if curl -sf "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Ollama accessible${RESET}"
else
    echo -e "${RED}❌ Ollama not accessible at ${OLLAMA_HOST}${RESET}"
    echo "Trying common ports..."
    
    # Extract hostname without port
    hostname=$(echo "${OLLAMA_HOST}" | sed 's|http://||' | sed 's|https://||' | cut -d':' -f1)
    
    for port in 11434 80 443; do
        echo -n "  Testing http://${hostname}:${port}... "
        if curl -sf "http://${hostname}:${port}/api/tags" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ Available${RESET}"
        else
            echo -e "${RED}❌ Not available${RESET}"
        fi
    done
fi
echo ""

# Check container status
echo -e "${CYAN}📊 Container Status${RESET}"
if docker ps -a | grep -q "olympian-backend"; then
    echo "Backend container exists:"
    docker ps -a | grep "olympian-backend"
    echo ""
    
    echo -e "${CYAN}📋 Backend Logs (last 20 lines)${RESET}"
    docker logs --tail=20 olympian-backend 2>&1 || echo "No logs available yet"
    echo ""
    
    echo -e "${CYAN}🔍 Backend Health Check${RESET}"
    if docker exec olympian-backend curl -f http://localhost:4000/api/health 2>/dev/null; then
        echo -e "${GREEN}✅ Backend health check passed${RESET}"
    else
        echo -e "${RED}❌ Backend health check failed${RESET}"
        echo "Trying to connect to backend manually..."
        docker exec olympian-backend curl -v http://localhost:4000/api/health 2>&1 || true
    fi
else
    echo -e "${RED}❌ Backend container not found${RESET}"
fi
echo ""

# Check MongoDB connectivity
echo -e "${CYAN}🗄️  MongoDB Connection${RESET}"
if docker ps | grep -q "olympian-mongodb"; then
    echo -e "${GREEN}✅ MongoDB container running${RESET}"
    if docker exec olympian-mongodb mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ MongoDB responding${RESET}"
    else
        echo -e "${RED}❌ MongoDB not responding${RESET}"
    fi
else
    echo -e "${RED}❌ MongoDB container not running${RESET}"
fi
echo ""

# Suggest fixes
echo -e "${CYAN}🔧 Suggested Actions${RESET}"
echo "1. Check backend logs: docker logs olympian-backend"
echo "2. Verify Ollama URL: curl -sf ${OLLAMA_HOST}/api/tags"
echo "3. Test backend manually: docker exec olympian-backend curl localhost:4000/api/health"
echo "4. Restart with clean build: make stop && make build-prod-clean && make up-prod"

# Check if we can provide a fix for the Ollama URL
if [ -n "${OLLAMA_HOST}" ]; then
    hostname=$(echo "${OLLAMA_HOST}" | sed 's|http://||' | sed 's|https://||' | cut -d':' -f1)
    if ! curl -sf "${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
        echo ""
        echo -e "${YELLOW}💡 Ollama URL Fix Suggestion${RESET}"
        echo "Your current OLLAMA_HOST might need a port. Try updating .env with:"
        for port in 11434 80; do
            if curl -sf "http://${hostname}:${port}/api/tags" >/dev/null 2>&1; then
                echo -e "${GREEN}OLLAMA_HOST=http://${hostname}:${port}${RESET}"
                break
            fi
        done
    fi
fi
