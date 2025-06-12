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

# Build client
RUN npm run build:client

# Production stage
FROM nginx:alpine
COPY docker/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=builder /app/packages/client/dist /usr/share/nginx/html
EXPOSE 80