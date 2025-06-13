# Nginx Configuration Guide

## Overview

The Olympian AI Lightweight project includes automatic nginx configuration that handles routing between the frontend and backend services. This guide explains how the automatic configuration works and how to customize it if needed.

## Automatic Configuration

### How It Works

The nginx configuration is automatically set up when you start the application using Docker Compose. The system:

1. **Detects the deployment mode** from environment variables
2. **Configures the appropriate nginx settings** based on the deployment mode
3. **Updates backend URLs dynamically** using environment variables
4. **Tests the configuration** before starting nginx

### Environment Variables

The following environment variables control the nginx configuration:

- `DEPLOYMENT_MODE`: Determines which configuration to use (`same-host` or `multi-host`)
- `BACKEND_HOST`: The hostname of the backend service (default: `backend`)
- `BACKEND_PORT`: The port of the backend service (default: `4000`)

### Deployment Modes

#### Same-Host Mode
In same-host mode, all services run on the same machine:
- Uses `frontend.conf` configuration
- Backend is accessible at `http://backend:4000`
- Frontend serves on port 80 (mapped to `APP_PORT` on host)

#### Multi-Host Mode
In multi-host mode, services can run on different machines:
- Uses `default.conf` configuration
- Supports custom backend URLs
- Includes additional proxy headers for distributed setup

## Configuration Files

### `/docker/nginx/nginx.conf`
Main nginx configuration with:
- Worker processes and connections
- MIME types and logging
- Gzip compression settings
- Include directive for deployment-specific configs

### `/docker/nginx/conf.d/default.conf`
Configuration for multi-host deployments:
- Proxy settings for `/api` and `/socket.io` endpoints
- Security headers
- Timeout configurations

### `/docker/nginx/conf.d/frontend.conf`
Configuration for same-host deployments:
- Static file serving from `/usr/share/nginx/html`
- API and WebSocket proxying
- Cache control for static assets
- Health check endpoint

### `/docker/nginx/docker-entrypoint.sh`
Startup script that:
- Reads environment variables
- Selects appropriate configuration
- Updates backend URLs dynamically
- Tests configuration before starting

## Usage

### Basic Usage
```bash
# Development
docker-compose up

# Production
docker-compose -f docker-compose.prod.yml up

# Same-host deployment
docker-compose -f docker-compose.same-host.yml up
```

### Custom Backend URL
```bash
# Set custom backend host and port
BACKEND_HOST=my-backend-server BACKEND_PORT=5000 docker-compose up
```

### Custom App Port
```bash
# Change the exposed port (default: 8080 for production, 3000 for dev)
APP_PORT=3000 docker-compose -f docker-compose.prod.yml up
```

## Troubleshooting

### Check Nginx Logs
```bash
# View nginx error logs
docker logs olympian-frontend

# Follow logs in real-time
docker logs -f olympian-frontend
```

### Test Configuration
The entrypoint script automatically tests the configuration. If there's an error, check:
1. Environment variables are set correctly
2. Backend service is running
3. Network connectivity between containers

### Common Issues

1. **502 Bad Gateway**: Backend service is not accessible
   - Check if backend container is running
   - Verify `BACKEND_HOST` and `BACKEND_PORT` are correct

2. **Configuration Test Failed**: Syntax error in nginx config
   - Check the logs for specific error
   - Verify environment variable substitution

3. **Frontend Not Loading**: Static files not found
   - Ensure the build completed successfully
   - Check if files exist in `/usr/share/nginx/html`

## Customization

To customize the nginx configuration:

1. Modify the appropriate config file in `/docker/nginx/conf.d/`
2. Update the `docker-entrypoint.sh` if new environment variables are needed
3. Rebuild the container: `docker-compose build frontend`

## Health Checks

The nginx container includes a health check endpoint at `/health` that returns a simple "healthy" response. This is used by Docker to monitor container health.

## Security Considerations

The nginx configuration includes several security headers:
- `X-Frame-Options`: Prevents clickjacking
- `X-Content-Type-Options`: Prevents MIME sniffing
- `X-XSS-Protection`: Enables XSS filtering

For production deployments, consider adding:
- SSL/TLS configuration
- Rate limiting
- Additional security headers
- IP whitelisting if needed
