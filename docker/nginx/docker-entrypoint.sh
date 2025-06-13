#!/bin/sh
set -e

echo "Starting Nginx configuration..."

# Default values
BACKEND_HOST=${BACKEND_HOST:-backend}
BACKEND_PORT=${BACKEND_PORT:-4000}
DEPLOYMENT_MODE=${DEPLOYMENT_MODE:-multi-host}

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

# Select nginx configuration based on deployment mode
if [ "$DEPLOYMENT_MODE" = "same-host" ]; then
    echo "Using same-host deployment configuration"
    # For same-host, remove the default.conf and use only frontend.conf
    if [ -f /etc/nginx/conf.d/default.conf ] && [ -f /etc/nginx/conf.d/frontend.conf ]; then
        rm /etc/nginx/conf.d/default.conf
        echo "Removed default.conf, using frontend.conf for same-host deployment"
    fi
else
    echo "Using multi-host deployment configuration"
    # For multi-host, remove frontend.conf and use only default.conf
    if [ -f /etc/nginx/conf.d/frontend.conf ] && [ -f /etc/nginx/conf.d/default.conf ]; then
        rm /etc/nginx/conf.d/frontend.conf
        echo "Removed frontend.conf, using default.conf for multi-host deployment"
    fi
fi

# Update configuration with environment variables
update_nginx_config

# Test nginx configuration
echo "Testing nginx configuration..."
nginx -t

echo "Nginx configuration completed successfully"

# Execute the original nginx command
exec "$@"
