#!/bin/bash

# Olympian AI Lightweight Setup Script

echo "🚀 Setting up Olympian AI Lightweight..."

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18+ is required. Current version: $(node -v)"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment file if it doesn't exist
if [ ! -f packages/server/.env ]; then
    echo "📄 Creating environment file..."
    cp packages/server/.env.example packages/server/.env
    echo "⚠️  Please update packages/server/.env with your configuration"
fi

# Check if MongoDB is running
if ! nc -z localhost 27017 2>/dev/null; then
    echo "⚠️  Warning: MongoDB doesn't appear to be running on localhost:27017"
    echo "   Please ensure MongoDB is installed and running"
fi

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Warning: Ollama is not installed"
    echo "   Please install Ollama from https://ollama.ai"
else
    # Check if Ollama is running
    if ! curl -s http://localhost:11434/api/version &> /dev/null; then
        echo "⚠️  Warning: Ollama is not running"
        echo "   Please start Ollama with: ollama serve"
    else
        echo "✅ Ollama is running"
    fi
fi

# Create config directory
echo "📁 Creating configuration directory..."
mkdir -p ~/.olympian-ai-lite/backups

echo ""
echo "✨ Setup complete!"
echo ""
echo "To start the application:"
echo "  npm run dev"
echo ""
echo "The application will be available at:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:4000"
echo ""