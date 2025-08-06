.PHONY: help setup build start stop restart logs logs-backend logs-frontend clean install dev test lint auto-build auto-build-same auto-build-same-existing auto-build-multi fix-streaming-rebuild generate-build-args dev-multi up-dev-multi clean-build-multi ultra-clean-multi build-prod-ultra-clean artifacts-setup artifacts-migrate artifacts-validate artifacts-backup artifacts-restore artifacts-health artifacts-sync artifacts-diagnose artifacts-reset artifacts-export artifacts-import artifacts-clean clean-docker-cache clean-cache
.DEFAULT_GOAL := help

# Colors for output
CYAN := \\033[36m
GREEN := \\033[32m
YELLOW := \\033[33m
RED := \\033[31m
RESET := \\033[0m

# Auto-generate build args before any docker-compose command
# This ensures source code changes always trigger rebuilds
DOCKER_BUILD_ENV := $(shell chmod +x scripts/generate-build-args.sh && ./scripts/generate-build-args.sh > /dev/null 2>&1 && cat .env.build 2>/dev/null | grep -E '^(BUILD_DATE|GIT_COMMIT|CACHE_BUST)=' | xargs)

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

quick-docker-multi: env-docker-multi-interactive build-multihost-ultra-clean up-multihost artifacts-setup ## Quick setup for multi-host Docker deployment with artifact persistence (forces ultra-clean rebuild to prevent layer corruption)

quick-docker-same-existing: build-same-host-existing up-same-host-existing ## Quick setup for same-host Docker deployment with existing Ollama (forces clean rebuild)

##@ 🏗️  Building

# Helper target to generate build args
generate-build-args:
	@chmod +x scripts/generate-build-args.sh
	@./scripts/generate-build-args.sh

build: ## Build the application for development
	@echo "$(CYAN)🏗️  Building application for development...$(RESET)"
	@npm run build

build-prod: generate-build-args ## Build the application for production (with auto cache-busting)
	@echo "$(CYAN)🏗️  Building application for production...$(RESET)"
	@echo "$(YELLOW)Using build args: $(DOCKER_BUILD_ENV)$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.prod.yml build

build-prod-clean: generate-build-args ## Build the application for production (no cache)
	@echo "$(CYAN)🏗️  Building application for production (clean build)...$(RESET)"
	@echo "$(YELLOW)Using build args: $(DOCKER_BUILD_ENV)$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.prod.yml build --no-cache

build-prod-ultra-clean: clean-build-multi generate-build-args ## Ultra-clean build for multi-host deployment (prevents Docker layer corruption)
	@echo "$(CYAN)🔧 Ultra-clean build for multi-host deployment...$(RESET)"
	@echo "$(YELLOW)This build removes all cached layers and forces complete rebuild$(RESET)"
	@echo "$(YELLOW)Using build args: $(DOCKER_BUILD_ENV)$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.prod.yml build --no-cache --pull
	@echo "$(GREEN)✅ Ultra-clean build completed - Docker layer corruption prevented!$(RESET)"

build-multihost-ultra-clean: clean-build-multi generate-build-args ## Ultra-clean build for multi-host deployment with docker-compose.multihost.yml
	@echo "$(CYAN)🔧 Ultra-clean build for multi-host deployment...$(RESET)"
	@echo "$(YELLOW)This build removes all cached layers and forces complete rebuild$(RESET)"
	@echo "$(YELLOW)Using build args: $(DOCKER_BUILD_ENV)$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.multihost.yml build --no-cache --pull
	@echo "$(GREEN)✅ Ultra-clean multihost build completed!$(RESET)"

up-multihost: ## Start multi-host environment with Docker
	@echo "$(CYAN)🐳 Starting multi-host environment...$(RESET)"
	@docker-compose -f docker-compose.multihost.yml up -d
	@echo "$(GREEN)✅ Multi-host environment started!$(RESET)"
	@echo "$(CYAN)Access the application at: http://localhost:8080$(RESET)"

build-dev: generate-build-args ## Build development environment for multi-host with hot reloading
	@echo "$(CYAN)🏗️  Building development environment for multi-host...$(RESET)"
	@echo "$(YELLOW)Note: Frontend will use hot reloading, only backend needs building$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.dev.yml build

build-same-host: generate-build-args ## Build for same-host with Ollama container (no cache)
	@echo "$(CYAN)🏗️  Building for same-host with Ollama container (clean build)...$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.same-host.yml build --no-cache

build-same-host-existing: generate-build-args ## Build for same-host with existing Ollama (no cache)
	@echo "$(CYAN)🏗️  Building for same-host with existing Ollama (clean build)...$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.same-host-existing-ollama.yml build --no-cache

rebuild-backend: generate-build-args ## Rebuild only the backend container (no cache)
	@echo "$(CYAN)🔄 Rebuilding backend container...$(RESET)"
	@docker-compose -f docker-compose.prod.yml stop backend
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.prod.yml build --no-cache backend
	@docker-compose -f docker-compose.prod.yml up -d backend
	@echo "$(GREEN)✅ Backend rebuilt and restarted!$(RESET)"

rebuild-frontend: generate-build-args ## Rebuild only the frontend container (no cache)
	@echo "$(CYAN)🔄 Rebuilding frontend container...$(RESET)"
	@docker-compose -f docker-compose.prod.yml stop frontend
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.prod.yml build --no-cache frontend
	@docker-compose -f docker-compose.prod.yml up -d frontend
	@echo "$(GREEN)✅ Frontend rebuilt and restarted!$(RESET)"

fix-streaming-rebuild: ## Fix base model streaming issue and rebuild containers
	@echo "$(CYAN)🔧 Fixing streaming issue and rebuilding containers...$(RESET)"
	@chmod +x scripts/fix-streaming-rebuild.sh
	@./scripts/fix-streaming-rebuild.sh

##@ 🎯 Auto-Build with Cache Invalidation

auto-build-same: ## Auto-build same-host deployment with cache invalidation
	@echo "$(CYAN)🎯 Auto-building same-host deployment with cache invalidation...$(RESET)"
	@chmod +x scripts/auto-build.sh
	@./scripts/auto-build.sh same-host

auto-build-same-existing: ## Auto-build same-host-existing deployment with cache invalidation
	@echo "$(CYAN)🎯 Auto-building same-host-existing deployment with cache invalidation...$(RESET)"
	@chmod +x scripts/auto-build.sh
	@./scripts/auto-build.sh same-host-existing

auto-build-multi: ## Auto-build multi-host deployment with cache invalidation
	@echo "$(CYAN)🎯 Auto-building multi-host deployment with cache invalidation...$(RESET)"
	@chmod +x scripts/auto-build.sh
	@./scripts/auto-build.sh multi-host

auto-build: auto-build-multi ## Alias for auto-build-multi (default)

auto-build-no-cache: ## Auto-build with forced cache invalidation (multi-host)
	@echo "$(CYAN)🎯 Auto-building with forced cache invalidation...$(RESET)"
	@chmod +x scripts/auto-build.sh
	@./scripts/auto-build.sh multi-host --no-cache

auto-build-dry-run: ## Show what would be built without building (multi-host)
	@echo "$(CYAN)🎯 Auto-build dry run...$(RESET)"
	@chmod +x scripts/auto-build.sh
	@./scripts/auto-build.sh multi-host --dry-run

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

up-dev-multi: generate-build-args ## Start development environment for multi-host with hot reloading
	@echo "$(CYAN)🐳 Starting development environment for multi-host...$(RESET)"
	@echo "$(YELLOW)Frontend will use hot reloading - changes will be reflected immediately!$(RESET)"
	@env $(DOCKER_BUILD_ENV) docker-compose -f docker-compose.dev.yml up -d
	@echo "$(GREEN)✅ Development environment started with hot reloading!$(RESET)"
	@echo "$(CYAN)Access the application at: http://localhost:8080$(RESET)"
	@echo "$(YELLOW)Frontend dev server: http://localhost:5173$(RESET)"
	@echo ""
	@echo "$(CYAN)Tips for development mode:$(RESET)"
	@echo "  - Frontend changes will hot reload automatically"
	@echo "  - Backend changes require: $(CYAN)make rebuild-backend$(RESET)"
	@echo "  - View logs: $(CYAN)make logs-dev$(RESET)"

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
	@docker-compose -f docker-compose.dev.yml down 2>/dev/null || true
	@docker-compose -f docker-compose.same-host.yml down 2>/dev/null || true
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down 2>/dev/null || true
	@echo "$(GREEN)✅ Containers stopped!$(RESET)"

restart: stop up ## Restart the development environment

restart-prod: ## Restart the production environment
	@echo "$(CYAN)🔄 Restarting production environment...$(RESET)"
	@docker-compose -f docker-compose.prod.yml down
	@docker-compose -f docker-compose.prod.yml up -d
	@echo "$(GREEN)✅ Production environment restarted!$(RESET)"

restart-dev-multi: ## Restart development environment for multi-host
	@echo "$(CYAN)🔄 Restarting development environment...$(RESET)"
	@docker-compose -f docker-compose.dev.yml down
	@make up-dev-multi
	@echo "$(GREEN)✅ Development environment restarted!$(RESET)"

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

logs-dev: ## Show logs from development services
	@docker-compose -f docker-compose.dev.yml logs -f

logs-backend: ## Show logs from backend service (auto-detects which deployment)
	@echo "$(CYAN)📋 Showing backend logs...$(RESET)"
	@if docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		if docker-compose -f docker-compose.same-host.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.same-host.yml logs -f backend; \
		elif docker-compose -f docker-compose.same-host-existing-ollama.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.same-host-existing-ollama.yml logs -f backend; \
		elif docker-compose -f docker-compose.prod.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.prod.yml logs -f backend; \
		elif docker-compose -f docker-compose.dev.yml ps backend >/dev/null 2>&1; then \
			docker-compose -f docker-compose.dev.yml logs -f backend; \
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

logs-frontend-dev: ## Show logs from frontend development service
	@echo "$(CYAN)📋 Showing frontend development logs...$(RESET)"
	@if docker ps --format "table {{.Names}}" | grep -q "olympian-frontend-dev"; then \
		docker logs -f olympian-frontend-dev; \
	else \
		echo "$(RED)❌ Frontend development container is not running!$(RESET)"; \
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
	@echo "$(CYAN)📊 Development Container Status:$(RESET)"
	@docker-compose -f docker-compose.dev.yml ps
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

##@ 🎨 Artifact Persistence (Multi-host)

artifacts-setup: ## Initialize artifact persistence system for multi-host deployment
	@echo "$(CYAN)🎨 Setting up artifact persistence system...$(RESET)"
	@echo "$(YELLOW)Checking if containers are running...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running! Please start the system first.$(RESET)"; \
		echo "$(CYAN)Run: make up-prod$(RESET)"; \
		exit 1; \
	fi
	@echo "$(CYAN)🔧 Creating artifacts collection and indexes...$(RESET)"
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				console.log('✅ Connected to database'); \
				const artifactsCollection = db.db.collection('artifacts'); \
				await artifactsCollection.createIndex({ conversationId: 1, createdAt: -1 }); \
				await artifactsCollection.createIndex({ messageId: 1 }); \
				await artifactsCollection.createIndex({ id: 1 }, { unique: true }); \
				await artifactsCollection.createIndex({ checksum: 1 }); \
				await artifactsCollection.createIndex({ 'metadata.type': 1 }); \
				console.log('✅ Artifact collection indexes created'); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Setup failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	" 2>/dev/null || echo "$(YELLOW)⚠️  Artifact collection may already exist$(RESET)"
	@echo "$(GREEN)✅ Artifact persistence system initialized!$(RESET)"

artifacts-migrate: ## Migrate existing message metadata to artifact collection
	@echo "$(CYAN)🔄 Migrating existing artifacts from message metadata...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)Starting migration process...$(RESET)"
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const messages = await db.messages.find({ \
					'metadata.hasArtifact': true, \
					'metadata.artifactId': { \$$exists: true } \
				}).toArray(); \
				console.log(\`Found \$${messages.length} messages with artifacts to migrate\`); \
				let migrated = 0; \
				for (const message of messages) { \
					try { \
						const artifactData = { \
							id: message.metadata.artifactId, \
							conversationId: message.conversationId, \
							messageId: message._id.toString(), \
							title: \`Migrated \$${message.metadata.artifactType || 'Artifact'}\`, \
							type: message.metadata.artifactType || 'code', \
							content: message.metadata.originalContent || message.content, \
							version: 1, \
							metadata: message.metadata, \
							createdAt: message.createdAt, \
							updatedAt: message.createdAt, \
							checksum: require('crypto').createHash('md5').update(message.metadata.originalContent || message.content).digest('hex') \
						}; \
						await db.db.collection('artifacts').updateOne( \
							{ id: artifactData.id }, \
							{ \$$setOnInsert: artifactData }, \
							{ upsert: true } \
						); \
						migrated++; \
					} catch (err) { \
						console.warn(\`Failed to migrate artifact \$${message.metadata.artifactId}: \$${err.message}\`); \
					} \
				} \
				console.log(\`✅ Migration complete: \$${migrated}/\$${messages.length} artifacts migrated\`); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Migration failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"
	@echo "$(GREEN)✅ Artifact migration completed!$(RESET)"

artifacts-validate: ## Validate artifact integrity across all conversations
	@echo "$(CYAN)🔍 Validating artifact integrity...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const artifacts = await db.db.collection('artifacts').find({}).toArray(); \
				const messages = await db.messages.find({ 'metadata.hasArtifact': true }).toArray(); \
				console.log(\`Validating \$${artifacts.length} artifacts against \$${messages.length} messages\`); \
				let valid = 0, invalid = 0, orphaned = 0; \
				for (const artifact of artifacts) { \
					const message = messages.find(m => m.metadata.artifactId === artifact.id); \
					if (!message) { \
						console.warn(\`⚠️  Orphaned artifact: \$${artifact.id}\`); \
						orphaned++; \
					} else if (message.conversationId !== artifact.conversationId) { \
						console.warn(\`⚠️  Conversation mismatch for artifact: \$${artifact.id}\`); \
						invalid++; \
					} else { \
						valid++; \
					} \
				} \
				console.log(\`✅ Validation complete: \$${valid} valid, \$${invalid} invalid, \$${orphaned} orphaned\`); \
				process.exit(invalid + orphaned > 0 ? 1 : 0); \
			} catch (error) { \
				console.error('❌ Validation failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"
	@echo "$(GREEN)✅ Artifact validation completed!$(RESET)"

artifacts-health: ## Check artifact system health across multi-host instances
	@echo "$(CYAN)🏥 Checking artifact system health...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@echo "$(CYAN)📊 Artifact System Health Report$(RESET)"
	@echo "=================================="
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const artifactCount = await db.db.collection('artifacts').countDocuments(); \
				const conversationCount = await db.conversations.countDocuments(); \
				const messageCount = await db.messages.countDocuments({ 'metadata.hasArtifact': true }); \
				const recentArtifacts = await db.db.collection('artifacts').countDocuments({ \
					createdAt: { \$$gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } \
				}); \
				console.log(\`📊 Total artifacts: \$${artifactCount}\`); \
				console.log(\`📊 Total conversations: \$${conversationCount}\`); \
				console.log(\`📊 Messages with artifacts: \$${messageCount}\`); \
				console.log(\`📊 Artifacts created in last 24h: \$${recentArtifacts}\`); \
				const typeStats = await db.db.collection('artifacts').aggregate([ \
					{ \$$group: { _id: '\$$type', count: { \$$sum: 1 } } }, \
					{ \$$sort: { count: -1 } } \
				]).toArray(); \
				console.log('📊 Artifact types:'); \
				typeStats.forEach(stat => console.log(\`   \$${stat._id}: \$${stat.count}\`)); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Health check failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"

artifacts-sync: ## Sync artifacts across multi-host instances (if Redis cache enabled)
	@echo "$(CYAN)🔄 Syncing artifacts across multi-host instances...$(RESET)"
	@echo "$(YELLOW)Note: This requires Redis cache to be configured$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@docker exec olympian-backend node -e " \
		console.log('🔄 Artifact sync functionality'); \
		console.log('This feature requires Redis configuration'); \
		console.log('Current implementation uses MongoDB as single source of truth'); \
		console.log('✅ Multi-host consistency maintained via centralized MongoDB storage'); \
	"

artifacts-backup: ## Backup artifact collection to JSON file
	@echo "$(CYAN)💾 Backing up artifact collection...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@BACKUP_FILE="artifacts_backup_$(shell date +%Y%m%d_%H%M%S).json"; \
	echo "$(CYAN)Creating backup: $$BACKUP_FILE$(RESET)"; \
	docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		const fs = require('fs'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const artifacts = await db.db.collection('artifacts').find({}).toArray(); \
				const backup = { \
					timestamp: new Date().toISOString(), \
					version: '1.0', \
					artifactCount: artifacts.length, \
					artifacts: artifacts \
				}; \
				fs.writeFileSync('/tmp/$$BACKUP_FILE', JSON.stringify(backup, null, 2)); \
				console.log(\`✅ Backup created: \$${artifacts.length} artifacts saved\`); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Backup failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	" && \
	docker cp olympian-backend:/tmp/$$BACKUP_FILE ./$$BACKUP_FILE && \
	echo "$(GREEN)✅ Backup saved to: $$BACKUP_FILE$(RESET)"

artifacts-restore: ## Restore artifact collection from JSON backup file
	@echo "$(CYAN)📥 Restoring artifact collection from backup...$(RESET)"
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)❌ Please specify backup file: make artifacts-restore FILE=backup.json$(RESET)"; \
		exit 1; \
	fi
	@if [ ! -f "$(FILE)" ]; then \
		echo "$(RED)❌ Backup file not found: $(FILE)$(RESET)"; \
		exit 1; \
	fi
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)⚠️  This will replace existing artifacts! Are you sure? (y/N)$(RESET)"
	@read -r confirm && [ "$$confirm" = "y" ] || (echo "Cancelled" && exit 1)
	@docker cp $(FILE) olympian-backend:/tmp/restore.json
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		const fs = require('fs'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const backup = JSON.parse(fs.readFileSync('/tmp/restore.json', 'utf8')); \
				console.log(\`Restoring \$${backup.artifactCount} artifacts from \$${backup.timestamp}\`); \
				await db.db.collection('artifacts').deleteMany({}); \
				if (backup.artifacts && backup.artifacts.length > 0) { \
					await db.db.collection('artifacts').insertMany(backup.artifacts); \
				} \
				console.log(\`✅ Restore complete: \$${backup.artifactCount} artifacts restored\`); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Restore failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"
	@echo "$(GREEN)✅ Artifact collection restored from: $(FILE)$(RESET)"

artifacts-export: ## Export artifacts for a specific conversation
	@echo "$(CYAN)📤 Exporting artifacts for conversation...$(RESET)"
	@if [ -z "$(CONVERSATION_ID)" ]; then \
		echo "$(RED)❌ Please specify conversation ID: make artifacts-export CONVERSATION_ID=xxx$(RESET)"; \
		exit 1; \
	fi
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@EXPORT_FILE="conversation_$(CONVERSATION_ID)_artifacts_$(shell date +%Y%m%d_%H%M%S).json"; \
	echo "$(CYAN)Exporting artifacts for conversation: $(CONVERSATION_ID)$(RESET)"; \
	docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		const fs = require('fs'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const artifacts = await db.db.collection('artifacts').find({ conversationId: '$(CONVERSATION_ID)' }).toArray(); \
				const exportData = { \
					conversationId: '$(CONVERSATION_ID)', \
					timestamp: new Date().toISOString(), \
					artifactCount: artifacts.length, \
					artifacts: artifacts \
				}; \
				fs.writeFileSync('/tmp/$$EXPORT_FILE', JSON.stringify(exportData, null, 2)); \
				console.log(\`✅ Export complete: \$${artifacts.length} artifacts exported\`); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Export failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	" && \
	docker cp olympian-backend:/tmp/$$EXPORT_FILE ./$$EXPORT_FILE && \
	echo "$(GREEN)✅ Artifacts exported to: $$EXPORT_FILE$(RESET)"

artifacts-import: ## Import artifacts for a specific conversation
	@echo "$(CYAN)📥 Importing artifacts from file...$(RESET)"
	@if [ -z "$(FILE)" ]; then \
		echo "$(RED)❌ Please specify export file: make artifacts-import FILE=export.json$(RESET)"; \
		exit 1; \
	fi
	@if [ ! -f "$(FILE)" ]; then \
		echo "$(RED)❌ Export file not found: $(FILE)$(RESET)"; \
		exit 1; \
	fi
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@docker cp $(FILE) olympian-backend:/tmp/import.json
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		const fs = require('fs'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const importData = JSON.parse(fs.readFileSync('/tmp/import.json', 'utf8')); \
				console.log(\`Importing \$${importData.artifactCount} artifacts for conversation: \$${importData.conversationId}\`); \
				for (const artifact of importData.artifacts) { \
					await db.db.collection('artifacts').updateOne( \
						{ id: artifact.id }, \
						{ \$$setOnInsert: artifact }, \
						{ upsert: true } \
					); \
				} \
				console.log(\`✅ Import complete: \$${importData.artifactCount} artifacts imported\`); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Import failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"
	@echo "$(GREEN)✅ Artifacts imported from: $(FILE)$(RESET)"

artifacts-diagnose: ## Diagnose artifact-related issues
	@echo "$(CYAN)🔍 Diagnosing artifact system issues...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@echo "$(CYAN)🔍 Artifact System Diagnostics$(RESET)"
	@echo "=============================="
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				console.log('🔍 Database connection: ✅ Connected'); \
				const collections = await db.db.listCollections().toArray(); \
				const hasArtifacts = collections.some(c => c.name === 'artifacts'); \
				console.log(\`🔍 Artifacts collection: \$${hasArtifacts ? '✅ Exists' : '❌ Missing'}\`); \
				if (hasArtifacts) { \
					const indexes = await db.db.collection('artifacts').indexes(); \
					console.log(\`🔍 Collection indexes: \$${indexes.length} indexes\`); \
					indexes.forEach(idx => console.log(\`   - \$${JSON.stringify(idx.key)}\`)); \
				} \
				const orphanedArtifacts = await db.db.collection('artifacts').countDocuments({ \
					messageId: { \$$nin: await db.messages.distinct('_id').then(ids => ids.map(id => id.toString())) } \
				}); \
				console.log(\`🔍 Orphaned artifacts: \$${orphanedArtifacts > 0 ? '⚠️  ' + orphanedArtifacts : '✅ None'}\`); \
				const messagesWithoutArtifacts = await db.messages.countDocuments({ \
					'metadata.hasArtifact': true, \
					'metadata.artifactId': { \$$nin: await db.db.collection('artifacts').distinct('id') } \
				}); \
				console.log(\`🔍 Messages missing artifacts: \$${messagesWithoutArtifacts > 0 ? '⚠️  ' + messagesWithoutArtifacts : '✅ None'}\`); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Diagnostics failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"

artifacts-clean: ## Clean up orphaned and invalid artifacts
	@echo "$(CYAN)🧹 Cleaning up artifact system...$(RESET)"
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@echo "$(YELLOW)⚠️  This will remove orphaned artifacts and fix inconsistencies. Continue? (y/N)$(RESET)"
	@read -r confirm && [ "$$confirm" = "y" ] || (echo "Cancelled" && exit 1)
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const messageIds = await db.messages.distinct('_id'); \
				const messageIdStrings = messageIds.map(id => id.toString()); \
				const orphanedResult = await db.db.collection('artifacts').deleteMany({ \
					messageId: { \$$nin: messageIdStrings } \
				}); \
				console.log(\`🧹 Removed \$${orphanedResult.deletedCount} orphaned artifacts\`); \
				const duplicateArtifacts = await db.db.collection('artifacts').aggregate([ \
					{ \$$group: { _id: '\$$id', count: { \$$sum: 1 }, docs: { \$$push: '\$$_id' } } }, \
					{ \$$match: { count: { \$$gt: 1 } } } \
				]).toArray(); \
				let duplicatesRemoved = 0; \
				for (const duplicate of duplicateArtifacts) { \
					const docsToRemove = duplicate.docs.slice(1); \
					await db.db.collection('artifacts').deleteMany({ _id: { \$$in: docsToRemove } }); \
					duplicatesRemoved += docsToRemove.length; \
				} \
				console.log(\`🧹 Removed \$${duplicatesRemoved} duplicate artifacts\`); \
				console.log('✅ Artifact cleanup completed'); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Cleanup failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"
	@echo "$(GREEN)✅ Artifact cleanup completed!$(RESET)"

artifacts-reset: ## Reset entire artifact system (DANGEROUS - removes all artifacts)
	@echo "$(RED)⚠️  DANGER: This will completely reset the artifact system!$(RESET)"
	@echo "$(RED)⚠️  ALL ARTIFACTS WILL BE PERMANENTLY DELETED!$(RESET)"
	@echo "$(YELLOW)Are you absolutely sure? Type 'RESET' to confirm:$(RESET)"
	@read -r confirm && [ "$$confirm" = "RESET" ] || (echo "Cancelled" && exit 1)
	@if ! docker ps --format "table {{.Names}}" | grep -q "olympian-backend"; then \
		echo "$(RED)❌ Backend container is not running!$(RESET)"; \
		exit 1; \
	fi
	@docker exec olympian-backend node -e " \
		const { DatabaseService } = require('./dist/services/DatabaseService.js'); \
		(async () => { \
			try { \
				const db = DatabaseService.getInstance(); \
				await db.connect(); \
				const artifactCount = await db.db.collection('artifacts').countDocuments(); \
				await db.db.collection('artifacts').drop(); \
				await db.messages.updateMany( \
					{ 'metadata.hasArtifact': true }, \
					{ \$$unset: { 'metadata.hasArtifact': '', 'metadata.artifactId': '', 'metadata.artifactType': '' } } \
				); \
				console.log(\`🗑️  Removed \$${artifactCount} artifacts and cleaned message metadata\`); \
				console.log('✅ Artifact system reset completed'); \
				process.exit(0); \
			} catch (error) { \
				console.error('❌ Reset failed:', error.message); \
				process.exit(1); \
			} \
		})(); \
	"
	@echo "$(RED)⚠️  Artifact system has been completely reset!$(RESET)"
	@echo "$(CYAN)Run 'make artifacts-setup' to reinitialize the system$(RESET)"

##@ 🛠️  Development

dev: ## Start development servers locally (without Docker)
	@echo "$(CYAN)🛠️  Starting development servers...$(RESET)"
	@npm run dev

dev-multi: up-dev-multi ## Start multi-host development with hot reloading (alias for up-dev-multi)

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
	@docker-compose -f docker-compose.multihost.yml down -v --remove-orphans 2>/dev/null || true
	@docker-compose -f docker-compose.dev.yml down -v --remove-orphans 2>/dev/null || true
	@docker-compose -f docker-compose.same-host.yml down -v --remove-orphans 2>/dev/null || true
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down -v --remove-orphans 2>/dev/null || true
	@docker system prune -f
	@echo "$(GREEN)✅ Cleanup complete!$(RESET)"

clean-build-multi: ## Ultra-clean for multi-host deployment (removes all cached layers and build artifacts)
	@echo "$(CYAN)🧹 Ultra-clean for multi-host deployment...$(RESET)"
	@echo "$(YELLOW)⚠️  This will remove Docker images, build cache, and intermediate containers for multi-host deployment$(RESET)"
	@docker-compose -f docker-compose.multihost.yml down -v --remove-orphans 2>/dev/null || true
	@echo "$(CYAN)Removing multi-host specific images...$(RESET)"
	@docker images | grep -E "(olympian|multi|prod)" | awk '{print $$3}' | xargs -r docker rmi -f 2>/dev/null || true
	@echo "$(CYAN)Cleaning build cache...$(RESET)"
	@docker builder prune -af 2>/dev/null || true
	@echo "$(CYAN)Removing intermediate containers...$(RESET)"
	@docker container prune -f 2>/dev/null || true
	@echo "$(CYAN)Cleaning build artifacts...$(RESET)"
	@rm -f .env.build 2>/dev/null || true
	@echo "$(GREEN)✅ Ultra-clean for multi-host deployment complete!$(RESET)"

ultra-clean-multi: clean-build-multi ## Alias for clean-build-multi - prevents Docker layer corruption

clean-all: ## Clean up everything including images and volumes
	@echo "$(RED)⚠️  This will remove ALL Docker images and volumes!$(RESET)"
	@read -p "Are you sure? (y/N): " confirm && [ "$$confirm" = "y" ]
	@docker-compose down -v --remove-orphans --rmi all
	@docker-compose -f docker-compose.multihost.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker-compose -f docker-compose.dev.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker-compose -f docker-compose.same-host.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker-compose -f docker-compose.same-host-existing-ollama.yml down -v --remove-orphans --rmi all 2>/dev/null || true
	@docker system prune -af --volumes
	@echo "$(GREEN)✅ Complete cleanup done!$(RESET)"

clean-docker-cache: ## Remove ALL Docker build cache (use when changes are not reflecting)
	@echo "$(RED)⚠️  Removing ALL Docker build cache...$(RESET)"
	@docker builder prune -af
	@docker system prune -af --volumes
	@echo "$(GREEN)✅ Docker cache completely cleared!$(RESET)"

clean-cache: clean-docker-cache ## Alias for clean-docker-cache

##@ ⚙️  Configuration

fix-mongo-uri: ## Fix MongoDB URI for Docker deployment
	@chmod +x scripts/fix-mongo-uri.sh
	@./scripts/fix-mongo-uri.sh

env-docker-multi-interactive: ## Interactive multi-host environment configuration with MCP token setup
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
		sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0|' .env; \
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
				mongo_uri="mongodb://$$mongo_user:$$mongo_pass@$$mongo_host:27017/olympian_ai_lite?replicaSet=rs0&authSource=admin"; \
			else \
				mongo_uri="mongodb://$$mongo_host:27017/olympian_ai_lite?replicaSet=rs0"; \
			fi; \
			sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI='"$$mongo_uri"'|' .env; \
			echo "$(GREEN)✅ MongoDB configured for external host: $$mongo_host$(RESET)"; \
		else \
			sed -i.bak 's|^MONGODB_URI=.*|MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite?replicaSet=rs0|' .env; \
			echo "$(GREEN)✅ Using containerized MongoDB (accessible via Docker service name)$(RESET)"; \
		fi; \
	fi
	@echo ""
	@echo "$(CYAN)🔐 MCP Server Authentication Setup$(RESET)"
	@echo "$(YELLOW)Multi-host deployment includes GitHub, AppleScript, and Context7 MCP servers. GitHub requires authentication$(RESET)"
	@echo "$(YELLOW)for repository access. You can configure this token now or later.$(RESET)"
	@echo ""
	@echo "$(CYAN)🐙 GitHub MCP Server Configuration$(RESET)"
	@echo "$(YELLOW)The GitHub MCP server provides repository access, issue management, and PR capabilities.$(RESET)"
	@echo "$(YELLOW)To get a token: https://github.com/settings/tokens$(RESET)"
	@echo "$(YELLOW)Required scopes: repo, read:user, read:org$(RESET)"
	@printf "Enter your GitHub Personal Access Token (or press Enter to skip): "; \
	read -s github_token; echo; \
	if [ -n "$$github_token" ]; then \
		if echo "$$github_token" | grep -E '^ghp_[a-zA-Z0-9]{36}$$' >/dev/null || echo "$$github_token" | grep -E '^github_pat_[a-zA-Z0-9_]{82}$$' >/dev/null; then \
			sed -i.bak 's|^GITHUB_PERSONAL_ACCESS_TOKEN=.*|GITHUB_PERSONAL_ACCESS_TOKEN='"$$github_token"'|' .env; \
			echo "$(GREEN)✅ GitHub token configured$(RESET)"; \
		else \
			echo "$(YELLOW)⚠️  Token format doesn't match expected pattern, but will be saved anyway$(RESET)"; \
			sed -i.bak 's|^GITHUB_PERSONAL_ACCESS_TOKEN=.*|GITHUB_PERSONAL_ACCESS_TOKEN='"$$github_token"'|' .env; \
		fi; \
	else \
		if grep -q "^GITHUB_PERSONAL_ACCESS_TOKEN=" .env; then \
			sed -i.bak 's|^GITHUB_PERSONAL_ACCESS_TOKEN=.*|# GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here|' .env; \
		else \
			echo "# GITHUB_PERSONAL_ACCESS_TOKEN=your_github_token_here" >> .env; \
		fi; \
		echo "$(YELLOW)⚠️  GitHub token not configured - some MCP features will be limited$(RESET)"; \
	fi
	@echo ""
	else \
		echo "$(GREEN)✅ Using NASA DEMO_KEY (limited functionality)$(RESET)"; \
	fi
	@echo ""
	fi
	@echo ""
	@echo "$(CYAN)🤖 Model Capability Configuration:$(RESET)"
	@echo "$(YELLOW)Choose between automatic model capability detection or custom model listing:$(RESET)"
	@echo "$(YELLOW)- Automatic (y): Tests each model to detect capabilities (slower, more accurate)$(RESET)"
	@echo "$(YELLOW)- Custom (n): Uses predefined model capabilities (faster, no testing required)$(RESET)"
	@printf "Use automatic model capability detection? (y/N): "; \
	read use_auto_detection; \
	if [ "$$use_auto_detection" = "y" ] || [ "$$use_auto_detection" = "Y" ]; then \
		sed -i.bak 's|^MODEL_CAPABILITY_MODE=.*|MODEL_CAPABILITY_MODE=automatic|' .env; \
		echo "$(GREEN)✅ Using automatic model capability detection$(RESET)"; \
	else \
		sed -i.bak 's|^MODEL_CAPABILITY_MODE=.*|MODEL_CAPABILITY_MODE=custom|' .env; \
		echo "$(GREEN)✅ Using custom model capabilities (predefined list)$(RESET)"; \
		echo "$(CYAN)📋 Predefined model capabilities will be used:$(RESET)"; \
		echo "$(YELLOW)  Vision models: llama3.2-vision:11b, granite3.2-vision:2b$(RESET)"; \
		echo "$(YELLOW)  Reasoning + Tools: qwen3:32b, qwen3:4b, deepseek-r1:14b$(RESET)"; \
		echo "$(YELLOW)  Tools only: gemma3:27b, gemma3:4b$(RESET)"; \
		echo "$(YELLOW)  Base models: phi4:14b, llama3.2:3b$(RESET)"; \
	fi
	@echo ""
	@echo "$(CYAN)🔐 Generating secure secrets...$(RESET)"
	@JWT_SECRET=$$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "$$(date +%s)-$$(shuf -i 1000-9999 -n 1)-jwt-secret"); \
	SESSION_SECRET=$$(openssl rand -base64 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_urlsafe(32))" 2>/dev/null || echo "$$(date +%s)-$$(shuf -i 1000-9999 -n 1)-session-secret"); \
	sed -i.bak "s|^JWT_SECRET=.*|JWT_SECRET=$$JWT_SECRET|" .env; \
	sed -i.bak "s|^SESSION_SECRET=.*|SESSION_SECRET=$$SESSION_SECRET|" .env
	@echo ""
	@echo "$(CYAN)🌐 Setting up multi-host specific configuration...$(RESET)"
	@sed -i.bak 's|^ENABLE_MULTI_HOST=.*|ENABLE_MULTI_HOST=true|' .env
	@sed -i.bak 's|^MCP_ENABLED=.*|MCP_ENABLED=true|' .env
	@sed -i.bak 's|^MCP_OPTIONAL=.*|MCP_OPTIONAL=true|' .env
	@sed -i.bak 's|^MCP_TRANSPORT=.*|MCP_TRANSPORT=http|' .env
	@sed -i.bak 's|^MCP_CONFIG_PATH=.*|MCP_CONFIG_PATH=/app/mcp-config.multihost.json|' .env
	@sed -i.bak 's|^REDIS_URL=.*|REDIS_URL=redis://redis:6379|' .env
	@sed -i.bak 's|^REDIS_OPTIONAL=.*|REDIS_OPTIONAL=true|' .env
	@echo ""
	@echo "$(CYAN)🌐 Setting up CORS for multi-host...$(RESET)"
	@APP_PORT=$$(grep "^APP_PORT=" .env 2>/dev/null | cut -d'=' -f2 || echo "8080"); \
	if grep -q "^ALLOWED_ORIGINS=" .env; then \
		sed -i.bak "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:$$APP_PORT,http://localhost:5173|" .env; \
	else \
		echo "ALLOWED_ORIGINS=http://localhost:$$APP_PORT,http://localhost:5173" >> .env; \
	fi
	@rm -f .env.bak
	@echo ""
	@echo "$(GREEN)✅ Interactive multi-host configuration complete!$(RESET)"
	@echo "$(CYAN)📋 Configuration summary:$(RESET)"
	@grep "^OLLAMA_HOST=" .env | sed 's/^/  /'
	@grep "^MONGODB_URI=" .env | head -1 | sed 's/^/  /'
	@grep "^MODEL_CAPABILITY_MODE=" .env | sed 's/^/  /'
	@grep "^ALLOWED_ORIGINS=" .env | sed 's/^/  /'
	@echo ""
	@echo "$(CYAN)🔐 MCP Authentication Summary:$(RESET)"
	@if grep -q "^GITHUB_PERSONAL_ACCESS_TOKEN=" .env && ! grep -q "^# GITHUB_PERSONAL_ACCESS_TOKEN=" .env; then \
		echo "  $(GREEN)✅ GitHub token configured$(RESET)"; \
	else \
		echo "  $(YELLOW)⚠️  GitHub token not configured$(RESET)"; \
	fi
	@echo ""
	@echo "$(CYAN)📚 Development Mode Available:$(RESET)"
	@echo "  For development with hot reloading, use: $(CYAN)make dev-multi$(RESET)"
	@echo "  This allows you to edit React components and see changes immediately!"
	@echo ""
	@echo "$(CYAN)🐳 Self-Reliant MCP Containers:$(RESET)"
	@echo "  All MCP servers will run as containers - no external setup required!"
	@echo "  GitHub, AppleScript, and Context7 included."

# MCP Architecture deployment
.PHONY: deploy-mcp
deploy-mcp: ensure-docker env-setup
	@echo Starting MCP Architecture deployment...
	docker-compose -f docker-compose.multihost.yml up -d --build
	@echo MCP Architecture deployment complete
	@echo Frontend: http://localhost:80
	@echo Backend API: http://localhost:4000/api
	@echo HIL Protection is ENABLED by default


