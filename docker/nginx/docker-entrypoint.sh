#!/bin/sh
set -e

# Select nginx configuration based on deployment mode
if [ "$DEPLOYMENT_MODE" = "same-host" ]; then
    echo "Using same-host deployment configuration"
    # You can add specific same-host configurations here if needed
else
    echo "Using multi-host deployment configuration"
fi

# Execute the original nginx command
exec "$@"