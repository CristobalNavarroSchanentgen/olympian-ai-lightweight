# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace files
COPY package*.json ./
COPY tsconfig.json ./
COPY packages/shared ./packages/shared
COPY packages/server ./packages/server

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=packages/server

# Build
RUN npm run build:shared
RUN npm run build:server

# Production stage
FROM node:20-alpine
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
COPY packages/server/package*.json ./packages/server/
RUN npm install --production --workspace=packages/server

# Copy built files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/server/dist ./packages/server/dist

# Create config directory
RUN mkdir -p /config/.olympian-ai-lite

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
    SERVICE_DISCOVERY_NETWORK=bridge

EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["node", "packages/server/dist/index.js"]