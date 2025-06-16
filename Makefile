# Olympian AI Lightweight Makefile
# Simplifies common development and deployment tasks

.PHONY: help install dev build test lint format clean docker-build docker-dev docker-prod-same docker-prod-multi setup env-dev env-docker-same env-docker-same-existing env-docker-multi env-docker-multi-interactive env-docker-multi-advanced nginx-test troubleshoot fix-nginx debug-nginx diagnose-chat

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
	@echo "  make env-docker-multi-interactive Configure .env for Docker multi-host with guided setup"
	@echo "  make env-docker-multi-advanced Configure .env for Docker multi-host with full interactive setup"
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
	@echo "  make troubleshoot           Run Docker troubleshooting diagnostics"
	@echo "  make fix-nginx              Fix nginx serving issues (complete rebuild)"
	@echo "  make debug-nginx            Debug nginx build and configuration issues"
	@echo "  make diagnose-chat          Diagnose chat functionality issues"
	@echo ""
	@echo "Quick Commands:"
	@echo "  make quick-dev              Quick development setup"
	@echo "  make quick-docker-same      Quick Docker same-host deployment"
	@echo "  make quick-docker-same-existing Quick Docker with existing Ollama"
	@echo "  make quick-docker-multi     Quick Docker multi-host deployment (automated setup)"
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
	@echo "🧹 Cleaning up any conflicting Docker networks..."
	@docker network prune -f
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
	@docker compose -f docker-compose.debug.yml down 2>/dev/null || true
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

# Debug nginx issues
debug-nginx:
	@echo "🐛 Debugging nginx build and configuration..."
	@echo ""
	@echo "Step 1: Stopping all containers..."
	@make docker-down
	@echo ""
	@echo "Step 2: Removing old images..."
	@docker rmi olympian-ai-lightweight-frontend olympian-ai-lightweight-frontend-debug 2>/dev/null || true
	@echo ""
	@echo "Step 3: Building debug image..."
	@mkdir -p debug-logs
	@docker compose -f docker-compose.debug.yml build --no-cache --progress plain frontend 2>&1 | tee debug-logs/build.log
	@echo ""
	@echo "Step 4: Starting debug containers..."
	@docker compose -f docker-compose.debug.yml up -d
	@echo ""
	@echo "Step 5: Waiting for startup..."
	@sleep 5
	@echo ""
	@echo "Step 6: Checking container logs..."
	@docker logs olympian-frontend-debug 2>&1 | tee debug-logs/startup.log
	@echo ""
	@echo "Step 7: Inspecting nginx content..."
	@docker exec olympian-frontend-debug sh -c "ls -la /usr/share/nginx/html" 2>&1 | tee debug-logs/nginx-content.log
	@echo ""
	@echo "Step 8: Testing nginx response..."
	@curl -v http://localhost:8080/ 2>&1 | tee debug-logs/curl-response.log
	@echo ""
	@echo "Debug logs saved in debug-logs/"
	@echo "Check debug-logs/build.log for build issues"

# Fix nginx serving issues
fix-nginx:
	@echo "🔧 Fixing nginx serving issues..."
	@echo "Step 1: Stopping all containers..."
	@make docker-down
	@echo ""
	@echo "Step 2: Removing old images and volumes..."
	@docker rmi olympian-ai-lightweight-frontend 2>/dev/null || true
	@docker volume prune -f
	@echo ""
	@echo "Step 3: Building all packages locally to verify..."
	@npm install
	@npm run build:shared && echo "✅ Shared package built successfully" || (echo "❌ Shared package build failed" && exit 1)
	@npm run build:client && echo "✅ Client package built successfully" || (echo "❌ Client package build failed" && exit 1)
	@echo ""
	@echo "Step 4: Rebuilding Docker images with no cache..."
	@if docker ps -a | grep -q olympian-ollama; then \
		docker compose -f docker-compose.same-host.yml build --no-cache frontend; \
	else \
		docker compose -f docker-compose.same-host-existing-ollama.yml build --no-cache frontend; \
	fi
	@echo ""
	@echo "Step 5: Starting containers..."
	@if [ "$$(grep '^DEPLOYMENT_MODE=' .env | cut -d'=' -f2)" = "same-host-existing-ollama" ]; then \
		make docker-same-existing; \
	else \
		make docker-same; \
	fi
	@echo ""
	@echo "✅ Fix complete! Checking status..."
	@sleep 5
	@make health-check

# Diagnose chat issues
diagnose-chat:
	@echo "🔍 Diagnosing chat functionality..."
	@chmod +x scripts/diagnose-chat.sh
	@./scripts/diagnose-chat.sh

# Troubleshooting
troubleshoot:
	@echo "🔍 Running Docker troubleshooting diagnostics..."
	@chmod +x scripts/troubleshoot-docker.sh
	@./scripts/troubleshoot-docker.sh

# Setup
setup:
	@chmod +x scripts/*.sh
	@./scripts/setup.sh

# Validation helper functions for IP addresses and DNS names
validate-ip:
	@if echo "$(HOST)" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$$' >/dev/null; then \
		for octet in $$(echo "$(HOST)" | tr '.' ' '); do \
			if [ $$octet -gt 255 ]; then \
				echo "❌ Invalid IP address: $(HOST)"; \
				exit 1; \
			fi; \
		done; \
		echo "✅ Valid IP address: $(HOST)"; \
	else \
		echo "❌ Invalid IP address format: $(HOST)"; \
		exit 1; \
	fi

validate-dns:
	@if echo "$(HOST)" | grep -E '^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$$' >/dev/null; then \
		if [ $$(echo "$(HOST)" | wc -c) -le 254 ]; then \
			echo "✅ Valid DNS name: $(HOST)"; \
		else \
			echo "❌ DNS name too long: $(HOST)"; \
			exit 1; \
		fi; \
	else \
		echo "❌ Invalid DNS name format: $(HOST)"; \
		exit 1; \
	fi

validate-host:
	@if echo "$(HOST)" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$$' >/dev/null; then \
		for octet in $$(echo "$(HOST)" | tr '.' ' '); do \
			if [ $$octet -gt 255 ]; then \
				echo "❌ Invalid IP address: $(HOST)"; \
				exit 1; \
			fi; \
		done; \
		echo "✅ Valid IP address: $(HOST)"; \
	elif echo "$(HOST)" | grep -E '^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$$' >/dev/null; then \
		if [ $$(echo "$(HOST)" | wc -c) -le 254 ]; then \
			echo "✅ Valid hostname/DNS: $(HOST)"; \
		else \
			echo "❌ Hostname too long: $(HOST)"; \
			exit 1; \
		fi; \
	else \
		echo "❌ Invalid host format (must be IP address or DNS name): $(HOST)"; \
		exit 1; \
	fi

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

# Interactive multi-host environment configuration
env-docker-multi-interactive:
	@echo "🔧 Interactive Docker multi-host configuration setup..."
	@echo ""
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=docker-multi-host|' .env
	@echo "📋 Setting up multi-host deployment configuration"
	@echo ""
	@echo "🔌 Ollama Configuration:"
	@printf "Enter Ollama host (IP address or DNS name, e.g., 192.168.1.11 or ollama-server.local): "; \
	read ollama_host; \
	if [ -z "$$ollama_host" ]; then \
		echo "❌ Ollama host is required for multi-host deployment!"; \
		exit 1; \
	fi; \
	if echo "$$ollama_host" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$$' >/dev/null; then \
		for octet in $$(echo "$$ollama_host" | tr '.' ' '); do \
			if [ $$octet -gt 255 ]; then \
				echo "❌ Invalid IP address: $$ollama_host"; \
				exit 1; \
			fi; \
		done; \
		echo "✅ Ollama IP validated: $$ollama_host"; \
	elif echo "$$ollama_host" | grep -E '^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$$' >/dev/null; then \
		if [ $$(echo "$$ollama_host" | wc -c) -le 254 ]; then \
			echo "✅ Ollama hostname validated: $$ollama_host"; \
		else \
			echo "❌ Hostname too long: $$ollama_host"; \
			exit 1; \
		fi; \
	else \
		echo "❌ Invalid host format (must be IP address or DNS name): $$ollama_host"; \
		exit 1; \
	fi; \
	sed -i.bak 's|^OLLAMA_HOST=.*|# OLLAMA_HOST=http://localhost:11434|' .env; \
	sed -i.bak 's|^# OLLAMA_HOST=http://192.168.1.11|OLLAMA_HOST=http://'"$$ollama_host"':11434|' .env
	@echo ""
	@echo "🗄️  MongoDB Configuration:"
	@printf "Use default MongoDB setup? (y/N): "; \
	read use_default_mongo; \
	if [ "$$use_default_mongo" = "y" ] || [ "$$use_default_mongo" = "Y" ]; then \
		sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env; \
		sed -i.bak 's|^# MONGODB_URI=mongodb://olympian-mongodb:27017|MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite|' .env; \
		echo "✅ Using containerized MongoDB"; \
	else \
		printf "Enter MongoDB host (IP address or DNS name, or press Enter to use containerized MongoDB): "; \
		read mongo_host; \
		if [ -n "$$mongo_host" ]; then \
			printf "Enter MongoDB username (or press Enter for no auth): "; \
			read mongo_user; \
			if [ -n "$$mongo_user" ]; then \
				printf "Enter MongoDB password: "; \
				read -s mongo_pass; echo; \
				mongo_uri="mongodb://$$mongo_user:$$mongo_pass@$$mongo_host:27017/olympian_ai_lite?authSource=admin"; \
			else \
				mongo_uri="mongodb://$$mongo_host:27017/olympian_ai_lite"; \
			fi; \
			sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env; \
			sed -i.bak 's|^# MONGODB_URI=mongodb://username:password@192.168.1.10|MONGODB_URI='"$$mongo_uri"'|' .env; \
			echo "✅ MongoDB configured for external host: $$mongo_host"; \
		else \
			sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env; \
			sed -i.bak 's|^# MONGODB_URI=mongodb://olympian-mongodb:27017|MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite|' .env; \
			echo "✅ Using containerized MongoDB"; \
		fi; \
	fi
	@echo ""
	@echo "🔐 Generating secure secrets..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo ""
	@echo "✅ Interactive multi-host configuration complete!"
	@echo "📋 Configuration summary:"
	@grep "^OLLAMA_HOST=" .env | sed 's/^/  /'
	@grep "^MONGODB_URI=" .env | head -1 | sed 's/^/  /'

# Advanced interactive multi-host environment configuration
env-docker-multi-advanced:
	@echo "🔧 Advanced interactive Docker multi-host configuration setup..."
	@echo ""
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=docker-multi-host|' .env
	@echo "📋 Setting up advanced multi-host deployment configuration"
	@echo ""
	@echo "🔌 Ollama Configuration:"
	@printf "Enter Ollama host (IP address or DNS name, e.g., 192.168.1.11 or ollama-server.local): "; \
	read ollama_host; \
	if [ -z "$$ollama_host" ]; then \
		echo "❌ Ollama host is required for multi-host deployment!"; \
		exit 1; \
	fi; \
	if echo "$$ollama_host" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}$$' >/dev/null; then \
		for octet in $$(echo "$$ollama_host" | tr '.' ' '); do \
			if [ $$octet -gt 255 ]; then \
				echo "❌ Invalid IP address: $$ollama_host"; \
				exit 1; \
			fi; \
		done; \
		echo "✅ Ollama IP validated: $$ollama_host"; \
	elif echo "$$ollama_host" | grep -E '^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$$' >/dev/null; then \
		if [ $$(echo "$$ollama_host" | wc -c) -le 254 ]; then \
			echo "✅ Ollama hostname validated: $$ollama_host"; \
		else \
			echo "❌ Hostname too long: $$ollama_host"; \
			exit 1; \
		fi; \
	else \
		echo "❌ Invalid host format (must be IP address or DNS name): $$ollama_host"; \
		exit 1; \
	fi; \
	printf "Enter Ollama port (default: 11434): "; \
	read ollama_port; \
	if [ -z "$$ollama_port" ]; then ollama_port=11434; fi; \
	sed -i.bak 's|^OLLAMA_HOST=.*|# OLLAMA_HOST=http://localhost:11434|' .env; \
	sed -i.bak 's|^# OLLAMA_HOST=http://192.168.1.11|OLLAMA_HOST=http://'"$$ollama_host"':'"$$ollama_port"'|' .env; \
	echo "✅ Ollama configured: $$ollama_host:$$ollama_port"
	@echo ""
	@echo "🗄️  MongoDB Configuration:"
	@printf "Use containerized MongoDB? (Y/n): "; \
	read use_container_mongo; \
	if [ "$$use_container_mongo" = "n" ] || [ "$$use_container_mongo" = "N" ]; then \
		printf "Enter MongoDB host (IP address or DNS name): "; \
		read mongo_host; \
		printf "Enter MongoDB port (default: 27017): "; \
		read mongo_port; \
		if [ -z "$$mongo_port" ]; then mongo_port=27017; fi; \
		printf "Enter MongoDB database name (default: olympian_ai_lite): "; \
		read mongo_db; \
		if [ -z "$$mongo_db" ]; then mongo_db=olympian_ai_lite; fi; \
		printf "Enter MongoDB username (or press Enter for no auth): "; \
		read mongo_user; \
		if [ -n "$$mongo_user" ]; then \
			printf "Enter MongoDB password: "; \
			read -s mongo_pass; echo; \
			mongo_uri="mongodb://$$mongo_user:$$mongo_pass@$$mongo_host:$$mongo_port/$$mongo_db?authSource=admin"; \
		else \
			mongo_uri="mongodb://$$mongo_host:$$mongo_port/$$mongo_db"; \
		fi; \
		sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env; \
		sed -i.bak 's|^# MONGODB_URI=mongodb://username:password@192.168.1.10|MONGODB_URI='"$$mongo_uri"'|' .env; \
		echo "✅ MongoDB configured for external host: $$mongo_host:$$mongo_port"; \
	else \
		sed -i.bak 's|^MONGODB_URI=.*|# MONGODB_URI=mongodb://localhost:27017/olympian_ai_lite|' .env; \
		sed -i.bak 's|^# MONGODB_URI=mongodb://olympian-mongodb:27017|MONGODB_URI=mongodb://olympian-mongodb:27017/olympian_ai_lite|' .env; \
		echo "✅ Using containerized MongoDB"; \
	fi
	@echo ""
	@echo "🌐 Application Configuration:"
	@printf "Enter application port (default: 8080): "; \
	read app_port; \
	if [ -n "$$app_port" ]; then \
		if grep -q "^APP_PORT=" .env; then \
			sed -i.bak "s|^APP_PORT=.*|APP_PORT=$$app_port|" .env; \
		else \
			echo "APP_PORT=$$app_port" >> .env; \
		fi; \
		echo "✅ Application port set to: $$app_port"; \
	else \
		echo "✅ Using default application port: 8080"; \
	fi
	@echo ""
	@echo "🔐 Generating secure secrets..."
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@rm -f .env.bak
	@echo ""
	@echo "✅ Advanced multi-host configuration complete!"
	@echo "📋 Configuration summary:"
	@grep "^DEPLOYMENT_MODE=" .env | sed 's/^/  /'
	@grep "^OLLAMA_HOST=" .env | sed 's/^/  /'
	@grep "^MONGODB_URI=" .env | head -1 | sed 's/^/  /'
	@grep "^APP_PORT=" .env | sed 's/^/  /' || echo "  APP_PORT=8080 (default)"

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

# Docker network cleanup utility
docker-network-cleanup:
	@echo "🧹 Cleaning up Docker networks..."
	@docker network prune -f
	@echo "✅ Network cleanup complete"

# Additional helpful targets
logs-dev:
	docker compose logs -f

logs-prod:
	docker compose -f docker-compose.prod.yml logs -f

logs-same:
	docker compose -f docker-compose.same-host.yml logs -f

logs-same-existing:
	docker compose -f docker-compose.same-host-existing-ollama.yml logs -f

logs-debug:
	docker compose -f docker-compose.debug.yml logs -f

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

stop-debug:
	docker compose -f docker-compose.debug.yml down

# Health checks
health-check:
	@echo "🏥 Checking service health..."
	@echo ""
	@echo "Frontend (nginx):"
	@curl -sf http://localhost:$${APP_PORT:-8080}/ > /dev/null && echo "✅ Healthy" || echo "❌ Not responding"
	@echo ""
	@echo "Backend API:"
	@curl -sf http://localhost:$${APP_PORT:-8080}/api/health 2>/dev/null | jq '.' 2>/dev/null || echo "❌ Not responding"
	@echo ""
	@echo "Services:"
	@curl -sf http://localhost:$${APP_PORT:-8080}/api/health/services 2>/dev/null | jq '.' 2>/dev/null || echo "❌ Not responding"

health-check-dev:
	@echo "🏥 Checking development service health..."
	@echo ""
	@echo "Frontend:"
	@curl -sf http://localhost:3000/ > /dev/null && echo "✅ Healthy" || echo "❌ Not responding"
	@echo ""
	@echo "Backend API:"
	@curl -sf http://localhost:4000/api/health 2>/dev/null | jq '.' || echo "❌ Not responding"
	@echo ""
	@echo "Services:"
	@curl -sf http://localhost:4000/api/health/services 2>/dev/null | jq '.' || echo "❌ Not responding"

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
		echo "MongoDB: $$(grep '^MONGODB_URI=' .env | head -1 | cut -d'=' -f2- | head -c 50)..."; \
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
	@echo "🚀 Quick Docker multi-host deployment with automated setup..."
	@echo ""
	@echo "📋 This will configure and deploy Olympian AI for multi-host setup"
	@echo "💡 You can specify either IP addresses or DNS names for your Ollama host"
	@echo "   Examples: 192.168.1.11, ollama-server.local, my-ai-box"
	@echo ""
	@make env-docker-multi-interactive
	@echo ""
	@echo "🚀 Starting deployment..."
	@make docker-multi
	@sleep 10
	@echo ""
	@make health-check
	@echo ""
	@echo "✅ Multi-host deployment complete and automated!"
	@echo "📍 Access your application at: http://localhost:$${APP_PORT:-8080}"

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

# Diagnostic command
diagnose:
	@echo "🔍 Running deployment diagnostics..."
	@chmod +x scripts/diagnose-deployment.sh
	@./scripts/diagnose-deployment.sh
