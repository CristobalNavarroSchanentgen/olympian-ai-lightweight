# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy all package files first
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/client/package*.json ./packages/client/

# Install ALL dependencies (including dev dependencies needed for build)
RUN npm ci

# Now copy source files
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

# Build shared package first
RUN npm run build:shared

# Build client with verbose output for debugging
RUN npm run build:client || (echo "Client build failed" && ls -la packages/client && exit 1)

# Verify build output exists
RUN echo "Checking build output..." && \
    ls -la /app/packages/client && \
    ls -la /app/packages/client/dist || (echo "Build output not found!" && exit 1)

# Production stage - Frontend with Nginx
FROM nginx:alpine

# Install required tools for the entrypoint script
RUN apk add --no-cache curl

# Remove ALL default nginx configurations
RUN rm -rf /etc/nginx/conf.d/* && \
    rm -rf /etc/nginx/sites-enabled/* && \
    rm -rf /etc/nginx/sites-available/* && \
    rm -rf /usr/share/nginx/html/*

# Copy custom nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/conf.d/ /etc/nginx/conf.d/

# Copy and setup entrypoint script
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built frontend files
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Verify files were copied
RUN echo "Verifying deployed files..." && \
    ls -la /usr/share/nginx/html && \
    if [ ! -f /usr/share/nginx/html/index.html ]; then \
        echo "ERROR: index.html not found in /usr/share/nginx/html"; \
        exit 1; \
    fi && \
    echo "✓ Frontend files deployed successfully"

# Create a simple health check
RUN echo '#!/bin/sh\ncurl -f http://localhost/health || curl -f http://localhost/ || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/healthcheck.sh"]

# Use the custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
