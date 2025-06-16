#!/bin/bash
# Script to fix MongoDB URI for Docker deployment

echo "🔧 Fixing MongoDB URI for Docker deployment..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    exit 1
fi

# Backup current .env
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Update MongoDB URI to use Docker service name
if grep -q "^MONGODB_URI=mongodb://localhost" .env; then
    sed -i.bak 's|^MONGODB_URI=mongodb://localhost:27017/|MONGODB_URI=mongodb://mongodb:27017/|' .env
    echo "✅ Updated MongoDB URI to use Docker service name"
else
    echo "ℹ️  MongoDB URI doesn't appear to be using localhost"
fi

echo ""
echo "📋 Current MongoDB configuration:"
grep "^MONGODB_URI=" .env

echo ""
echo "🎉 Done! Now restart your containers:"
echo "  make stop"
echo "  make up-prod"
