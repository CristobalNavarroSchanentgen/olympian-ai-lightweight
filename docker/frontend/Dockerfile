# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/client/package*.json ./packages/client/

# Install dependencies
RUN npm install

# Copy source files
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

# Build shared package first
RUN npm run build:shared

# Build client and verify output
RUN npm run build:client && \
    echo "=== Verifying build output ===" && \
    ls -la packages/client/dist/ && \
    echo "=== Content of built index.html ===" && \
    head -5 packages/client/dist/index.html

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Remove ALL default nginx files and configurations
RUN rm -rf /etc/nginx/conf.d/* && \
    rm -rf /etc/nginx/sites-enabled/* && \
    rm -rf /etc/nginx/sites-available/* && \
    rm -rf /usr/share/nginx/html/* && \
    rm -rf /var/www/html/* && \
    rm -f /etc/nginx/nginx.conf

# Copy our custom nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built frontend files from the correct location
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Verify deployment
RUN echo "=== Final verification ===" && \
    echo "Nginx config:" && \
    head -10 /etc/nginx/nginx.conf && \
    echo "" && \
    echo "Static files:" && \
    ls -la /usr/share/nginx/html/ && \
    echo "" && \
    echo "Index.html check:" && \
    if [ -f /usr/share/nginx/html/index.html ]; then \
        if grep -q "src=\"/src/main.tsx\"" /usr/share/nginx/html/index.html; then \
            echo "ERROR: Source index.html detected!" && exit 1; \
        else \
            echo "✓ Built index.html confirmed"; \
        fi; \
    else \
        echo "ERROR: index.html missing!" && exit 1; \
    fi

# Health check
RUN echo '#!/bin/sh\ncurl -sf http://localhost/ || exit 1' > /healthcheck.sh && chmod +x /healthcheck.sh

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/healthcheck.sh"]

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
