#!/bin/bash

# Olympian AI Lightweight - Docker Troubleshooting Script

echo "🔍 Olympian AI Lightweight - Docker Troubleshooting"
echo "=================================================="
echo ""

# Check if containers are running
echo "1. Checking container status..."
docker ps --format "table {{.Names}}\t{{.Status}}" | grep olympian || echo "❌ No Olympian containers running"
echo ""

# Check frontend container logs
echo "2. Checking frontend container logs (last 20 lines)..."
FRONTEND_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "olympian-frontend|olympian-frontend-dev" | head -1)
if [ -n "$FRONTEND_CONTAINER" ]; then
    docker logs --tail 20 "$FRONTEND_CONTAINER"
else
    echo "❌ Frontend container not found"
fi
echo ""

# Check if nginx config is correct
echo "3. Checking nginx configuration..."
if [ -n "$FRONTEND_CONTAINER" ]; then
    echo "Active nginx config files:"
    docker exec "$FRONTEND_CONTAINER" ls -la /etc/nginx/conf.d/ 2>/dev/null || echo "❌ Cannot list nginx configs"
    echo ""
    echo "Testing nginx configuration:"
    docker exec "$FRONTEND_CONTAINER" nginx -t 2>&1 || echo "❌ Nginx config test failed"
else
    echo "❌ Frontend container not running"
fi
echo ""

# Check if frontend files exist
echo "4. Checking frontend files..."
if [ -n "$FRONTEND_CONTAINER" ]; then
    echo "Files in /usr/share/nginx/html:"
    docker exec "$FRONTEND_CONTAINER" ls -la /usr/share/nginx/html | head -10
    echo ""
    echo "Checking for index.html:"
    docker exec "$FRONTEND_CONTAINER" test -f /usr/share/nginx/html/index.html && echo "✅ index.html exists" || echo "❌ index.html NOT FOUND"
else
    echo "❌ Frontend container not running"
fi
echo ""

# Check backend connectivity
echo "5. Checking backend connectivity..."
if [ -n "$FRONTEND_CONTAINER" ]; then
    echo "Testing backend from frontend container:"
    docker exec "$FRONTEND_CONTAINER" wget -qO- http://backend:4000/api/health 2>/dev/null | jq '.' 2>/dev/null || echo "❌ Backend not accessible from frontend"
else
    echo "❌ Frontend container not running"
fi
echo ""

# Check backend logs
echo "6. Checking backend container logs (last 10 lines)..."
BACKEND_CONTAINER=$(docker ps --format "{{.Names}}" | grep -E "olympian-backend|olympian-backend-dev" | head -1)
if [ -n "$BACKEND_CONTAINER" ]; then
    docker logs --tail 10 "$BACKEND_CONTAINER"
else
    echo "❌ Backend container not found"
fi
echo ""

# Check environment variables
echo "7. Checking environment variables in frontend..."
if [ -n "$FRONTEND_CONTAINER" ]; then
    docker exec "$FRONTEND_CONTAINER" printenv | grep -E "(DEPLOYMENT_MODE|BACKEND_HOST|BACKEND_PORT)" || echo "❌ No relevant env vars found"
else
    echo "❌ Frontend container not running"
fi
echo ""

# Check network connectivity
echo "8. Checking Docker network..."
docker network inspect olympian-ai-lightweight_olympian-network 2>/dev/null | jq '.[] | {Name, Containers: .Containers | keys}' || echo "❌ Network not found"
echo ""

# Recommendations
echo "📋 Recommendations:"
echo "=================="
if [ -z "$FRONTEND_CONTAINER" ]; then
    echo "1. Frontend container is not running. Try:"
    echo "   make docker-down"
    echo "   make rebuild-all"
    echo "   make docker-same-existing"
else
    # Check if index.html exists
    if ! docker exec "$FRONTEND_CONTAINER" test -f /usr/share/nginx/html/index.html 2>/dev/null; then
        echo "1. Frontend files are missing. The build likely failed. Try:"
        echo "   make docker-down"
        echo "   make rebuild-frontend"
        echo "   make docker-same-existing"
    fi
fi

if [ -z "$BACKEND_CONTAINER" ]; then
    echo "2. Backend container is not running. Check logs with:"
    echo "   docker logs olympian-backend"
fi

echo ""
echo "For a complete rebuild, run:"
echo "   make docker-down"
echo "   make rebuild-all"
echo "   make docker-same-existing"
echo ""
echo "To view live logs:"
echo "   make logs-same-existing"
