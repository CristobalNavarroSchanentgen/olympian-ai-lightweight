# Olympian AI Lightweight Makefile
# Simplifies common development and deployment tasks

.PHONY: help install dev build test lint format clean docker-build docker-dev docker-prod-same docker-prod-multi setup env-dev env-docker-same env-docker-same-existing env-docker-multi nginx-test

# Default target
help:
	@echo "Olympian AI Lightweight - Available commands:"
	@echo ""
	@echo "Setup & Environment:"
	@echo "  make setup                  Run initial setup"
	@echo "  make env-dev                Configure .env for development (auto-generates secrets)"
	@echo "  make env-docker-same        Configure .env for Docker same-host with Ollama container (auto-generates secrets)"
	@echo "  make env-docker-same-existing Configure .env for Docker same-host with existing host Ollama (auto-generates secrets)"
	@echo "  make env-docker-multi       Configure .env for Docker multi-host (auto-generates secrets)"
	@echo ""
	@echo "Development:"
	@echo "  make install                Install dependencies"
	@echo "  make dev                    Start development servers"
	@echo "  make build                  Build all packages"
	@echo "  make test                   Run tests"
	@echo "  make lint                   Run linter"
	@echo "  make format                 Format code"
	@echo "  make clean                  Clean build artifacts"
	@echo ""
	@echo "Docker Deployment:"
	@echo "  make docker-dev             Run development environment in Docker"
	@echo "  make docker-same            Deploy production (same-host with Ollama container)"
	@echo "  make docker-same-existing   Deploy production (same-host with existing host Ollama)"
	@echo "  make docker-multi           Deploy production (multi-host)"
	@echo "  make docker-build           Build Docker images only"
	@echo "  make docker-down            Stop all Docker containers"
	@echo "  make docker-restart         Restart all Docker containers"
	@echo "  make nginx-test             Test nginx configuration"
	@echo ""
	@echo "Quick Commands:"
	@echo "  make quick-dev              Quick development setup"
	@echo "  make quick-docker-same      Quick Docker same-host deployment"
	@echo "  make quick-docker-same-existing Quick Docker with existing Ollama"
	@echo ""

# Development commands
install:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

lint:
	npm run lint

format:
	npm run format

clean:
	rm -rf dist build node_modules packages/*/dist packages/*/build packages/*/node_modules

# Docker commands with nginx configuration
docker-build:
	@echo "🔨 Building Docker images..."
	docker compose -f docker-compose.prod.yml build

docker-dev:
	@echo "🚀 Starting development environment with automatic nginx configuration..."
	@export DEPLOYMENT_MODE=same-host && \
	export BACKEND_HOST=backend && \
	export BACKEND_PORT=4000 && \
	docker compose down && \
	docker compose up -d
	@echo "✅ Development environment started!"
	@echo "📍 Frontend: http://localhost:3000"
	@echo "📍 Backend: http://localhost:4000"
	@echo "📊 Run 'make logs-dev' to view logs"

docker-same:
	@echo "🚀 Deploying same-host configuration with Ollama container..."
	@export DEPLOYMENT_MODE=same-host && \
	export BACKEND_HOST=backend && \
	export BACKEND_PORT=4000 && \
	export APP_PORT=$${APP_PORT:-8080} && \
	docker compose -f docker-compose.same-host.yml down && \
	docker compose -f docker-compose.same-host.yml build --no-cache && \
	docker compose -f docker-compose.same-host.yml up -d
	@echo "✅ Same-host deployment complete!"
	@echo "📍 Access at: http://localhost:$${APP_PORT:-8080}"
	@echo "📊 Run 'make logs-same' to view logs"

docker-same-existing:
	@echo "🚀 Deploying with existing host Ollama service..."
	@export DEPLOYMENT_MODE=same-host-existing-ollama && \
	export BACKEND_HOST=backend && \
	export BACKEND_PORT=4000 && \
	export APP_PORT=$${APP_PORT:-8080} && \
	docker compose -f docker-compose.same-host-existing-ollama.yml down && \
	docker compose -f docker-compose.same-host-existing-ollama.yml build --no-cache && \
	docker compose -f docker-compose.same-host-existing-ollama.yml up -d
	@echo "✅ Deployment complete!"
	@echo "📍 Access at: http://localhost:$${APP_PORT:-8080}"
	@echo "ℹ️  Using Ollama service running on host at localhost:11434"
	@echo "📊 Run 'make logs-same-existing' to view logs"

docker-multi:
	@echo "🚀 Deploying multi-host configuration..."
	@export DEPLOYMENT_MODE=multi-host && \
	export BACKEND_HOST=$${BACKEND_HOST:-backend} && \
	export BACKEND_PORT=$${BACKEND_PORT:-4000} && \
	export APP_PORT=$${APP_PORT:-8080} && \
	docker compose -f docker-compose.prod.yml down && \
	docker compose -f docker-compose.prod.yml build --no-cache && \
	docker compose -f docker-compose.prod.yml up -d
	@echo "✅ Multi-host deployment complete!"
	@echo "📍 Access at: http://localhost:$${APP_PORT:-8080}"
	@echo "⚠️  Ensure MongoDB and Ollama hosts are configured in .env"
	@echo "📊 Run 'make logs-prod' to view logs"

# Docker management commands
docker-down:
	@echo "🛑 Stopping all containers..."
	@docker compose down 2>/dev/null || true
	@docker compose -f docker-compose.prod.yml down 2>/dev/null || true
	@docker compose -f docker-compose.same-host.yml down 2>/dev/null || true
	@docker compose -f docker-compose.same-host-existing-ollama.yml down 2>/dev/null || true
	@echo "✅ All containers stopped"

docker-restart:
	@echo "🔄 Restarting containers..."
	@make docker-down
	@if [ -f docker-compose.override.yml ]; then \
		make docker-dev; \
	elif docker ps | grep -q olympian-frontend; then \
		COMPOSE_FILE=$$(docker ps --format "table {{.Names}}" | grep -q olympian-ollama && echo "docker-compose.same-host.yml" || echo "docker-compose.same-host-existing-ollama.yml"); \
		docker compose -f $$COMPOSE_FILE restart; \
	else \
		echo "No running containers found. Use 'make docker-dev' or 'make docker-same' to start."; \
	fi

# Nginx specific commands
nginx-test:
	@echo "🔍 Testing nginx configuration..."
	@if docker ps | grep -q olympian-frontend; then \
		docker exec olympian-frontend nginx -t || docker exec olympian-frontend-dev nginx -t; \
	else \
		echo "❌ Frontend container not running. Start it first with 'make docker-dev' or similar."; \
		exit 1; \
	fi

nginx-reload:
	@echo "🔄 Reloading nginx configuration..."
	@if docker ps | grep -q olympian-frontend; then \
		docker exec olympian-frontend nginx -s reload || docker exec olympian-frontend-dev nginx -s reload; \
		echo "✅ Nginx configuration reloaded"; \
	else \
		echo "❌ Frontend container not running. Start it first with 'make docker-dev' or similar."; \
		exit 1; \
	fi

# Setup
setup:
	@chmod +x scripts/*.sh
	@./scripts/setup.sh

# Environment configuration helpers with automatic secret generation
env-dev:
	@echo "🔧 Configuring .env for development..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=development|' .env
	@sed -i.bak 's|^# MONGODB_URI=mongodb://localhost|MONGODB_URI=mongodb://localhost|' .env
	@sed -i.bak 's|^# OLLAMA_HOST=http://localhost|OLLAMA_HOST=http://localhost|' .env
	@sed -i.bak 's|^# CLIENT_URL=http://localhost:3000|CLIENT_URL=http://localhost:3000|' .env
	@echo "🔐 Generating secure secrets..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo "✅ Development configuration applied with secure secrets"

env-docker-same:
	@echo "🔧 Configuring .env for Docker same-host deployment (with Ollama container)..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=docker-same-host|' .env
	@sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env
	@sed -i.bak 's|^# MONGODB_URI=mongodb://olympian-mongodb|MONGODB_URI=mongodb://olympian-mongodb|' .env
	@sed -i.bak 's|^OLLAMA_HOST=.*|# OLLAMA_HOST=http://localhost:11434|' .env
	@sed -i.bak 's|^# OLLAMA_HOST=http://olympian-ollama|OLLAMA_HOST=http://olympian-ollama|' .env
	@echo "🔐 Generating secure secrets..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo "✅ Docker same-host configuration applied with secure secrets"

env-docker-same-existing:
	@echo "🔧 Configuring .env for Docker same-host deployment (with existing host Ollama)..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=same-host-existing-ollama|' .env
	@sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env
	@sed -i.bak 's|^# MONGODB_URI=mongodb://olympian-mongodb|MONGODB_URI=mongodb://olympian-mongodb|' .env
	@sed -i.bak 's|^OLLAMA_HOST=.*|OLLAMA_HOST=http://host.docker.internal:11434|' .env
	@sed -i.bak 's|^# OLLAMA_HOST=http://olympian-ollama|# OLLAMA_HOST=http://olympian-ollama:11434|' .env
	@sed -i.bak 's|^# OLLAMA_HOST=http://192.168.1.11|# OLLAMA_HOST=http://192.168.1.11:11434|' .env
	@echo "🔐 Generating secure secrets..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo "✅ Docker same-host with existing Ollama configuration applied with secure secrets"
	@echo "ℹ️  Using Ollama service running on host at localhost:11434"

env-docker-multi:
	@echo "🔧 Configuring .env for Docker multi-host deployment..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=docker-multi-host|' .env
	@sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env
	@sed -i.bak 's|^# MONGODB_URI=mongodb://username:password@192.168.1.10|MONGODB_URI=mongodb://username:password@192.168.1.10|' .env
	@sed -i.bak 's|^OLLAMA_HOST=.*|# OLLAMA_HOST=http://localhost:11434|' .env
	@sed -i.bak 's|^# OLLAMA_HOST=http://192.168.1.11|OLLAMA_HOST=http://192.168.1.11|' .env
	@echo "🔐 Generating secure secrets..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo "✅ Docker multi-host configuration applied with secure secrets"
	@echo "⚠️  Please update the IP addresses and credentials in .env for your environment"

# Generate secure secrets (manual command if needed)
generate-secrets:
	@echo "🔐 Generating secure secrets..."
	@echo "Add these to your .env file:"
	@echo "JWT_SECRET=$$(openssl rand -base64 32)"
	@echo "SESSION_SECRET=$$(openssl rand -base64 32)"

# Apply generated secrets to existing .env file
apply-secrets:
	@if [ ! -f .env ]; then echo "❌ No .env file found. Run 'make setup' first."; exit 1; fi
	@echo "🔐 Applying new secure secrets to .env..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo "✅ Secure secrets applied to .env"

# Additional helpful targets
logs-dev:
	docker compose logs -f

logs-prod:
	docker compose -f docker-compose.prod.yml logs -f

logs-same:
	docker compose -f docker-compose.same-host.yml logs -f

logs-same-existing:
	docker compose -f docker-compose.same-host-existing-ollama.yml logs -f

logs-frontend:
	@CONTAINER=$$(docker ps --format "table {{.Names}}" | grep -E "olympian-frontend|olympian-frontend-dev" | head -1); \
	if [ -n "$$CONTAINER" ]; then \
		docker logs -f $$CONTAINER; \
	else \
		echo "❌ Frontend container not running"; \
		exit 1; \
	fi

logs-backend:
	@CONTAINER=$$(docker ps --format "table {{.Names}}" | grep -E "olympian-backend|olympian-backend-dev" | head -1); \
	if [ -n "$$CONTAINER" ]; then \
		docker logs -f $$CONTAINER; \
	else \
		echo "❌ Backend container not running"; \
		exit 1; \
	fi

stop-dev:
	docker compose down

stop-prod:
	docker compose -f docker-compose.prod.yml down

stop-same:
	docker compose -f docker-compose.same-host.yml down

stop-same-existing:
	docker compose -f docker-compose.same-host-existing-ollama.yml down

# Health checks
health-check:
	@echo "🏥 Checking service health..."
	@echo ""
	@echo "Frontend (nginx):"
	@curl -s http://localhost:$${APP_PORT:-8080}/health 2>/dev/null && echo "✅ Healthy" || echo "❌ Not responding"
	@echo ""
	@echo "Backend API:"
	@curl -s http://localhost:$${APP_PORT:-8080}/api/health 2>/dev/null | jq '.' 2>/dev/null || echo "❌ Not responding"
	@echo ""
	@echo "Services:"
	@curl -s http://localhost:$${APP_PORT:-8080}/api/health/services 2>/dev/null | jq '.' 2>/dev/null || echo "❌ Not responding"

health-check-dev:
	@echo "🏥 Checking development service health..."
	@echo ""
	@echo "Frontend:"
	@curl -s http://localhost:3000/health 2>/dev/null && echo "✅ Healthy" || echo "❌ Not responding"
	@echo ""
	@echo "Backend API:"
	@curl -s http://localhost:4000/api/health 2>/dev/null | jq '.' || echo "❌ Not responding"
	@echo ""
	@echo "Services:"
	@curl -s http://localhost:4000/api/health/services 2>/dev/null | jq '.' || echo "❌ Not responding"

# Database operations
db-backup:
	@echo "💾 Backing up database..."
	@mkdir -p backups
	@docker exec olympian-mongodb mongodump --out /tmp/backup
	@docker cp olympian-mongodb:/tmp/backup ./backups/mongodb-$(shell date +%Y%m%d-%H%M%S)
	@echo "✅ Backup completed"

db-restore:
	@echo "📥 Restoring database from latest backup..."
	@LATEST_BACKUP=$$(ls -t backups/mongodb-* | head -1); \
	if [ -z "$$LATEST_BACKUP" ]; then \
		echo "No backup found"; \
		exit 1; \
	fi; \
	docker cp $$LATEST_BACKUP olympian-mongodb:/tmp/restore && \
	docker exec olympian-mongodb mongorestore /tmp/restore
	@echo "✅ Restore completed"

# Show current environment configuration
show-env:
	@echo "📋 Current environment configuration:"
	@if [ -f .env ]; then \
		echo "DEPLOYMENT_MODE: $$(grep '^DEPLOYMENT_MODE=' .env | cut -d'=' -f2)"; \
		echo "MongoDB: $$(grep '^MONGODB_URI=' .env | cut -d'=' -f2- | head -c 50)..."; \
		echo "Ollama: $$(grep '^OLLAMA_HOST=' .env | cut -d'=' -f2)"; \
		echo "Port: $$(grep '^APP_PORT=' .env | cut -d'=' -f2 || echo '8080 (default)')"; \
		echo "JWT Secret: $$(if grep -q 'your-jwt-secret-key-here' .env; then echo '⚠️  Default (INSECURE)'; else echo '✅ Custom'; fi)"; \
		echo "Session Secret: $$(if grep -q 'your-session-secret-here' .env; then echo '⚠️  Default (INSECURE)'; else echo '✅ Custom'; fi)"; \
	else \
		echo "No .env file found. Run 'make setup' first."; \
	fi

show-status:
	@echo "📊 Container Status:"
	@docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep olympian || echo "No Olympian containers running"

# One-step deployment commands that include environment setup
quick-dev:
	@echo "🚀 Quick development setup..."
	@make env-dev
	@make dev

quick-docker-dev:
	@echo "🚀 Quick Docker development setup..."
	@make env-dev
	@make docker-dev
	@sleep 5
	@make health-check-dev

quick-docker-same:
	@echo "🚀 Quick Docker same-host deployment (with Ollama container)..."
	@make env-docker-same
	@make docker-same
	@sleep 10
	@make health-check

quick-docker-same-existing:
	@echo "🚀 Quick Docker same-host deployment (with existing host Ollama)..."
	@make env-docker-same-existing
	@make docker-same-existing
	@sleep 10
	@make health-check

quick-docker-multi:
	@echo "🚀 Quick Docker multi-host deployment..."
	@make env-docker-multi
	@echo "⚠️  Please edit .env to set your actual service IPs before continuing..."
	@echo "Then run: make docker-multi"

# Utility commands
shell-frontend:
	@CONTAINER=$$(docker ps --format "table {{.Names}}" | grep -E "olympian-frontend|olympian-frontend-dev" | head -1); \
	if [ -n "$$CONTAINER" ]; then \
		docker exec -it $$CONTAINER sh; \
	else \
		echo "❌ Frontend container not running"; \
		exit 1; \
	fi

shell-backend:
	@CONTAINER=$$(docker ps --format "table {{.Names}}" | grep -E "olympian-backend|olympian-backend-dev" | head -1); \
	if [ -n "$$CONTAINER" ]; then \
		docker exec -it $$CONTAINER sh; \
	else \
		echo "❌ Backend container not running"; \
		exit 1; \
	fi

# Full reset (careful!)
reset-all:
	@echo "⚠️  This will stop all containers and remove volumes. Continue? [y/N]"
	@read answer; \
	if [ "$$answer" = "y" ]; then \
		make docker-down; \
		docker volume rm olympian-ai-lightweight_mongodb-data 2>/dev/null || true; \
		docker volume rm olympian-ai-lightweight_ollama-data 2>/dev/null || true; \
		docker volume rm olympian-ai-lightweight_config-data 2>/dev/null || true; \
		docker volume rm olympian-ai-lightweight_mcp-data 2>/dev/null || true; \
		echo "✅ Reset complete"; \
	else \
		echo "❌ Reset cancelled"; \
	fi

# Rebuild containers
rebuild-frontend:
	@echo "🔨 Rebuilding frontend container..."
	@docker compose -f docker-compose.same-host-existing-ollama.yml build --no-cache frontend
	@echo "✅ Frontend rebuild complete"

rebuild-all:
	@echo "🔨 Rebuilding all containers..."
	@if docker ps | grep -q olympian-ollama; then \
		docker compose -f docker-compose.same-host.yml build --no-cache; \
	else \
		docker compose -f docker-compose.same-host-existing-ollama.yml build --no-cache; \
	fi
	@echo "✅ All containers rebuilt"
