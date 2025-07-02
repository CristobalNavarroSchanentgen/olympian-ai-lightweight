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

# Copy package files first (for better caching when only deps change)
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=packages/server

# Copy configuration files
COPY tsconfig.json ./

# Cache bust point - this will invalidate cache when source files change
RUN echo "Build Date: ${BUILD_DATE}" > /tmp/build_info && \
    echo "Git Commit: ${GIT_COMMIT}" >> /tmp/build_info && \
    echo "Cache Bust: ${CACHE_BUST}" >> /tmp/build_info && \
    cat /tmp/build_info

# Copy source files (this layer will be rebuilt when source changes)
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Build with enhanced verification
RUN npm run build:shared && \
    npm run build:server && \
    echo "=== Backend Build Info ===" && \
    cat /tmp/build_info && \
    echo "=== Verifying build output ===" && \
    ls -la packages/server/dist/ packages/shared/dist/ && \
    echo "✓ Backend build completed successfully"

# Production stage
FROM node:20-alpine
WORKDIR /app

# Build arguments for production stage
ARG BUILD_DATE
ARG GIT_COMMIT

# Label the production image
LABEL build_date=${BUILD_DATE}
LABEL git_commit=${GIT_COMMIT}
LABEL description="Olympian AI Lightweight Backend with MCP Servers"

# Install curl for debugging (keeping for manual health checks if needed)
RUN apk add --no-cache curl

# Copy package files - including shared package.json for proper workspace setup
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

# Install production dependencies for both workspaces
RUN npm install --production --workspace=packages/shared --workspace=packages/server

# Install MCP server packages globally for stdio subprocess execution
# These will be available via npx from the backend application
RUN echo "=== Installing MCP Server Packages ===" && \
    npm install -g @modelcontextprotocol/server-github@latest && \
    npm install -g @programcomputer/nasa-mcp-server@latest && \
    npm install -g metmuseum-mcp@latest && \
    npm install -g @upstash/context7-mcp@latest && \
    npm install -g @sampullman/applescript-mcp@latest && \
    npm install -g @modelcontextprotocol/server-brave-search@latest && \
    echo "✓ MCP server packages installed successfully"

# Copy built files from build stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Copy build info for debugging
COPY --from=builder /tmp/build_info /app/build_info.txt

# Create config directory
RUN mkdir -p /config/.olympian-ai-lite

# Verify deployment with enhanced checks including MCP packages
RUN echo "=== Final Backend Verification ===" && \
    echo "Build Date: ${BUILD_DATE}" && \
    echo "Git Commit: ${GIT_COMMIT}" && \
    echo "" && \
    echo "Built files:" && \
    ls -la packages/server/dist/ packages/shared/dist/ && \
    echo "" && \
    echo "Node modules structure:" && \
    ls -la node_modules/@olympian/ || echo "No @olympian scope found" && \
    echo "" && \
    echo "Global MCP packages:" && \
    npm list -g --depth=0 | grep -E "(server-github|nasa-mcp|metmuseum|context7|applescript|brave-search)" || echo "MCP packages verification" && \
    echo "" && \
    echo "Build info:" && \
    cat /app/build_info.txt && \
    echo "" && \
    if [ -f packages/server/dist/index.js ]; then \
        echo "✓ Backend build confirmed"; \
    else \
        echo "ERROR: Backend build missing!" && exit 1; \
    fi

# Environment configuration for different deployment scenarios
# These can be overridden at runtime
ENV NODE_ENV=production \
    PORT=4000 \
    # Deployment mode: 'same-host' or 'multi-host'
    DEPLOYMENT_MODE=multi-host \
    # Same-host defaults (using Docker network names)
    MONGODB_URI_SAME_HOST=mongodb://olympian-mongodb:27017/olympian_ai_lite \
    OLLAMA_HOST_SAME_HOST=http://olympian-ollama:11434 \
    # Multi-host defaults (using IP addresses)
    MONGODB_URI=mongodb://mongo-host:27017/olympian_ai_lite \
    OLLAMA_HOST=http://ollama-host:11434 \
    # Service discovery
    SERVICE_DISCOVERY_ENABLED=true \
    SERVICE_DISCOVERY_NETWORK=bridge \
    # MCP Configuration - stdio transport with subprocesses
    MCP_ENABLED=true \
    MCP_TRANSPORT=stdio \
    MCP_CONFIG_PATH=/app/mcp-config.multihost.json

EXPOSE 4000

# No health check - let the application start immediately
# Health can be monitored externally via /api/health endpoint if needed

CMD ["node", "packages/server/dist/index.js"]
