# Olympian AI Lightweight Makefile
# Simplifies common development and deployment tasks

.PHONY: help install dev build test lint format clean docker-build docker-dev docker-prod-same docker-prod-multi setup

# Default target
help:
	@echo "Olympian AI Lightweight - Available commands:"
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
	@echo "Setup:"
	@echo "  make setup            Run initial setup"

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
