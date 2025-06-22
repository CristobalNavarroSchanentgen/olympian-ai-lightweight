#!/bin/sh
set -e

echo "🚀 Starting Nginx configuration..."

# Default values
BACKEND_HOST=${BACKEND_HOST:-backend}
BACKEND_PORT=${BACKEND_PORT:-4000}
DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-multi-host}

echo "⚙️  Configuration:"
echo "  DEPLOYMENT_MODE: $DEPLOYMENT_MODE"
echo "  BACKEND_HOST: $BACKEND_HOST"
echo "  BACKEND_PORT: $BACKEND_PORT"

# Update backend host/port in nginx.conf
echo "🔧 Updating backend configuration..."
sed -i "s|server backend:4000;|server $BACKEND_HOST:$BACKEND_PORT;|g" /etc/nginx/nginx.conf

# Create frontend configuration file for subproject 3
echo "🔧 Creating frontend configuration for subproject 3..."
cat > /usr/share/nginx/html/config.js << EOF
// Configuration for Olympian AI Lightweight
// This file is generated at runtime by the Docker entrypoint
window.OLYMPIAN_CONFIG = {
  DEPLOYMENT_MODE: '$DEPLOYMENT_MODE',
  BACKEND_HOST: '$BACKEND_HOST',
  BACKEND_PORT: '$BACKEND_PORT',
  TIMESTAMP: '$(date -u +"%Y-%m-%dT%H:%M:%SZ")'
};
console.log('Olympian AI Configuration loaded:', window.OLYMPIAN_CONFIG);
EOF

echo "✅ Configuration file created:"
cat /usr/share/nginx/html/config.js

# Verify static files exist
echo "📁 Verifying static files..."
if [ -f /usr/share/nginx/html/index.html ]; then
    echo "✅ index.html found"
    # Check if it's a built file (not source)
    if grep -q "src=\"/src/main.tsx\"" /usr/share/nginx/html/index.html; then
        echo "❌ ERROR: Source index.html detected instead of built version!"
        exit 1
    else
        echo "✅ Built index.html confirmed"
    fi
else
    echo "❌ ERROR: index.html NOT FOUND!"
    echo "📂 Contents of /usr/share/nginx/html:"
    ls -la /usr/share/nginx/html/
    exit 1
fi

# Inject configuration script into index.html
echo "🔧 Injecting configuration script into index.html..."
if [ -f /usr/share/nginx/html/index.html ]; then
    # Create a backup
    cp /usr/share/nginx/html/index.html /usr/share/nginx/html/index.html.backup
    
    # Insert the config script before the closing head tag
    sed -i 's|</head>|  <script src="/config.js"></script>\n</head>|' /usr/share/nginx/html/index.html
    
    echo "✅ Configuration script injected into index.html"
    echo "📄 Checking index.html for config script:"
    grep -A 2 -B 2 "config.js" /usr/share/nginx/html/index.html || echo "Config script not found in index.html"
fi

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration test passed"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

echo "🎉 Nginx configuration completed successfully for subproject 3 (multi-host deployment)"

# Execute the original command
exec "$@"
