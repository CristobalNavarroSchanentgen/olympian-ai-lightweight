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
LABEL description="Olympian AI Lightweight Backend - Subproject 3 with Stdio MCP Servers"

# Install curl and python for MCP servers (some may need python)
RUN apk add --no-cache curl python3 py3-pip make g++

# Copy package files - including shared package.json for proper workspace setup
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/server/package*.json ./packages/server/

# Install production dependencies for both workspaces
RUN npm install --production --workspace=packages/shared --workspace=packages/server

# Install MCP server packages globally for stdio subprocess execution
# These will be available via npx from the backend application
RUN echo "=== Installing MCP Server Packages for Stdio Transport ===" && \
    # GitHub MCP Server
    npm install -g @modelcontextprotocol/server-github@latest && \
    # NASA MCP Server 
    npm install -g @modelcontextprotocol/server-nasa@latest && \
    # Met Museum MCP Server
    npm install -g @modelcontextprotocol/server-metmuseum@latest && \
    # Context7 MCP Server
    npm install -g @modelcontextprotocol/server-context7@latest && \
    # AppleScript MCP Server
    npm install -g @modelcontextprotocol/server-applescript@latest && \
    # Web Search MCP Server
    npm install -g @modelcontextprotocol/server-websearch@latest && \
    echo "✓ MCP server packages installed successfully for stdio transport"

# Verify MCP packages are available via npx
RUN echo "=== Verifying MCP Package Availability ===" && \
    npx --yes @modelcontextprotocol/server-github --help > /dev/null 2>&1 && echo "✓ GitHub MCP server available" || echo "⚠️ GitHub MCP server not available" && \
    npx --yes @modelcontextprotocol/server-nasa --help > /dev/null 2>&1 && echo "✓ NASA MCP server available" || echo "⚠️ NASA MCP server not available" && \
    npx --yes @modelcontextprotocol/server-metmuseum --help > /dev/null 2>&1 && echo "✓ Met Museum MCP server available" || echo "⚠️ Met Museum MCP server not available" && \
    npx --yes @modelcontextprotocol/server-context7 --help > /dev/null 2>&1 && echo "✓ Context7 MCP server available" || echo "⚠️ Context7 MCP server not available" && \
    npx --yes @modelcontextprotocol/server-applescript --help > /dev/null 2>&1 && echo "✓ AppleScript MCP server available" || echo "⚠️ AppleScript MCP server not available" && \
    npx --yes @modelcontextprotocol/server-websearch --help > /dev/null 2>&1 && echo "✓ Web Search MCP server available" || echo "⚠️ Web Search MCP server not available"

# Copy built files from build stage
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Copy build info for debugging
COPY --from=builder /tmp/build_info /app/build_info.txt

# Create config directory
RUN mkdir -p /config/.olympian-ai-lite

# Verify deployment with enhanced checks including MCP packages
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
    echo "Global MCP packages:" && \
    npm list -g --depth=0 | grep -E "(server-github|server-nasa|server-metmuseum|server-context7|server-applescript|server-websearch)" || echo "MCP packages verification" && \
    echo "" && \
    echo "NPX binary location:" && \
    which npx && \
    echo "" && \
    echo "Build info:" && \
    cat /app/build_info.txt && \
    echo "" && \
    if [ -f packages/server/dist/index.js ]; then \
        echo "✓ Backend build confirmed for stdio MCP mode"; \
    else \
        echo "ERROR: Backend build missing!" && exit 1; \
    fi

# Environment configuration for subproject 3 (stdio MCP mode)
ENV NODE_ENV=production \
    PORT=4000 \
    # Subproject identification for stdio MCP mode
    SUBPROJECT=3 \
    # Deployment mode: docker-multi-host for subproject 3
    DEPLOYMENT_MODE=docker-multi-host \
    # MCP Configuration - stdio transport with child processes
    MCP_ENABLED=true \
    MCP_TRANSPORT=stdio \
    MCP_CONFIG_PATH=/app/mcp-config.stdio.json \
    # Service discovery
    SERVICE_DISCOVERY_ENABLED=true \
    SERVICE_DISCOVERY_NETWORK=bridge \
    # Multi-host defaults
    MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0 \
    OLLAMA_HOST=http://ollama-host:11434 \
    # Memory settings for stdio MCP servers
    NODE_OPTIONS="--max-old-space-size=4096"

EXPOSE 4000

# No health check - let the application start immediately
# Health can be monitored externally via /api/health endpoint if needed

CMD ["node", "packages/server/dist/index.js"]
