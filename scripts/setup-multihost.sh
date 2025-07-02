#!/bin/bash

# Olympian AI Lightweight Setup Script - Subproject 3 (Multi-host Self-Reliant)
# Enhanced setup with MCP authentication token configuration

set -e

echo "🚀 Setting up Olympian AI Lightweight - Subproject 3 (Multi-host Self-Reliant)..."
echo "📦 This setup includes integrated MCP servers for complete self-reliance"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to prompt for input with default value
prompt_with_default() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    local secure="$4"
    
    if [ "$secure" = "true" ]; then
        echo -e "${BLUE}${prompt}${NC}"
        echo -e "${YELLOW}(Press Enter for default: ${default})${NC}"
        read -s input
        echo
    else
        echo -e "${BLUE}${prompt}${NC}"
        echo -e "${YELLOW}(Press Enter for default: ${default})${NC}"
        read input
    fi
    
    if [ -z "$input" ]; then
        eval "${var_name}='${default}'"
    else
        eval "${var_name}='${input}'"
    fi
}

# Function to generate secure random string
generate_secret() {
    openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "$(date +%s)-$(shuf -i 1000-9999 -n 1)-secret-key"
}

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Error: Node.js 18+ is required. Current version: $(node -v)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js version: $(node -v)${NC}"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Error: Docker is required for subproject 3${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo -e "${RED}❌ Error: Docker Compose is required for subproject 3${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker and Docker Compose are available${NC}"

# Install dependencies
echo ""
echo -e "${BLUE}📦 Installing dependencies...${NC}"
npm install

# Create config directory
echo -e "${BLUE}📁 Creating configuration directory...${NC}"
mkdir -p ~/.olympian-ai-lite/backups

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}🔐 MCP SERVER AUTHENTICATION SETUP${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Subproject 3 includes integrated MCP servers that require authentication"
echo "for enhanced functionality. You can configure these tokens now or later."
echo ""

# GitHub Token Setup
echo -e "${YELLOW}🐙 GitHub MCP Server Configuration${NC}"
echo "The GitHub MCP server provides repository access, issue management, and PR capabilities."
echo "To get a token: https://github.com/settings/tokens"
echo "Required scopes: repo, read:user, read:org"
echo ""
prompt_with_default "Enter your GitHub Personal Access Token:" "skip" "GITHUB_TOKEN" "true"

# NASA API Key Setup
echo ""
echo -e "${YELLOW}🚀 NASA MCP Server Configuration${NC}"
echo "The NASA MCP server provides space data and APIs."
echo "Get a free API key: https://api.nasa.gov/"
echo "Note: DEMO_KEY provides limited functionality"
echo ""
prompt_with_default "Enter your NASA API Key:" "DEMO_KEY" "NASA_KEY" "false"

# Brave Search API Key Setup
echo ""
echo -e "${YELLOW}🔍 Web Search MCP Server Configuration${NC}"
echo "The Web Search MCP server provides search capabilities via Brave Search."
echo "Get a free API key: https://brave.com/search/api/"
echo "Note: Limited functionality without API key"
echo ""
prompt_with_default "Enter your Brave Search API Key:" "skip" "BRAVE_KEY" "true"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${BLUE}⚙️  APPLICATION CONFIGURATION${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Generate secure secrets
JWT_SECRET=$(generate_secret)
SESSION_SECRET=$(generate_secret)

echo -e "${GREEN}✅ Generated secure JWT and session secrets${NC}"

# Ollama configuration
echo ""
echo -e "${YELLOW}🤖 Ollama Configuration${NC}"
echo "Enter the Ollama host for your multi-host deployment."
echo "Examples:"
echo "  - http://192.168.1.10:11434 (local network)"
echo "  - http://ollama.example.com:11434 (domain name)"
echo ""
prompt_with_default "Enter Ollama host URL:" "http://192.168.1.10:11434" "OLLAMA_HOST" "false"

# MongoDB configuration
echo ""
echo -e "${YELLOW}🗄️  MongoDB Configuration${NC}"
echo "For subproject 3, you can use the integrated MongoDB container or external MongoDB."
echo "The integrated container is recommended for most setups."
echo ""
echo "Options:"
echo "1. Use integrated MongoDB container (recommended)"
echo "2. Use external MongoDB (requires replica set)"
echo ""
prompt_with_default "Choose option (1 or 2):" "1" "MONGO_OPTION" "false"

if [ "$MONGO_OPTION" = "2" ]; then
    echo ""
    echo "External MongoDB requires replica set configuration for transactions."
    echo "Example: mongodb://username:password@192.168.1.15:27017/olympian_ai_lite?replicaSet=rs0&authSource=admin"
    prompt_with_default "Enter MongoDB URI:" "mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0" "MONGODB_URI" "false"
else
    MONGODB_URI="mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0"
fi

# Application port
echo ""
prompt_with_default "Enter application port:" "8080" "APP_PORT" "false"

# Create .env file
echo ""
echo -e "${BLUE}📄 Creating environment configuration...${NC}"

cat > .env << EOF
# Olympian AI Lightweight Environment Configuration - Subproject 3
# Auto-generated by setup script on $(date)

# ===================================
# DEPLOYMENT MODE - SUBPROJECT 3
# ===================================
DEPLOYMENT_MODE=docker-multi-host
ENABLE_MULTI_HOST=true

# ===================================
# APPLICATION SETTINGS
# ===================================
PORT=4000
NODE_ENV=production
LOG_LEVEL=info
APP_PORT=${APP_PORT}

# ===================================
# DATABASE CONFIGURATION - REPLICA SET ENABLED
# ===================================
MONGODB_URI=${MONGODB_URI}

# ===================================
# OLLAMA CONFIGURATION
# ===================================
OLLAMA_HOST=${OLLAMA_HOST}

# ===================================
# MODEL CAPABILITY CONFIGURATION
# ===================================
MODEL_CAPABILITY_MODE=automatic

# ===================================
# MCP (Model Context Protocol) CONFIGURATION - SELF-RELIANT
# ===================================
MCP_ENABLED=true
MCP_OPTIONAL=true
MCP_TRANSPORT=http
MCP_CONFIG_PATH=/app/mcp-config.multihost.json

# ===================================
# MCP SERVER AUTHENTICATION
# ===================================
EOF

# Add GitHub token if provided
if [ "$GITHUB_TOKEN" != "skip" ]; then
    echo "GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}" >> .env
else
    echo "# GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here" >> .env
fi

# Add NASA API key
echo "NASA_API_KEY=${NASA_KEY}" >> .env

# Add Brave API key if provided
if [ "$BRAVE_KEY" != "skip" ]; then
    echo "BRAVE_API_KEY=${BRAVE_KEY}" >> .env
else
    echo "# BRAVE_API_KEY=your_brave_api_key_here" >> .env
fi

cat >> .env << EOF

# ===================================
# MCP SERVER ENDPOINTS - CONTAINER-BASED (SELF-RELIANT)
# ===================================
MCP_GITHUB_ENDPOINT=http://mcp-github:3001/mcp
MCP_NASA_ENDPOINT=http://mcp-nasa:3002/mcp
MCP_METMUSEUM_ENDPOINT=http://mcp-metmuseum:3003/mcp
MCP_CONTEXT7_ENDPOINT=http://mcp-context7:3004/mcp
MCP_APPLESCRIPT_ENDPOINT=http://mcp-applescript:3005/mcp
MCP_WEBSEARCH_ENDPOINT=http://mcp-websearch:3006/mcp

# ===================================
# REDIS CONFIGURATION
# ===================================
REDIS_URL=redis://redis:6379
REDIS_OPTIONAL=true

# ===================================
# SECURITY
# ===================================
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}

# ===================================
# CORS SETTINGS
# ===================================
ALLOWED_ORIGINS=http://localhost:${APP_PORT}

# ===================================
# SERVICE DISCOVERY
# ===================================
SERVICE_DISCOVERY_ENABLED=true
SERVICE_DISCOVERY_SUBNET=192.168.1.0/24
EOF

echo -e "${GREEN}✅ Environment configuration created successfully${NC}"

# Copy server environment file
if [ ! -f packages/server/.env ]; then
    echo -e "${BLUE}📄 Creating server environment file...${NC}"
    cp .env packages/server/.env
    echo -e "${GREEN}✅ Server .env created from root configuration${NC}"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo -e "${GREEN}✨ SETUP COMPLETE! ${NC}"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo -e "${BLUE}📋 CONFIGURATION SUMMARY:${NC}"
echo "  • Deployment Mode: Multi-host (Subproject 3)"
echo "  • MCP Servers: Self-reliant containers"
echo "  • Database: MongoDB with replica set support"
echo "  • Ollama Host: ${OLLAMA_HOST}"
echo "  • Application Port: ${APP_PORT}"

if [ "$GITHUB_TOKEN" != "skip" ]; then
    echo -e "  • GitHub Token: ${GREEN}✅ Configured${NC}"
else
    echo -e "  • GitHub Token: ${YELLOW}⚠️  Not configured${NC}"
fi

echo "  • NASA API Key: ${NASA_KEY}"

if [ "$BRAVE_KEY" != "skip" ]; then
    echo -e "  • Brave Search: ${GREEN}✅ Configured${NC}"
else
    echo -e "  • Brave Search: ${YELLOW}⚠️  Not configured${NC}"
fi

echo ""
echo -e "${BLUE}🚀 NEXT STEPS:${NC}"
echo ""
echo "1. Start the multi-host deployment:"
echo -e "   ${GREEN}make quick-docker-multi${NC}"
echo ""
echo "2. The application will be available at:"
echo -e "   ${GREEN}http://localhost:${APP_PORT}${NC}"
echo ""
echo "3. Monitor the deployment:"
echo -e "   ${YELLOW}docker compose -f docker-compose.prod.yml logs -f${NC}"
echo ""

if [ "$GITHUB_TOKEN" = "skip" ] || [ "$BRAVE_KEY" = "skip" ]; then
    echo -e "${YELLOW}⚠️  OPTIONAL TOKEN CONFIGURATION:${NC}"
    echo ""
    if [ "$GITHUB_TOKEN" = "skip" ]; then
        echo "To enable GitHub MCP features later:"
        echo "1. Get a token from: https://github.com/settings/tokens"
        echo "2. Add to .env: GITHUB_PERSONAL_ACCESS_TOKEN=your_token"
        echo "3. Restart: docker compose -f docker-compose.prod.yml restart backend"
        echo ""
    fi
    if [ "$BRAVE_KEY" = "skip" ]; then
        echo "To enable enhanced web search later:"
        echo "1. Get an API key from: https://brave.com/search/api/"
        echo "2. Add to .env: BRAVE_API_KEY=your_key"
        echo "3. Restart: docker compose -f docker-compose.prod.yml restart mcp-websearch"
        echo ""
    fi
fi

echo -e "${BLUE}📖 INTEGRATED MCP SERVICES:${NC}"
echo "  • GitHub: Repository access, issues, PRs"
echo "  • NASA: Space data and astronomy APIs"
echo "  • Met Museum: Art and cultural data"
echo "  • Context7: Documentation and code assistance"
echo "  • AppleScript: macOS automation (if applicable)"
echo "  • Web Search: Search capabilities"
echo ""
echo -e "${GREEN}🎉 Your self-reliant multi-host deployment is ready!${NC}"
echo ""

# Show additional help
echo -e "${BLUE}💡 HELPFUL COMMANDS:${NC}"
echo "  • View all services: docker compose -f docker-compose.prod.yml ps"
echo "  • Check MCP servers: docker compose -f docker-compose.prod.yml logs mcp-github"
echo "  • Scale services: docker compose -f docker-compose.prod.yml up --scale mcp-github=2"
echo "  • Update MCP server: docker compose -f docker-compose.prod.yml pull mcp-github && docker compose -f docker-compose.prod.yml up -d mcp-github"
echo ""
