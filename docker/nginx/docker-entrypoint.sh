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

# Test nginx configuration
echo "🔍 Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "✅ Nginx configuration test passed"
else
    echo "❌ Nginx configuration test failed"
    exit 1
fi

echo "🎉 Nginx configuration completed successfully"

# Execute the original command
exec "$@"
