# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/client/package*.json ./packages/client/

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

# Build shared package first
RUN npm run build:shared

# Build client - this should create packages/client/dist
RUN cd packages/client && npm run build

# Verify the build output
RUN echo "=== Checking client dist ===" && \
    ls -la packages/client/dist/ && \
    echo "=== Checking index.html ===" && \
    cat packages/client/dist/index.html | head -20

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Clear all default nginx content
RUN rm -rf /etc/nginx/conf.d/* && \
    rm -rf /etc/nginx/sites-enabled/* && \
    rm -rf /etc/nginx/sites-available/* && \
    rm -rf /usr/share/nginx/html/*

# Copy nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY docker/nginx/conf.d/ /etc/nginx/conf.d/

# Copy entrypoint
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# IMPORTANT: Copy from the correct dist directory
COPY --from=builder /app/packages/client/dist/* /usr/share/nginx/html/
COPY --from=builder /app/packages/client/dist/assets /usr/share/nginx/html/assets

# Verify files
RUN echo "=== Final nginx content ===" && \
    ls -la /usr/share/nginx/html/ && \
    echo "=== Index.html content ===" && \
    cat /usr/share/nginx/html/index.html | head -20

# Health check
RUN echo '#!/bin/sh\ncurl -f http://localhost/ || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
