# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

# Install dependencies
RUN npm ci --workspace=packages/shared --workspace=packages/client

# Build shared package first
RUN npm run build:shared

# Build client with error handling
RUN npm run build:client || (echo "Client build failed" && exit 1)

# Verify build output exists
RUN ls -la /app/packages/client/dist || (echo "Build output not found!" && exit 1)

# Production stage - Frontend with Nginx
FROM nginx:alpine

# Install required tools for the entrypoint script
RUN apk add --no-cache curl

# Copy custom nginx configuration for frontend
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/conf.d/frontend.conf /etc/nginx/conf.d/frontend.conf
COPY docker/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf

# Copy and setup entrypoint script
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built frontend files
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Verify files were copied
RUN ls -la /usr/share/nginx/html && \
    if [ ! -f /usr/share/nginx/html/index.html ]; then \
        echo "ERROR: index.html not found in /usr/share/nginx/html"; \
        exit 1; \
    fi

# Create a simple health check
RUN echo '#!/bin/sh\ncurl -f http://localhost/health || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

# Add nginx user for better security (already exists in alpine)
# RUN addgroup -g 101 -S nginx \
#     && adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx

EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/healthcheck.sh"]

# Use the custom entrypoint
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
