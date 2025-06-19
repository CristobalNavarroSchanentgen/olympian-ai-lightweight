.PHONY: help setup build start stop restart logs logs-backend logs-frontend clean install dev test lint
.DEFAULT_GOAL := help

# Colors for output
CYAN := \\033[36m
GREEN := \\033[32m
YELLOW := \\033[33m
RED := \\033[31m
RESET := \\033[0m

help: ## Show this help message
	@echo "$(CYAN)Olympian AI Lightweight - Available Commands$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "\\nUsage:\\n  make $(CYAN)<target>$(RESET)\\n"} /^[a-zA-Z_0-9-]+:.*?##/ { printf "  $(CYAN)%-15s$(RESET) %s\\n", $$1, $$2 } /^##@/ { printf "\\n$(YELLOW)%s$(RESET)\\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ 🚀 Quick Start

setup: ## Install dependencies and create .env from template
	@echo "$(CYAN)🔧 Setting up Olympian AI Lightweight...$(RESET)"
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)📋 Creating .env from .env.example...$(RESET)"; \
		cp .env.example .env; \
		echo "$(GREEN)✅ .env file created. Please review and update it with your configuration.$(RESET)"; \
	else \
		echo "$(YELLOW)⚠️  .env file already exists, skipping...$(RESET)"; \
	fi
	@echo "$(CYAN)📦 Installing dependencies...$(RESET)"
	@npm install
	@echo "$(GREEN)✅ Setup complete!$(RESET)"
	@echo ""
	@echo "$(CYAN)Next steps:$(RESET)"
	@echo "  1. Review and update your .env file"
	@echo "  2. Run: $(CYAN)make quick-docker-multi$(RESET) for quick Docker setup"
	@echo "  3. Or run: $(CYAN)make start$(RESET) to start the application"

quick-docker-same: build-same-host up-same-host ## Quick setup for same-host Docker deployment with Ollama container (forces clean rebuild)

quick-docker-multi: env-docker-multi-interactive build-prod up-prod ## Quick setup for multi-host Docker deployment

quick-docker-same-existing: build-same-host-existing up-same-host-existing ## Quick setup for same-host Docker deployment with existing Ollama (forces clean rebuild)

##@ 🏗️  Building

build: ## Build the application for development
	@echo "$(CYAN)🏗️  Building application for development...$(RESET)"
	@npm run build

build-prod: ## Build the application for production
	@echo "$(CYAN)🏗️  Building application for production...$(RESET)"
	@docker-compose -f docker-compose.prod.yml build

build-prod-clean: ## Build the application for production (no cache)
	@echo "$(CYAN)🏗️  Building application for production (clean build)...$(RESET)"
	@docker-compose -f docker-compose.prod.yml build --no-cache

build-same-host: ## Build for same-host with Ollama container (no cache)
	@echo "$(CYAN)🏗️  Building for same-host with Ollama container (clean build)...$(RESET)"
	@docker-compose -f docker-compose.same-host.yml build --no-cache

build-same-host-existing: ## Build for same-host with existing Ollama (no cache)
	@echo "$(CYAN)🏗️  Building for same-host with existing Ollama (clean build)...$(RESET)"
	@docker-compose -f docker-compose.same-host-existing-ollama.yml build --no-cache

rebuild-backend: ## Rebuild only the backend container (no cache)
	@echo "$(CYAN)🔄 Rebuilding backend container...$(RESET)"
	@docker-compose -f docker-compose.prod.yml stop backend
	@docker-compose -f docker-compose.prod.yml build --no-cache backend
	@docker-compose -f docker-compose.prod.yml up -d backend
	@echo "$(GREEN)✅ Backend rebuilt and restarted!$(RESET)"

##@ 🐳 Docker Commands

up: ## Start development environment with Docker
	@echo "$(CYAN)🐳 Starting development environment...$(RESET)"
	@docker-compose up -d
	@echo "$(GREEN)✅ Development environment started!$(RESET)"
	@echo "$(CYAN)Access the application at: http://localhost:3000$(RESET)"

up-prod: ## Start production environment with Docker
	@echo "$(CYAN)🐳 Starting production environment...$(RESET)"
	@docker-compose -f docker-compose.prod.yml up -d
	@echo "$(GREEN)✅ Production environment started!$(RESET)"
	@echo "$(CYAN)Access the application at: http://localhost:8080$(RESET)"

up-same-host: ## Start same-host environment with Ollama container
	@echo "$(CYAN)🐳 Starting same-host environment with Ollama container...$(RESET)"
	@docker-compose -f docker-compose.same-host.yml up -d
	@echo "$(GREEN)✅ Same-host environment started!$(RESET)"
	@echo "$(CYAN)Access the application at: http://localhost:8080$(RESET)"

up-same-host-existing: ## Start same-host environment with existing Ollama
	@echo "$(CYAN)🐳 Starting same-host environment with existing Ollama...$(RESET)"
	@docker-compose -f docker-compose.same-host-existing-ollama.yml up -d
	@echo "$(GREEN)✅ Same-host environment started!$(RESET)"
	@echo "$(CYAN)Access the application at: http://localhost:8080$(RESET)"
	@echo "$(YELLOW)Note: Make sure Ollama is running on your host machine at port 11434$(RESET)"

start: up ## Alias for 'up' command

stop: ## Stop Docker containers
	@echo "$(CYAN)🛑 Stopping containers...$(RESET)"
	@docker-compose down
	@docker-compose -f docker-compose.prod.yml down 2>/dev/null || true
	@docker-compose -f docker-compose.same-host.yml down 2>/dev/null || true
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down 2>/dev/null || true
	@echo "$(GREEN)✅ Containers stopped!$(RESET)"

restart: stop up ## Restart the development environment

restart-prod: ## Restart the production environment
	@echo "$(CYAN)🔄 Restarting production environment...$(RESET)"
	@docker-compose -f docker-compose.prod.yml down
	@docker-compose -f docker-compose.prod.yml up -d
	@echo "$(GREEN)✅ Production environment restarted!$(RESET)"

restart-same-host: ## Restart same-host environment with Ollama container
	@echo "$(CYAN)🔄 Restarting same-host environment...$(RESET)"
	@docker-compose -f docker-compose.same-host.yml down
	@docker-compose -f docker-compose.same-host.yml up -d
	@echo "$(GREEN)✅ Same-host environment restarted!$(RESET)"

restart-same-host-existing: ## Restart same-host environment with existing Ollama
	@echo "$(CYAN)🔄 Restarting same-host environment...$(RESET)"
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down
	@docker-compose -f docker-compose.same-host-existing-ollama.yml up -d
	@echo "$(GREEN)✅ Same-host environment restarted!$(RESET)"

##@ 📋 Logs & Monitoring

logs: ## Show logs from all services
	@docker-compose logs -f

logs-backend: ## Show logs from backend service (auto-detects which deployment)
	@echo "$(CYAN)📋 Showing backend logs...$(RESET)"
	@if docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		if docker-compose -f docker-compose.same-host.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.same-host.yml logs -f backend; \
		elif docker-compose -f docker-compose.same-host-existing-ollama.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.same-host-existing-ollama.yml logs -f backend; \
		elif docker-compose -f docker-compose.prod.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.prod.yml logs -f backend; \
		else \
			docker logs -f olympian-backend; \
		fi \
	else \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
	fi

logs-frontend: ## Show logs from frontend service
	@echo "$(CYAN)📋 Showing frontend logs...$(RESET)"
	@if docker ps --format "table {{.Names}}" | grep -q "olympian-frontend"; then \
		docker logs -f olympian-frontend; \
	else \
		echo "$(RED)❌ Frontend container is not running!$(RESET)"; \
	fi

logs-mongodb: ## Show logs from MongoDB service
	@echo "$(CYAN)📋 Showing MongoDB logs...$(RESET)"
	@if docker ps --format "table {{.Names}}" | grep -q "olympian-mongodb"; then \
		docker logs -f olympian-mongodb; \
	else \
		echo "$(RED)❌ MongoDB container is not running!$(RESET)"; \
	fi

status: ## Show status of Docker containers
	@echo "$(CYAN)📊 Container Status:$(RESET)"
	@docker-compose ps
	@echo ""
	@echo "$(CYAN)📊 Production Container Status:$(RESET)"
	@docker-compose -f docker-compose.prod.yml ps
	@echo ""
	@echo "$(CYAN)📊 Same-Host Container Status:$(RESET)"
	@docker-compose -f docker-compose.same-host.yml ps
	@echo ""
	@echo "$(CYAN)📊 Same-Host-Existing Container Status:$(RESET)"
	@docker-compose -f docker-compose.same-host-existing-ollama.yml ps

diagnose: ## Run comprehensive diagnostics for multi-host deployment
	@echo "$(CYAN)🔍 Running multi-host deployment diagnostics...$(RESET)"
	@chmod +x scripts/diagnose-multi-host.sh
	@./scripts/diagnose-multi-host.sh

debug-backend: ## Debug backend startup and health check issues
	@echo "$(CYAN)🔍 Debugging backend startup...$(RESET)"
	@chmod +x scripts/debug-backend.sh
	@./scripts/debug-backend.sh

##@ 🛠️  Development

dev: ## Start development servers locally (without Docker)
	@echo "$(CYAN)🛠️  Starting development servers...$(RESET)"
	@npm run dev

install: ## Install dependencies
	@echo "$(CYAN)📦 Installing dependencies...$(RESET)"
	@npm install
	@echo "$(GREEN)✅ Dependencies installed!$(RESET)"

test: ## Run tests
	@echo "$(CYAN)🧪 Running tests...$(RESET)"
	@npm test

lint: ## Run linting
	@echo "$(CYAN)🔍 Running linter...$(RESET)"
	@npm run lint

##@ 🧹 Cleanup

clean: ## Clean up Docker resources
	@echo "$(CYAN)🧹 Cleaning up Docker resources...$(RESET)"
	@docker-compose down -v --remove-orphans
	@docker-compose -f docker-compose.prod.yml down -v --remove-orphans 2>/dev/null || true
	@docker-compose -f docker-compose.same-host.yml down -v --remove-orphans 2>/dev/null || true
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down -v --remove-orphans 2>/dev/null || true
	@docker system prune -f
	@echo "$(GREEN)✅ Cleanup complete!$(RESET)"

clean-all: ## Clean up everything including images and volumes
	@echo "$(RED)⚠️  This will remove ALL Docker images and volumes!$(RESET)"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ]
	@docker-compose down -v --remove-orphans --rmi all
	@docker-compose -f docker-compose.prod.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker-compose -f docker-compose.same-host.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker system prune -af --volumes
	@echo "$(GREEN)✅ Complete cleanup done!$(RESET)"

##@ ⚙️  Configuration

fix-mongo-uri: ## Fix MongoDB URI for Docker deployment
	@chmod +x scripts/fix-mongo-uri.sh
	@./scripts/fix-mongo-uri.sh

env-docker-multi-interactive: ## Interactive multi-host environment configuration
	@echo "$(CYAN)🔧 Interactive Docker multi-host configuration setup...$(RESET)"
	@echo ""
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's|^DEPLOYMENT_MODE=.*|DEPLOYMENT_MODE=docker-multi-host|' .env
	@echo "$(CYAN)📋 Setting up multi-host deployment configuration$(RESET)"
	@echo ""
	@echo "$(CYAN)🔌 Ollama Configuration:$(RESET)"
	@echo "$(YELLOW)Note: If your Ollama service is behind a reverse proxy (e.g., using HTTPS or standard ports),$(RESET)"
	@echo "$(YELLOW)enter the full URL including protocol (e.g., http://ollama.example.com or https://ollama.example.com)$(RESET)"
	@echo ""
	@printf "Enter Ollama URL or host (e.g., http://ollama.example.com, 192.168.1.11, ollama-server.local): "; \
	read ollama_input; \
	if [ -z "$$ollama_input" ]; then \
		echo "$(RED)❌ Ollama host is required for multi-host deployment!$(RESET)"; \
		exit 1; \
	fi; \
	if echo "$$ollama_input" | grep -E '^https?://' >/dev/null; then \
		ollama_url="$$ollama_input"; \
		echo "$(GREEN)✅ Using full URL: $$ollama_url$(RESET)"; \
	elif echo "$$ollama_input" | grep -E '^([0-9]{1,3}\.){3}[0-9]{1,3}(:[0-9]+)?$$' >/dev/null; then \
		ip_part=$$(echo "$$ollama_input" | cut -d':' -f1); \
		for octet in $$(echo "$$ip_part" | tr '.' ' '); do \
			if [ $$octet -gt 255 ]; then \
				echo "$(RED)❌ Invalid IP address: $$ip_part$(RESET)"; \
				exit 1; \
			fi; \
		done; \
		if echo "$$ollama_input" | grep -q ":"; then \
			ollama_url="http://$$ollama_input"; \
			echo "$(GREEN)✅ IP with port detected, using: $$ollama_url$(RESET)"; \
		else \
			printf "Add default Ollama port 11434? (Y/n): "; \
			read add_port; \
			if [ "$$add_port" = "n" ] || [ "$$add_port" = "N" ]; then \
				ollama_url="http://$$ollama_input"; \
				echo "$(GREEN)✅ Using IP without port: $$ollama_url$(RESET)"; \
			else \
				ollama_url="http://$$ollama_input:11434"; \
				echo "$(GREEN)✅ Using IP with default port: $$ollama_url$(RESET)"; \
			fi; \
		fi; \
	elif echo "$$ollama_input" | grep -E '^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*(:[0-9]+)?$$' >/dev/null; then \
		if [ $$(echo "$$ollama_input" | cut -d':' -f1 | wc -c) -le 254 ]; then \
			if echo "$$ollama_input" | grep -q ":"; then \
				ollama_url="http://$$ollama_input"; \
				echo "$(GREEN)✅ Hostname with port detected, using: $$ollama_url$(RESET)"; \
			else \
				printf "Add default Ollama port 11434? (Y/n): "; \
				read add_port; \
				if [ "$$add_port" = "n" ] || [ "$$add_port" = "N" ]; then \
					ollama_url="http://$$ollama_input"; \
					echo "$(GREEN)✅ Using hostname without port: $$ollama_url$(RESET)"; \
				else \
					ollama_url="http://$$ollama_input:11434"; \
					echo "$(GREEN)✅ Using hostname with default port: $$ollama_url$(RESET)"; \
				fi; \
			fi; \
		else \
			echo "$(RED)❌ Hostname too long: $$ollama_input$(RESET)"; \
			exit 1; \
		fi; \
	else \
		echo "$(RED)❌ Invalid format. Please enter a valid URL, IP address, or hostname: $$ollama_input$(RESET)"; \
		exit 1; \
	fi; \
	sed -i.bak 's|^OLLAMA_HOST=.*|OLLAMA_HOST='"$$ollama_url"'|' .env
	@echo ""
	@echo "$(CYAN)🗄️  MongoDB Configuration:$(RESET)"
	@echo "$(YELLOW)Note: When using Docker, containerized MongoDB is accessed via the service name 'mongodb'$(RESET)"
	@printf "Use default MongoDB setup? (y/N): "; \
	read use_default_mongo; \
	if [ "$$use_default_mongo" = "y" ] || [ "$$use_default_mongo" = "Y" ]; then \
		sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite|' .env; \
		echo "$(GREEN)✅ Using containerized MongoDB (accessible via Docker service name)$(RESET)"; \
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
			sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI='"$$mongo_uri"'|' .env; \
			echo "$(GREEN)✅ MongoDB configured for external host: $$mongo_host$(RESET)"; \
		else \
			sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite|' .env; \
			echo "$(GREEN)✅ Using containerized MongoDB (accessible via Docker service name)$(RESET)"; \
		fi; \
	fi
	@echo ""
	@echo "$(CYAN)🔐 Generating secure secrets...$(RESET)"
	@JWT_SECRET=$$(openssl rand -base64 32); \
	SESSION_SECRET=$$(openssl rand -base64 32); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@echo ""
	@echo "$(CYAN)🌐 Setting up CORS for multi-host...$(RESET)"
	@APP_PORT=$$(grep "^APP_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "8080"); \
	if grep -q "^ALLOWED_ORIGINS=" .env; then \
		sed -i.bak "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:$$APP_PORT|" .env; \
	else \
		echo "ALLOWED_ORIGINS=http://localhost:$$APP_PORT" >> .env; \
	fi
	@rm -f .env.bak
	@echo ""
	@echo "$(GREEN)✅ Interactive multi-host configuration complete!$(RESET)"
	@echo "$(CYAN)📋 Configuration summary:$(RESET)"
	@grep "^OLLAMA_HOST=" .env | sed 's/^/  /'
	@grep "^MONGODB_URI=" .env | head -1 | sed 's/^/  /'
	@grep "^ALLOWED_ORIGINS=" .env | sed 's/^/  /'
