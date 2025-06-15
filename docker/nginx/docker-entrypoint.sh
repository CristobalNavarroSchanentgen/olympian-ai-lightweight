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

# Function to update nginx configuration with environment variables
update_nginx_config() {
    echo "Configuring nginx for $DEPLOYMENT_MODE deployment mode"
    echo "Backend URL: http://$BACKEND_HOST:$BACKEND_PORT"
    
    # Update backend host/port in all config files
    find /etc/nginx/conf.d -name "*.conf" -exec sed -i "s|server backend:4000;|server $BACKEND_HOST:$BACKEND_PORT;|g" {} \;
}

# Remove ALL potential default configurations first
echo "Cleaning up default nginx configurations..."
rm -f /etc/nginx/conf.d/nginx-default.conf
rm -f /etc/nginx/sites-enabled/default
rm -f /etc/nginx/sites-available/default
rm -f /usr/share/nginx/html/index.nginx-debian.html
rm -f /usr/share/nginx/html/50x.html

# Select nginx configuration based on deployment mode
case "$DEPLOYMENT_MODE" in
    "same-host"|"same-host-existing-ollama"|"docker-same-host")
        echo "Using same-host deployment configuration"
        # For same-host modes, use ONLY frontend.conf
        if [ -f /etc/nginx/conf.d/default.conf ]; then
            rm -f /etc/nginx/conf.d/default.conf
            echo "✓ Removed default.conf for same-host deployment"
        fi
        if [ ! -f /etc/nginx/conf.d/frontend.conf ]; then
            echo "✗ ERROR: frontend.conf not found!"
            exit 1
        fi
        ;;
    *)
        echo "Using multi-host deployment configuration"
        # For multi-host, use ONLY default.conf
        if [ -f /etc/nginx/conf.d/frontend.conf ]; then
            rm -f /etc/nginx/conf.d/frontend.conf
            echo "✓ Removed frontend.conf for multi-host deployment"
        fi
        if [ ! -f /etc/nginx/conf.d/default.conf ]; then
            echo "✗ ERROR: default.conf not found!"
            exit 1
        fi
        ;;
esac

# Update configuration with environment variables
update_nginx_config

# List active configuration files
echo ""
echo "Active nginx configuration files:"
ls -la /etc/nginx/conf.d/
echo ""

# Show the active configuration
echo "Active nginx server configuration:"
cat /etc/nginx/conf.d/*.conf
echo ""

# Verify static files exist
echo "Verifying static files..."
if [ -d /usr/share/nginx/html ]; then
    echo "Files in /usr/share/nginx/html:"
    ls -la /usr/share/nginx/html | head -20
    echo ""
    if [ -f /usr/share/nginx/html/index.html ]; then
        echo "✓ index.html found"
        echo "First 5 lines of index.html:"
        head -5 /usr/share/nginx/html/index.html
    else
        echo "✗ ERROR: index.html NOT FOUND!"
        echo "Build may have failed or files not copied correctly"
        exit 1
    fi
else
    echo "✗ ERROR: /usr/share/nginx/html directory NOT FOUND!"
    exit 1
fi

# Test nginx configuration
echo ""
echo "Testing nginx configuration..."
nginx -t

echo ""
echo "✓ Nginx configuration completed successfully"

# Execute the original nginx command
exec "$@"
