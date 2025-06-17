# Troubleshooting Multi-Host Deployment

This guide helps diagnose and resolve common issues with multi-host deployments of Olympian AI Lightweight.

## Common Issues

### 1. Ollama Connection Failed

**Symptoms:**
```
[error]: TypeError: fetch failed
[error]: Cannot ensure vision models - Ollama not connected
[error]: 🔗 Network connection failed to Ollama server:
```

**Causes & Solutions:**

#### Missing Port Number
- **Issue**: Ollama URL doesn't include the port (should be `:11434`)
- **Solution**: Update your `.env` file:
  ```bash
  # Incorrect
  OLLAMA_HOST=http://ollama.prd.ihmn.fr
  
  # Correct
  OLLAMA_HOST=http://ollama.prd.ihmn.fr:11434
  ```

#### DNS Resolution Issues
- **Issue**: Docker containers can't resolve custom hostnames
- **Solution 1**: Use IP address instead:
  ```bash
  OLLAMA_HOST=http://192.168.1.100:11434
  ```
- **Solution 2**: Add hostname to `EXTRA_HOSTS` in `.env`:
  ```bash
  EXTRA_HOSTS=- "ollama.prd.ihmn.fr:192.168.1.100"
  ```

#### Network Connectivity
- **Test from host**:
  ```bash
  curl http://ollama.prd.ihmn.fr:11434/api/tags
  ```
- **Test from container**:
  ```bash
  make exec-backend
  curl http://ollama.prd.ihmn.fr:11434/api/tags
  ```

#### Firewall Issues
- Ensure port 11434 is open on the Ollama host
- Check Docker's iptables rules aren't blocking connections

### 2. MongoDB Connection Issues

**Symptoms:**
```
[error]: Database connection failed
MongoServerError: Authentication failed
```

**Solutions:**
- For external MongoDB, ensure connection string includes auth:
  ```bash
  MONGODB_URI=mongodb://username:password@mongo-host:27017/olympian_ai_lite?authSource=admin
  ```
- For containerized MongoDB (default), use:
  ```bash
  MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite
  ```

### 3. Frontend Can't Connect to Backend

**Symptoms:**
- UI shows "Connection Error"
- Network errors in browser console

**Solutions:**
- Ensure backend port is exposed:
  ```yaml
  backend:
    ports:
      - "4000:4000"
  ```
- Check CORS settings in `.env`:
  ```bash
  ALLOWED_ORIGINS=http://your-domain:8080,http://localhost:8080
  ```

## Diagnostic Commands

### Check Service Status
```bash
# View all container statuses
make status

# Check backend logs
make logs-backend

# Check frontend logs
make logs-frontend

# Check all logs
make logs
```

### Test Connectivity
```bash
# Enter backend container
make exec-backend

# Inside container, test connections:
# Test MongoDB
mongosh $MONGODB_URI --eval "db.adminCommand('ping')"

# Test Ollama
curl $OLLAMA_HOST/api/tags

# Test DNS resolution
nslookup ollama.prd.ihmn.fr
ping -c 3 ollama.prd.ihmn.fr
```

### Network Debugging
```bash
# List Docker networks
docker network ls

# Inspect network configuration
docker network inspect olympian-ai-lightweight_olympian-network

# Check container network settings
docker inspect olympian-backend | grep -A 20 NetworkMode
```

## Configuration Checklist

### For Multi-Host Deployment

1. **`.env` file configured correctly:**
   ```bash
   DEPLOYMENT_MODE=docker-multi-host
   OLLAMA_HOST=http://your-ollama-host:11434  # Include port!
   MONGODB_URI=mongodb://your-mongo-host:27017/olympian_ai_lite
   JWT_SECRET=<generated-secret>
   SESSION_SECRET=<generated-secret>
   ```

2. **External services accessible:**
   - Ollama running on external host with port 11434 open
   - MongoDB (if external) accessible with proper auth
   - Firewall rules allow Docker containers to connect

3. **DNS resolution working:**
   - Use IP addresses OR
   - Configure `EXTRA_HOSTS` in `.env`

4. **Restart services after configuration changes:**
   ```bash
   make down
   make quick-docker-multi
   ```

## Advanced Debugging

### Enable Debug Logging
Add to `.env`:
```bash
LOG_LEVEL=debug
DEBUG=olympian:*
```

### Monitor Resource Usage
```bash
# Check container resources
docker stats

# Check disk usage
docker system df
```

### Clean Restart
```bash
# Stop all services
make down

# Remove volumes (WARNING: deletes data)
make clean-volumes

# Rebuild and start
make build
make quick-docker-multi
```

## Getting Help

If issues persist:

1. Collect diagnostic information:
   ```bash
   make logs-backend > backend.log
   docker inspect olympian-backend > backend-inspect.json
   cat .env | grep -v SECRET > env-sanitized.txt
   ```

2. Check for:
   - Correct Ollama URL format (protocol://host:port)
   - Network connectivity between containers and external services
   - Proper environment variable substitution in docker-compose

3. Create an issue on GitHub with:
   - Error messages from logs
   - Sanitized configuration (remove secrets)
   - Output of diagnostic commands
