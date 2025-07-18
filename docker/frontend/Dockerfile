# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Build arguments for cache busting
ARG BUILD_DATE
ARG GIT_COMMIT
ARG CACHE_BUST

# Label the image with build info
LABEL build_date=${BUILD_DATE}
LABEL git_commit=${GIT_COMMIT}

# Configure npm for better reliability, use faster mirror and disable optional deps
RUN npm config set fetch-timeout 600000 &&     npm config set fetch-retry-mintimeout 20000 &&     npm config set fetch-retry-maxtimeout 120000 &&     npm config set fetch-retries 5 &&     npm config set registry https://registry.npmjs.org/ &&     npm config set progress false

# Yarn is already included in node:20-alpine
RUN yarn config set network-timeout 600000
# Yarn is already included in node:20-alpine
RUN yarn config set network-timeout 600000

# Copy package files first (for better caching when only deps change)
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/client/package*.json ./packages/client/

# Install dependencies with better cross-platform support
RUN npm ci --no-audit --no-fund || \
    (echo "Clearing cache and retrying..." && rm -rf node_modules package-lock.json && \
     npm install --no-audit --no-fund)

# Install platform-specific rollup binaries for cross-platform builds
RUN npm install --no-save @rollup/rollup-linux-arm64-musl @rollup/rollup-linux-x64-musl || true
RUN npm rebuild || true
# Copy configuration files
COPY tsconfig.json ./

# Cache bust point - this will invalidate cache when source files change
RUN echo "Build Date: ${BUILD_DATE}" > /tmp/build_info &&     echo "Git Commit: ${GIT_COMMIT}" >> /tmp/build_info &&     echo "Cache Bust: ${CACHE_BUST}" >> /tmp/build_info

# Copy source files (this layer will be rebuilt when source changes)
COPY packages/shared ./packages/shared
COPY packages/client ./packages/client

# Build shared package first
RUN npm run build:shared

# Build client
RUN npm run build:client

# Production stage  
FROM nginx:alpine

# Install curl and other utilities for health checks and debugging
RUN apk add --no-cache curl grep

# Build arguments for production stage
ARG BUILD_DATE
ARG GIT_COMMIT

# Label the production image
LABEL build_date=${BUILD_DATE}
LABEL git_commit=${GIT_COMMIT}
LABEL description="Olympian AI Lightweight Frontend"

# Remove ALL default nginx files and configurations
RUN rm -rf /etc/nginx/conf.d/* &&     rm -rf /etc/nginx/sites-enabled/* &&     rm -rf /etc/nginx/sites-available/* &&     rm -rf /usr/share/nginx/html/* &&     rm -rf /var/www/html/* &&     rm -f /etc/nginx/nginx.conf

# Copy our custom nginx configuration
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint script
COPY docker/nginx/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built frontend files from the correct location
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html

# Copy build info for debugging
COPY --from=builder /tmp/build_info /usr/share/nginx/html/build_info.txt

# Verify deployment
RUN echo "=== Final verification ===" &&     ls -la /usr/share/nginx/html/ &&     if [ -f /usr/share/nginx/html/index.html ]; then         echo "✓ Built index.html confirmed";     else         echo "ERROR: index.html missing!" && exit 1;     fi

# Health check
RUN printf "#!/bin/sh\ncurl -sf http://localhost/ || exit 1" > /healthcheck.sh && chmod +x /healthcheck.sh
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD ["/healthcheck.sh"]

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
