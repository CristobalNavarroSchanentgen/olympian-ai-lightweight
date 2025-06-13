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
    
    # Create a temporary configuration file with environment variables substituted
    if [ -f /etc/nginx/conf.d/frontend.conf ]; then
        sed -i "s|server backend:4000;|server $BACKEND_HOST:$BACKEND_PORT;|g" /etc/nginx/conf.d/frontend.conf
    fi
    
    if [ -f /etc/nginx/conf.d/default.conf ]; then
        sed -i "s|server backend:4000;|server $BACKEND_HOST:$BACKEND_PORT;|g" /etc/nginx/conf.d/default.conf
    fi
}

# Remove any existing default nginx config that might interfere
if [ -f /etc/nginx/conf.d/nginx-default.conf ]; then
    rm /etc/nginx/conf.d/nginx-default.conf
    echo "Removed nginx-default.conf"
fi

# Select nginx configuration based on deployment mode
case "$DEPLOYMENT_MODE" in
    "same-host"|"same-host-existing-ollama"|"docker-same-host")
        echo "Using same-host deployment configuration"
        # For same-host modes, use frontend.conf
        if [ -f /etc/nginx/conf.d/default.conf ] && [ -f /etc/nginx/conf.d/frontend.conf ]; then
            rm /etc/nginx/conf.d/default.conf
            echo "Removed default.conf, using frontend.conf for same-host deployment"
        fi
        ;;
    *)
        echo "Using multi-host deployment configuration"
        # For multi-host, use default.conf
        if [ -f /etc/nginx/conf.d/frontend.conf ] && [ -f /etc/nginx/conf.d/default.conf ]; then
            rm /etc/nginx/conf.d/frontend.conf
            echo "Removed frontend.conf, using default.conf for multi-host deployment"
        fi
        ;;
esac

# Update configuration with environment variables
update_nginx_config

# List active configuration files
echo "Active nginx configuration files:"
ls -la /etc/nginx/conf.d/

# Show the active configuration
echo "Active nginx server configuration:"
cat /etc/nginx/conf.d/*.conf | grep -A5 "server {" | head -20

# Verify static files exist
echo "Checking static files:"
if [ -d /usr/share/nginx/html ]; then
    echo "Files in /usr/share/nginx/html:"
    ls -la /usr/share/nginx/html | head -10
    if [ -f /usr/share/nginx/html/index.html ]; then
        echo "✓ index.html found"
    else
        echo "✗ index.html NOT FOUND - Build may have failed!"
    fi
else
    echo "✗ /usr/share/nginx/html directory NOT FOUND!"
fi

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

echo "Nginx configuration completed successfully"

# Execute the original nginx command
exec "$@"
