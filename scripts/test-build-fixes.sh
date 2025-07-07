#!/bin/bash

# Build test script for subproject 3 MCP fixes
echo "🔨 Testing TypeScript compilation for subproject 3..."

cd packages/shared
echo "📦 Building shared package..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Shared package build failed"
    exit 1
fi
echo "✅ Shared package built successfully"

cd ../server
echo "🖥️ Building server package..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Server package build failed"
    exit 1
fi
echo "✅ Server package built successfully"

cd ../client
echo "🌐 Building client package..."
npm run build
if [ $? -ne 0 ]; then
    echo "❌ Client package build failed"
    exit 1
fi
echo "✅ Client package built successfully"

echo ""
echo "🎉 All packages built successfully!"
echo "✅ TypeScript compilation errors have been resolved"
echo "🚀 Subproject 3 (multi-host deployment) is ready for deployment"
