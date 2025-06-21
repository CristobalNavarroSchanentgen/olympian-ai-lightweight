#!/bin/bash

# Script to rebuild and verify streaming fix for subproject 3
# This ensures the latest code changes are compiled and deployed

echo "🔧 Olympian AI Lightweight - Streaming Fix Rebuild Script"
echo "======================================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if we're in the right directory
if [ ! -f "Makefile" ] || [ ! -d "packages" ]; then
    echo -e "${RED}❌ Error: This script must be run from the project root directory${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Step 1: Checking current deployment...${NC}"
if docker ps | grep -q "olympian-frontend"; then
    echo -e "${GREEN}✓ Frontend container is running${NC}"
else
    echo -e "${RED}✗ Frontend container is not running${NC}"
fi

if docker ps | grep -q "olympian-backend"; then
    echo -e "${GREEN}✓ Backend container is running${NC}"
else
    echo -e "${RED}✗ Backend container is not running${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 2: Verifying source code changes...${NC}"

# Check if the fixes are in place
echo "Checking DivineDialog component..."
if grep -q "accumulatedContentRef" packages/client/src/components/DivineDialog/index.tsx; then
    echo -e "${GREEN}✓ DivineDialog streaming fix is present${NC}"
else
    echo -e "${RED}✗ DivineDialog streaming fix is missing${NC}"
fi

echo "Checking MessageList component..."
if grep -q "ReactMarkdown" packages/client/src/components/DivineDialog/MessageList.tsx && ! grep -q "TypewriterText" packages/client/src/components/DivineDialog/MessageList.tsx; then
    echo -e "${GREEN}✓ MessageList streaming fix is present${NC}"
else
    echo -e "${RED}✗ MessageList streaming fix is missing${NC}"
fi

echo ""
echo -e "${YELLOW}📋 Step 3: Creating cache bust token...${NC}"
CACHE_BUST=$(date +%s)
export CACHE_BUST
echo "Cache bust token: $CACHE_BUST"

echo ""
echo -e "${YELLOW}📋 Step 4: Stopping current containers...${NC}"
make stop

echo ""
echo -e "${YELLOW}📋 Step 5: Building with cache invalidation...${NC}"
echo "This will ensure all changes are compiled into the Docker image"

# Build with no-cache to ensure fresh build
docker-compose -f docker-compose.prod.yml build --no-cache frontend

echo ""
echo -e "${YELLOW}📋 Step 6: Starting updated containers...${NC}"
make up-prod

echo ""
echo -e "${YELLOW}📋 Step 7: Verifying deployment...${NC}"
sleep 5

# Check if containers are running
if docker ps | grep -q "olympian-frontend" && docker ps | grep -q "olympian-backend"; then
    echo -e "${GREEN}✓ All containers are running${NC}"
    
    # Check build info
    echo ""
    echo "Checking build info..."
    docker exec olympian-frontend cat /usr/share/nginx/html/build_info.txt || echo "Build info not found"
    
    echo ""
    echo -e "${GREEN}✅ Rebuild complete!${NC}"
    echo ""
    echo "🌐 Access the application at: http://localhost:8080"
    echo ""
    echo -e "${YELLOW}📝 Test the fix:${NC}"
    echo "1. Select a base model (llama3.2:3b or phi4:14b)"
    echo "2. Send a message"
    echo "3. You should see tokens appearing in real-time without any flash"
    echo ""
    echo -e "${YELLOW}💡 If the issue persists:${NC}"
    echo "1. Clear your browser cache (Ctrl+Shift+R or Cmd+Shift+R)"
    echo "2. Try in an incognito/private window"
    echo "3. Check browser console for any errors"
else
    echo -e "${RED}❌ Error: Containers failed to start${NC}"
    echo "Check logs with: make logs-backend or make logs-frontend"
fi

echo ""
echo "📋 Additional debugging commands:"
echo "- View frontend logs: make logs-frontend"
echo "- View backend logs: make logs-backend"
echo "- Check container status: make status"
echo "- Full diagnostics: make diagnose"
