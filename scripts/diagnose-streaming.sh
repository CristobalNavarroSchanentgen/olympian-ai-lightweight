#!/bin/bash

# Diagnostic script for WebSocket streaming issues in multi-host deployment
# This script helps identify where the disconnect is happening

echo "🔍 Diagnosing WebSocket Streaming Issues"
echo "========================================"

# Check if running in Docker
if [ -f /.dockerenv ]; then
    echo "✅ Running inside Docker container"
else
    echo "❌ Not running inside Docker container"
    echo "Please run this script inside the backend container:"
    echo "docker-compose exec backend bash scripts/diagnose-streaming.sh"
    exit 1
fi

echo ""
echo "📋 Checking environment variables..."
echo "DEPLOYMENT_MODE: ${DEPLOYMENT_MODE}"
echo "OLLAMA_HOST: ${OLLAMA_HOST}"
echo "NODE_ENV: ${NODE_ENV}"

echo ""
echo "🔌 Testing WebSocket connectivity..."

# Create a simple Node.js script to test WebSocket
cat > /tmp/test-websocket.js << 'EOF'
const io = require('socket.io-client');

const socket = io('http://localhost:4000', {
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    reconnection: false
});

let connected = false;

socket.on('connect', () => {
    console.log('✅ WebSocket connected successfully');
    console.log('Socket ID:', socket.id);
    connected = true;
    
    // Test sending a simple message
    socket.emit('ping');
});

socket.on('pong', () => {
    console.log('✅ Received pong response');
    socket.disconnect();
    process.exit(0);
});

socket.on('connect_error', (error) => {
    console.error('❌ WebSocket connection error:', error.message);
    process.exit(1);
});

socket.on('disconnect', (reason) => {
    console.log('🔌 Disconnected:', reason);
    if (!connected) {
        process.exit(1);
    }
});

// Timeout after 5 seconds
setTimeout(() => {
    console.error('❌ Connection timeout');
    process.exit(1);
}, 5000);
EOF

echo "Running WebSocket test..."
node /tmp/test-websocket.js

echo ""
echo "📊 Checking MongoDB connection..."
mongo mongodb://mongodb:27017/olympian_ai_lite --eval "db.stats()" > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ MongoDB connection successful"
else
    echo "❌ MongoDB connection failed"
fi

echo ""
echo "🔍 Analyzing common issues:"

# Check for memory issues
MEMORY_USAGE=$(ps aux | grep node | grep -v grep | awk '{print $4}' | head -1)
echo "Memory usage: ${MEMORY_USAGE}%"

# Check for port conflicts
netstat -tuln | grep 4000 > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Port 4000 is listening"
else
    echo "❌ Port 4000 is not listening"
fi

echo ""
echo "📝 Recommendations:"
echo "1. Check browser console for WebSocket errors"
echo "2. Verify nginx is properly configured for WebSocket upgrade"
echo "3. Check if any firewall rules are blocking WebSocket connections"
echo "4. Ensure the frontend is using the correct WebSocket URL"

echo ""
echo "🔗 To view real-time logs, run:"
echo "   docker-compose logs -f backend"
echo ""
echo "Diagnostic complete!"
