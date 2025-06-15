#!/bin/bash
# Quick test script to verify the build process locally

echo "🔍 Testing Vite build process..."
echo ""

# Navigate to client directory
cd packages/client

# Check if dist exists and remove it
if [ -d "dist" ]; then
    echo "📁 Removing old dist directory..."
    rm -rf dist
fi

# Run the build
echo "🔨 Running vite build..."
npm run build

echo ""
echo "📊 Build Results:"
echo "================"

# Check if dist was created
if [ -d "dist" ]; then
    echo "✅ dist directory created"
    echo ""
    echo "📁 Contents of dist:"
    ls -la dist/
    echo ""
    echo "📄 First 10 lines of index.html:"
    head -10 dist/index.html
    echo ""
    echo "📦 Assets directory:"
    ls -la dist/assets/ 2>/dev/null || echo "No assets directory found"
else
    echo "❌ dist directory NOT created - build failed!"
    echo ""
    echo "🔍 Checking for build errors in package.json..."
    cat package.json | grep -A 5 -B 5 "build"
fi
