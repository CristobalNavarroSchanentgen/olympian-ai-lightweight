# Multi-Host Vision Troubleshooting Guide

This guide helps resolve issues with vision model functionality in multi-host deployments of Olympian AI Lightweight.

## Quick Diagnosis

Run this command to check vision model status:
```bash
curl http://localhost:8080/api/health/vision
```

This will show:
- Ollama connectivity status
- Number of models available
- Number of vision models detected
- Specific vision models found

## Common Issues and Solutions

### Issue 1: No Vision Models Detected

**Symptoms:**
- Vision model dropdown is empty
- Image upload button doesn't work
- `/api/health/vision` shows `visionModelCount: 0`

**Solution:**
1. Connect to your Ollama host machine
2. Install a vision model:
   ```bash
   ollama pull llava:13b
   # Or other vision models:
   ollama pull bakllava
   ollama pull moondream
   ollama pull llama3.2-vision:11b
   ```
3. Verify installation:
   ```bash
   ollama list
   ```
4. Restart the backend container:
   ```bash
   make docker-restart
   ```

### Issue 2: Ollama Connection Failed

**Symptoms:**
- `/api/health/vision` shows `connected: false`
- Error messages about connection timeout

**Solution:**
1. Check your `.env` file has the correct Ollama host:
   ```bash
   OLLAMA_HOST=http://your-ollama-ip:11434
   ```
2. Test Ollama connectivity from backend container:
   ```bash
   docker exec olympian-backend curl -v http://your-ollama-ip:11434/api/tags
   ```
3. Check firewall rules allow port 11434
4. Ensure Ollama is configured to accept external connections:
   ```bash
   # On Ollama host, set environment variable:
   OLLAMA_HOST=0.0.0.0:11434 ollama serve
   ```

### Issue 3: Vision Models Not Showing in UI

**Symptoms:**
- Backend detects vision models but UI doesn't show them
- Console errors in browser

**Solution:**
1. Clear browser cache and reload
2. Check browser console for errors
3. Verify API response:
   ```bash
   curl http://localhost:8080/api/chat/vision-models
   ```
4. If empty array returned despite models being installed, check backend logs:
   ```bash
   make logs-backend | grep -i vision
   ```

## Multi-Host Specific Configuration

### Environment Variables
Ensure these are set correctly in your `.env`:

```bash
# For multi-host deployment
DEPLOYMENT_MODE=multi-host
OLLAMA_HOST=http://192.168.1.100:11434  # Replace with your Ollama server IP
MONGODB_URI=mongodb://192.168.1.101:27017/olympian_ai_lite  # Or use containerized MongoDB
```

### Network Requirements
- Ollama host must be accessible from Docker containers
- Port 11434 must be open on Ollama host
- If using Docker networks, ensure proper routing

### Testing Connectivity

From your Docker host:
```bash
# Test Ollama
curl http://your-ollama-ip:11434/api/tags

# Test from container
docker exec olympian-backend ping your-ollama-ip
docker exec olympian-backend curl http://your-ollama-ip:11434/api/tags
```

## Debugging Steps

1. **Check deployment mode:**
   ```bash
   curl http://localhost:8080/api/health | jq .deploymentMode
   ```

2. **Check service health:**
   ```bash
   curl http://localhost:8080/api/health/services | jq
   ```

3. **Check vision-specific health:**
   ```bash
   curl http://localhost:8080/api/health/vision | jq
   ```

4. **View backend logs:**
   ```bash
   make logs-backend | grep -E "(vision|Vision|VISION|llava|multimodal)"
   ```

5. **Test vision model detection:**
   ```bash
   # List all models
   curl http://localhost:8080/api/chat/models
   
   # List vision models
   curl http://localhost:8080/api/chat/vision-models
   
   # Check specific model capabilities
   curl http://localhost:8080/api/chat/models/llava:13b/capabilities
   ```

## Vision Model Recommendations

For best results in multi-host deployments:

1. **LLaVA 13B** - Best overall performance
   ```bash
   ollama pull llava:13b
   ```

2. **BakLLaVA** - Good balance of speed and quality
   ```bash
   ollama pull bakllava
   ```

3. **Moondream** - Lightweight option
   ```bash
   ollama pull moondream
   ```

4. **Llama 3.2 Vision** - Latest architecture
   ```bash
   ollama pull llama3.2-vision:11b
   ```

## Performance Optimization

For multi-host deployments with vision models:

1. **Allocate sufficient resources on Ollama host:**
   - At least 16GB RAM for vision models
   - GPU recommended for faster processing

2. **Configure Ollama for production:**
   ```bash
   # Set appropriate memory limits
   OLLAMA_MAX_LOADED_MODELS=2
   OLLAMA_NUM_PARALLEL=2
   ```

3. **Use load balancing for multiple Ollama hosts:**
   ```bash
   # In .env
   OLLAMA_HOSTS=http://host1:11434,http://host2:11434
   OLLAMA_LOAD_BALANCER=round-robin
   ```

## Still Having Issues?

1. Enable debug logging:
   ```bash
   LOG_LEVEL=debug make docker-restart
   ```

2. Check the comprehensive logs:
   ```bash
   make logs-backend > backend-debug.log
   ```

3. Open an issue with:
   - Output of `/api/health/vision`
   - Backend logs related to vision
   - Your deployment configuration
   - Ollama version and installed models
