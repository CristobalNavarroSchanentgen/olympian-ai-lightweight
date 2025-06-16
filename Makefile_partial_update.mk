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
	@echo ""
	@echo "🌐 Setting up CORS for multi-host..."
	@APP_PORT=$$(grep "^APP_PORT=" .env | cut -d'=' -f2 2>/dev/null || echo "8080"); \
	if grep -q "^ALLOWED_ORIGINS=" .env; then \
		sed -i.bak "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=http://localhost:$$APP_PORT|" .env; \
	else \
		echo "ALLOWED_ORIGINS=http://localhost:$$APP_PORT" >> .env; \
	fi
	@rm -f .env.bak
	@echo ""
	@echo "✅ Interactive multi-host configuration complete!"
	@echo "📋 Configuration summary:"
	@grep "^OLLAMA_HOST=" .env | sed 's/^/  /'
	@grep "^MONGODB_URI=" .env | head -1 | sed 's/^/  /'
	@grep "^ALLOWED_ORIGINS=" .env | sed 's/^/  /'
