#!/bin/bash
# Comprehensive diagnostic for chat functionality

echo "🔍 Diagnosing Olympian AI Chat Issues..."
echo "======================================"
echo ""

# 1. Check if all containers are healthy
echo "1️⃣ Container Health Check:"
echo "--------------------------"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep olympian
echo ""

# 2. Test backend health and Ollama connection
echo "2️⃣ Backend Health & Ollama Connection:"
echo "--------------------------------------"
echo "Backend health:"
curl -s http://localhost:8080/api/health | jq '.' || echo "Failed to reach backend"
echo ""
echo "Services status:"
curl -s http://localhost:8080/api/health/services | jq '.' || echo "Failed to get services"
echo ""

# 3. Check if Ollama is accessible from backend
echo "3️⃣ Testing Ollama Connection from Backend:"
echo "-----------------------------------------"
docker exec olympian-backend curl -s http://host.docker.internal:11434/api/tags | jq '.models[0]' 2>/dev/null || echo "Cannot reach Ollama from backend"
echo ""

# 4. Check available models
echo "4️⃣ Available Models:"
echo "-------------------"
curl -s http://localhost:8080/api/chat/models | jq '.' || echo "Failed to get models"
echo ""

# 5. Test chat endpoint directly
echo "5️⃣ Testing Chat Endpoint:"
echo "------------------------"
echo "Sending test message..."
curl -X POST http://localhost:8080/api/chat/send \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, this is a test",
    "conversationId": "test-conv-id",
    "model": "llama3.2:3b"
  }' -v 2>&1 | grep -E "(< HTTP|< |{|error)"
echo ""

# 6. Check backend logs for errors
echo "6️⃣ Recent Backend Errors:"
echo "------------------------"
docker logs olympian-backend --tail 20 2>&1 | grep -E "(error|Error|ERROR|failed|Failed)" || echo "No recent errors found"
echo ""

# 7. Check browser console
echo "7️⃣ Browser Console Check:"
echo "------------------------"
echo "Please check your browser console (F12) for any JavaScript errors"
echo "Look for:"
echo "  - Network errors (failed API calls)"
echo "  - WebSocket connection issues"
echo "  - JavaScript exceptions"
echo ""

# 8. Test WebSocket connection
echo "8️⃣ WebSocket Status:"
echo "-------------------"
echo "Check if WebSocket is connected in browser console:"
echo "- Look for 'Client connected' messages in backend logs"
echo "- Check Network tab for socket.io connection"
echo ""

# 9. Check Ollama on host
echo "9️⃣ Host Ollama Check:"
echo "--------------------"
echo "Testing Ollama on host machine:"
curl -s http://localhost:11434/api/tags | jq '.models[] | {name, size}' 2>/dev/null || echo "Ollama not accessible on host"
echo ""

# 10. Environment check
echo "🔟 Environment Configuration:"
echo "----------------------------"
docker exec olympian-backend printenv | grep -E "(OLLAMA|NODE_ENV|DEPLOYMENT)" || echo "Failed to get env"
