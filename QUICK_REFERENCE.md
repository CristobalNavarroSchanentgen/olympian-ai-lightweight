# Olympian AI Lightweight - Quick Reference

## 🚀 Quick Start (Choose One)

```bash
make quick-dev                    # Local development
make quick-docker-dev             # Docker development  
make quick-docker-same            # Production with Ollama container
make quick-docker-same-existing   # Production with existing Ollama
```

## 📋 Essential Commands

### Start/Stop
```bash
make docker-dev                   # Start Docker dev environment
make docker-down                  # Stop all containers
make docker-restart               # Restart containers
```

### Monitoring
```bash
make health-check                 # Check all services
make show-status                  # Show container status
make logs-frontend                # View nginx/frontend logs
make logs-backend                 # View backend logs
```

### Nginx
```bash
make nginx-test                   # Test nginx configuration
make nginx-reload                 # Reload nginx config
```

### Environment
```bash
make show-env                     # Display current config
make env-docker-same              # Configure for same-host
make env-docker-same-existing     # Configure for existing Ollama
```

### Troubleshooting
```bash
make shell-frontend               # Access frontend container
make shell-backend                # Access backend container
make reset-all                    # Full reset (careful!)
```

## 🌐 Access Points

- **Development**: http://localhost:3000
- **Production**: http://localhost:8080
- **Backend API**: http://localhost:4000/api/health

## 💡 Tips

1. Always use `make` commands - everything is automated!
2. Nginx configuration is automatic - no manual setup needed
3. Use `make help` to see all available commands
4. Check `make show-env` to verify your configuration
5. Logs are your friend: `make logs-frontend` or `make logs-backend`

## 🆘 Common Issues

**Nginx not configured?**
```bash
make nginx-test
make docker-restart
```

**Can't access the app?**
```bash
make health-check
make show-status
```

**Need to start over?**
```bash
make docker-down
make quick-docker-same  # or your preferred setup
```
