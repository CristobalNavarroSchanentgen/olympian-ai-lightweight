#!/bin/bash
# Quick diagnostic script to check container state

echo "🔍 Checking olympian-ai-lightweight deployment..."
echo ""

# Check if containers are running
echo "📦 Container Status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep olympian || echo "No containers found"
echo ""

# Check frontend container logs
echo "📋 Frontend Container Logs (last 20 lines):"
docker logs olympian-frontend --tail 20 2>&1
echo ""

# Check what's actually in nginx html directory
echo "📁 Nginx HTML Directory Contents:"
docker exec olympian-frontend ls -la /usr/share/nginx/html/ 2>&1 || echo "Failed to access container"
echo ""

# Check if index.html is the built version
echo "📄 Index.html Verification:"
docker exec olympian-frontend head -5 /usr/share/nginx/html/index.html 2>&1 || echo "Failed to read index.html"
echo ""

# Check nginx process
echo "🔧 Nginx Process:"
docker exec olympian-frontend ps aux | grep nginx 2>&1 || echo "Failed to check process"
echo ""

# Try to curl from inside the container
echo "🌐 Internal Curl Test:"
docker exec olympian-frontend curl -s http://localhost/ | head -10 2>&1 || echo "Curl failed"
echo ""

# Check nginx error log
echo "❌ Nginx Error Log (if any):"
docker exec olympian-frontend cat /var/log/nginx/error.log 2>&1 || echo "No error log found"
