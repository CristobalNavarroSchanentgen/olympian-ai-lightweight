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

# Copy root environment file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating environment file..."
    cp .env.example .env
    echo "⚠️  Please update .env with your configuration"
    echo "   For development: Set your JWT_SECRET and SESSION_SECRET"
    echo "   For Docker: Uncomment the appropriate deployment mode section"
fi

# Copy server environment file if it doesn't exist (for packages structure)
if [ ! -f packages/server/.env ]; then
    echo "📄 Creating server environment file..."
    cp .env packages/server/.env
    echo "   Server .env created from root configuration"
fi

# Check if MongoDB is running (only warn for development mode)
if ! nc -z localhost 27017 2>/dev/null; then
    echo "⚠️  Warning: MongoDB doesn't appear to be running on localhost:27017"
    echo "   For development: Please ensure MongoDB is installed and running"
    echo "   For Docker deployment: This is expected, services will run in containers"
fi

# Check if Ollama is installed
if ! command -v ollama &> /dev/null; then
    echo "⚠️  Warning: Ollama is not installed"
    echo "   For development: Please install Ollama from https://ollama.ai"
    echo "   For Docker deployment: This is expected, Ollama will run in a container"
else
    # Check if Ollama is running
    if ! curl -s http://localhost:11434/api/version &> /dev/null; then
        echo "⚠️  Warning: Ollama is not running"
        echo "   For development: Please start Ollama with: ollama serve"
        echo "   For Docker deployment: This is expected, Ollama will run in a container"
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
echo "Next steps:"
echo ""
echo "1. Edit .env file with your configuration:"
echo "   - For development: Set JWT_SECRET and SESSION_SECRET"
echo "   - For Docker same-host: Uncomment docker-same-host section"
echo "   - For Docker multi-host: Uncomment docker-multi-host section"
echo ""
echo "2. Choose your deployment method:"
echo "   Development:           npm run dev"
echo "   Docker (same-host):    make docker-same"
echo "   Docker (multi-host):   make docker-multi"
echo ""
echo "The application will be available at:"
echo "  Development - Frontend: http://localhost:3000"
echo "  Development - Backend:  http://localhost:4000"
echo "  Docker - Application:   http://localhost:8080 (or your APP_PORT)"
echo ""
