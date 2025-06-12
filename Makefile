# Olympian AI Lightweight Makefile
# Simplifies common development and deployment tasks

.PHONY: help install dev build test lint format clean docker-build docker-dev docker-prod-same docker-prod-multi setup env-dev env-docker-same env-docker-multi

# Default target
help:
	@echo "Olympian AI Lightweight - Available commands:"
	@echo ""
	@echo "Setup & Environment:"
	@echo "  make setup            Run initial setup"
	@echo "  make env-dev          Configure .env for development"
	@echo "  make env-docker-same  Configure .env for Docker same-host"
	@echo "  make env-docker-multi Configure .env for Docker multi-host"
	@echo ""
	@echo "Development:"
	@echo "  make install          Install dependencies"
	@echo "  make dev              Start development servers"
	@echo "  make build            Build all packages"
	@echo "  make test             Run tests"
	@echo "  make lint             Run linter"
	@echo "  make format           Format code"
	@echo "  make clean            Clean build artifacts"
	@echo ""
	@echo "Docker Deployment:"
	@echo "  make docker-dev       Run development environment in Docker"
	@echo "  make docker-same      Deploy production (same-host)"
	@echo "  make docker-multi     Deploy production (multi-host)"
	@echo "  make docker-build     Build Docker images only"
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

# Docker commands
docker-build:
	docker compose -f docker-compose.prod.yml build

docker-dev:
	docker compose up -d

docker-same:
	./scripts/docker-deploy.sh --same-host

docker-multi:
	./scripts/docker-deploy.sh --multi-host

# Setup
setup:
	@chmod +x scripts/*.sh
	@./scripts/setup.sh

# Environment configuration helpers
env-dev:
	@echo "🔧 Configuring .env for development..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's/^DEPLOYMENT_MODE=.*/DEPLOYMENT_MODE=development/' .env
	@sed -i.bak 's/^# MONGODB_URI=mongodb:\/\/localhost/MONGODB_URI=mongodb:\/\/localhost/' .env
	@sed -i.bak 's/^# OLLAMA_HOST=http:\/\/localhost/OLLAMA_HOST=http:\/\/localhost/' .env
	@sed -i.bak 's/^# CLIENT_URL=http:\/\/localhost:3000/CLIENT_URL=http:\/\/localhost:3000/' .env
	@rm -f .env.bak
	@echo "✅ Development configuration applied"
	@echo "⚠️  Remember to set secure JWT_SECRET and SESSION_SECRET values"

env-docker-same:
	@echo "🔧 Configuring .env for Docker same-host deployment..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's/^DEPLOYMENT_MODE=.*/DEPLOYMENT_MODE=docker-same-host/' .env
	@sed -i.bak 's/^MONGODB_URI=.*/# MONGODB_URI=mongodb:\/\/localhost:27017\/olympian_ai_lite/' .env
	@sed -i.bak 's/^# MONGODB_URI=mongodb:\/\/olympian-mongodb/MONGODB_URI=mongodb:\/\/olympian-mongodb/' .env
	@sed -i.bak 's/^OLLAMA_HOST=.*/# OLLAMA_HOST=http:\/\/localhost:11434/' .env
	@sed -i.bak 's/^# OLLAMA_HOST=http:\/\/olympian-ollama/OLLAMA_HOST=http:\/\/olympian-ollama/' .env
	@rm -f .env.bak
	@echo "✅ Docker same-host configuration applied"
	@echo "⚠️  Remember to set secure JWT_SECRET and SESSION_SECRET values"

env-docker-multi:
	@echo "🔧 Configuring .env for Docker multi-host deployment..."
	@if [ ! -f .env ]; then cp .env.example .env; fi
	@sed -i.bak 's/^DEPLOYMENT_MODE=.*/DEPLOYMENT_MODE=docker-multi-host/' .env
	@sed -i.bak 's/^MONGODB_URI=.*/# MONGODB_URI=mongodb:\/\/localhost:27017\/olympian_ai_lite/' .env
	@sed -i.bak 's/^# MONGODB_URI=mongodb:\/\/username:password@192.168.1.10/MONGODB_URI=mongodb:\/\/username:password@192.168.1.10/' .env
	@sed -i.bak 's/^OLLAMA_HOST=.*/# OLLAMA_HOST=http:\/\/localhost:11434/' .env
	@sed -i.bak 's/^# OLLAMA_HOST=http:\/\/192.168.1.11/OLLAMA_HOST=http:\/\/192.168.1.11/' .env
	@rm -f .env.bak
	@echo "✅ Docker multi-host configuration applied"
	@echo "⚠️  Please update the IP addresses and credentials in .env"
	@echo "⚠️  Remember to set secure JWT_SECRET and SESSION_SECRET values"

# Generate secure secrets
generate-secrets:
	@echo "🔐 Generating secure secrets..."
	@echo "Add these to your .env file:"
	@echo "JWT_SECRET=$$(openssl rand -base64 32)"
	@echo "SESSION_SECRET=$$(openssl rand -base64 32)"

# Additional helpful targets
logs-dev:
	docker compose logs -f

logs-prod:
	docker compose -f docker-compose.prod.yml logs -f

stop-dev:
	docker compose down

stop-prod:
	docker compose -f docker-compose.prod.yml down

# Health checks
health-check:
	@echo "Checking service health..."
	@curl -s http://localhost:4000/api/health | jq '.' || echo "Backend not responding"
	@curl -s http://localhost:4000/api/health/services | jq '.' || echo "Services health check failed"

# Database operations
db-backup:
	@echo "Backing up database..."
	@mkdir -p backups
	@docker exec olympian-mongodb mongodump --out /tmp/backup
	@docker cp olympian-mongodb:/tmp/backup ./backups/mongodb-$(shell date +%Y%m%d-%H%M%S)
	@echo "Backup completed"

db-restore:
	@echo "Restoring database from latest backup..."
	@LATEST_BACKUP=$$(ls -t backups/mongodb-* | head -1); \
	if [ -z "$$LATEST_BACKUP" ]; then \
		echo "No backup found"; \
		exit 1; \
	fi; \
	docker cp $$LATEST_BACKUP olympian-mongodb:/tmp/restore && \
	docker exec olympian-mongodb mongorestore /tmp/restore
	@echo "Restore completed"

# Show current environment configuration
show-env:
	@echo "Current environment configuration:"
	@if [ -f .env ]; then \
		echo "DEPLOYMENT_MODE: $$(grep '^DEPLOYMENT_MODE=' .env | cut -d'=' -f2)"; \
		echo "MongoDB: $$(grep '^MONGODB_URI=' .env | cut -d'=' -f2- | head -c 50)..."; \
		echo "Ollama: $$(grep '^OLLAMA_HOST=' .env | cut -d'=' -f2)"; \
		echo "Port: $$(grep '^APP_PORT=' .env | cut -d'=' -f2 || echo '8080 (default)')"; \
	else \
		echo "No .env file found. Run 'make setup' first."; \
	fi
