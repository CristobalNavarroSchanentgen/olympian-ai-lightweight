#!/bin/sh
set -e

echo "Starting Nginx configuration..."

# Default values
BACKEND_HOST=${BACKEND_HOST:-backend}
BACKEND_PORT=${BACKEND_PORT:-4000}
DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-multi-host}

echo "Configuration:"
echo "  DEPLOYMENT_MODE: $DEPLOYMENT_MODE"
echo "  BACKEND_HOST: $BACKEND_HOST"
echo "  BACKEND_PORT: $BACKEND_PORT"

# Remove ALL potential default configurations
echo "Cleaning up configurations..."
rm -f /etc/nginx/conf.d/default.conf.bak
rm -f /etc/nginx/conf.d/frontend.conf.bak
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default

# For same-host modes, remove frontend.conf and use default.conf
case "$DEPLOYMENT_MODE" in
    "same-host"|"same-host-existing-ollama"|"docker-same-host")
        echo "Configuring for same-host deployment..."
        if [ -f /etc/nginx/conf.d/frontend.conf ]; then
            rm -f /etc/nginx/conf.d/frontend.conf
        fi
        ;;
    *)
        echo "Configuring for multi-host deployment..."
        if [ -f /etc/nginx/conf.d/frontend.conf ]; then
            rm -f /etc/nginx/conf.d/frontend.conf
        fi
        ;;
esac

# Update backend host/port in remaining config
find /etc/nginx/conf.d -name "*.conf" -exec sed -i "s|server backend:4000;|server $BACKEND_HOST:$BACKEND_PORT;|g" {} \;

# Show active configuration
echo ""
echo "Active nginx configuration files:"
ls -la /etc/nginx/conf.d/
echo ""

# Verify static files
echo "Verifying static files..."
if [ -f /usr/share/nginx/html/index.html ]; then
    echo "✓ index.html found"
else
    echo "✗ ERROR: index.html NOT FOUND!"
    exit 1
fi

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

echo "✓ Nginx configuration completed successfully"

# Execute the original command
exec "$@"
