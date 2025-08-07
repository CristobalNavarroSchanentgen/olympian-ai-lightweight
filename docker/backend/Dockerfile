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
LABEL description="Olympian AI Lightweight Backend - MCP Architecture with 3 Servers"

# Install system dependencies
# Note: No need to install MCP packages, npx will handle them on demand
RUN apk add --no-cache curl python3 py3-pip make g++

# Copy package files - including shared package.json for proper workspace setup
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

# Install production dependencies for both workspaces
RUN npm install --production --workspace=packages/shared --workspace=packages/server && \
    # Clear npm cache to reduce image size
    npm cache clean --force

# 🔧 CRITICAL: Configure npm for reliable package resolution and clean cache
# This fixes the zod dependency issues and TAR_ENTRY_ERROR problems
RUN echo "=== NPM Cache Cleanup & Configuration for MCP Servers ===" && \
    # Clear all npm caches completely
    npm cache clean --force && \
    rm -rf ~/.npm/_npx && \
    rm -rf /root/.npm/_npx && \
    rm -rf /tmp/npm-* && \
    # Set npm configuration for better reliability in Docker
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm config set prefer-online true && \
    npm config set prefer-offline false && \
    npm config set audit false && \
    npm config set fund false && \
    # Ensure proper npm permissions
    mkdir -p /root/.npm && \
    chmod -R 755 /root/.npm && \
    # Verify npm and npx are working
    npm --version && \
    npx --version && \
    echo "✓ NPM configuration optimized for reliable MCP server execution"

# Ensure npx is properly configured for on-demand package execution
RUN echo "=== MCP Configuration for Stdio Transport ===" && \
    echo "MCP servers will be executed using 'npx -y' for on-demand package resolution" && \
    echo "Supported MCP servers via npx:" && \
    echo "- Memory: npx -y @modelcontextprotocol/server-memory" && \
    echo "- Filesystem: npx -y @modelcontextprotocol/server-filesystem" && \
    echo "- GitHub: npx -y @modelcontextprotocol/server-github" && \
    echo "- Brave Search: npx -y @modelcontextprotocol/server-brave-search" && \
    echo "- Postgres: npx -y @modelcontextprotocol/server-postgres" && \
    echo "- Slack: npx -y @modelcontextprotocol/server-slack" && \
    echo "- And any other MCP server packages available via npm" && \
    echo "✓ MCP stdio transport configured for on-demand execution"

# Copy built files from build stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Copy build info for debugging
COPY --from=builder /tmp/build_info /app/build_info.txt

# Create config directory
RUN mkdir -p /config/.olympian-ai-lite

# 🔧 CRITICAL: Final npm cache verification and runtime optimization
RUN echo "=== Final NPM & MCP Runtime Verification ===" && \
    # Verify npm cache is clean
    npm cache verify && \
    # Pre-warm npx with a simple test (but don't install anything)
    echo "Testing npx functionality..." && \
    npx --help > /dev/null 2>&1 && \
    # Set runtime npm environment variables for optimal performance
    echo "export NPM_CONFIG_CACHE=/tmp/.npm" >> /etc/profile && \
    echo "export NPM_CONFIG_UPDATE_NOTIFIER=false" >> /etc/profile && \
    echo "export NPM_CONFIG_FUND=false" >> /etc/profile && \
    echo "export NPM_CONFIG_AUDIT=false" >> /etc/profile && \
    echo "✓ NPM runtime environment optimized for MCP servers"

# Verify deployment with enhanced checks
RUN echo "=== Final Backend Verification for Subproject 3 ===" && \
    echo "Build Date: ${BUILD_DATE}" && \
    echo "Git Commit: ${GIT_COMMIT}" && \
    echo "" && \
    echo "Built files:" && \
    ls -la packages/server/dist/ packages/shared/dist/ && \
    echo "" && \
    echo "Node modules structure:" && \
    ls -la node_modules/@olympian/ || echo "No @olympian scope found" && \
    echo "" && \
    echo "NPX binary location and version:" && \
    which npx && \
    npx --version && \
    echo "" && \
    echo "NPM cache status:" && \
    npm cache verify && \
    echo "" && \
    echo "Build info:" && \
    cat /app/build_info.txt && \
    echo "" && \
    if [ -f packages/server/dist/index.js ]; then \
        echo "✓ Backend build confirmed for stdio MCP mode with npx"; \
    else \
        echo "ERROR: Backend build missing!" && exit 1; \
    fi

# Environment configuration for subproject 3 (stdio MCP mode via npx)
ENV NODE_ENV=production \
    PORT=4000 \
    # Subproject identification for stdio MCP mode
    SUBPROJECT=3 \
    # Deployment mode: docker-multi-host for subproject 3
    DEPLOYMENT_MODE=docker-multi-host \
    # MCP Configuration - stdio transport with child processes via npx
    MCP_ENABLED=true \
    MCP_TRANSPORT=stdio \
    MCP_CONFIG_PATH=/app/mcp-config.multihost.json \
    # Service discovery
    SERVICE_DISCOVERY_ENABLED=true \
    SERVICE_DISCOVERY_NETWORK=bridge \
    # Multi-host defaults
    MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0 \
    OLLAMA_HOST=http://ollama-host:11434 \
    # 🔧 NPM Runtime Configuration for Clean MCP Server Execution
    NPM_CONFIG_CACHE=/tmp/.npm \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    # Memory settings for stdio MCP servers via npx subprocesses
    NODE_OPTIONS="--max-old-space-size=4096"

EXPOSE 4000

# No health check - let the application start immediately
# Health can be monitored externally via /api/health endpoint if needed

COPY docker/backend/startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh
CMD ["/app/startup.sh"]