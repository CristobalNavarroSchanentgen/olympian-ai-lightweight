# Vision Detection Quick Reference

## 🔍 8-Method Detection System (Priority Order)

| Method | Reliability | What It Checks | Code Location |
|--------|-------------|----------------|---------------|
| 1. **Modalities Field** | ⭐⭐⭐⭐⭐ | `modelInfo.modalities` contains vision patterns | `hasVisionSupport()` |
| 2. **Config Modalities** | ⭐⭐⭐⭐⭐ | `modelInfo.config.modalities` contains vision patterns | `hasVisionSupport()` |
| 3. **Capabilities Flag** | ⭐⭐⭐⭐⭐ | `modelInfo.capabilities.image_processing === true` | `hasVisionSupport()` |
| 4. **Vision Components** | ⭐⭐⭐⭐ | Presence of `vision_encoder` or `image_processor` | `hasVisionSupport()` |
| 5. **Architecture** | ⭐⭐⭐⭐ | Known vision architectures (llava, clip, etc.) | `hasVisionSupport()` |
| 6. **Model Families** | ⭐⭐⭐⭐ | Model belongs to vision family | `hasVisionSupport()` |
| 7. **Modelfile Patterns** | ⭐⭐⭐ | Specific vision config in modelfile | `hasVisionSupport()` |
| 8. **Name Patterns** | ⭐⭐ | Model name contains vision keywords (fallback) | `hasVisionSupport()` |

## 🚀 Quick API Calls

### Check Model Capabilities
```bash
# Direct API call to Ollama
curl -X POST http://localhost:11434/api/show \
  -H "Content-Type: application/json" \
  -d '{"name": "llava:13b"}'

# Through Olympian API (gets detected capabilities)
curl http://localhost:4000/api/chat/models/llava:13b/capabilities
```

### List Available Vision Models
```bash
# Get all detected vision models
curl http://localhost:4000/api/chat/vision-models

# Check what Ollama sees directly
curl http://localhost:11434/api/tags
```

### Debug Detection Process
```bash
# View detection logs
docker logs olympian-backend | grep "Vision detection"

# Get detection details for specific model
docker logs olympian-backend | grep "llava:13b"
```

## 🐛 Common Troubleshooting

### Vision Model Not Detected
```bash
# 1. Check if model exists in Ollama
ollama list | grep llava

# 2. Check model info directly
curl -X POST http://localhost:11434/api/show \
  -H "Content-Type: application/json" \
  -d '{"name": "llava:13b"}' | jq .

# 3. Check detection logs
docker logs olympian-backend | grep "Vision detection.*llava"

# 4. Clear cache and retry (restart backend)
docker restart olympian-backend
```

### No Vision Models Available
```bash
# 1. Check Ollama connection
curl http://localhost:11434/api/tags

# 2. Pull a vision model
ollama pull llava:13b

# 3. Verify it appears
curl http://localhost:4000/api/chat/vision-models
```

### Subproject 2 Network Issues
```bash
# Check host.docker.internal connectivity
docker exec olympian-backend curl -f http://host.docker.internal:11434/api/tags

# Test from container
docker exec olympian-backend nslookup host.docker.internal

# Check container extra_hosts configuration
docker inspect olympian-backend | grep -A5 ExtraHosts
```

## 📋 Vision Model Patterns

### Supported Model Families
- **LLaVA Variants**: `llava`, `bakllava`, `llava-llama3`, `llava-phi3`, `llava-v1.6`
- **Modern Vision**: `llama3.2-vision`, `phi-3-vision`, `qwen-vl`, `minicpm-v`
- **Specialized**: `moondream`, `cogvlm`, `instructblip`, `deepseek-vl`

### Architecture Patterns
- **Vision Encoders**: `clip`, `vit`, `vision_encoder`
- **Multimodal**: `multimodal`, `vision`, `visual`
- **Specific Configs**: `image_processor`, `vision_config`, `vision_tower`

## 🔧 Configuration Files

### Subproject 2 Docker Compose
```yaml
# docker-compose.same-host-existing-ollama.yml
backend:
  environment:
    OLLAMA_HOST: http://host.docker.internal:11434
    DEPLOYMENT_MODE: same-host-existing-ollama
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

### Key Environment Variables
```bash
OLLAMA_HOST=http://host.docker.internal:11434
DEPLOYMENT_MODE=same-host-existing-ollama
LOG_LEVEL=info  # Set to 'debug' for detailed detection logs
```

## 🎯 Performance Tips

### Cache Optimization
- Detection results cached in memory per model
- Cache cleared on backend restart
- No persistent cache across restarts

### Load Balancer (Multi-host)
```typescript
// Automatic failover on detection errors
if (this.loadBalancer) {
  this.loadBalancer.reportFailure(ollamaHost);
}
```

### Timeout Settings
- API calls: 10 second timeout
- Uses AbortController for clean cancellation

## 📊 Monitoring Commands

### Health Checks
```bash
# Overall health
make health-check

# Specific service status
docker ps | grep olympian

# Backend logs (detection details)
make logs-backend

# Test connectivity
curl http://localhost:4000/api/health
```

### Performance Monitoring
```bash
# Detection cache hits (look for "Check cache first")
docker logs olympian-backend | grep "Check cache"

# API response times
docker logs olympian-backend | grep "Successfully connected"

# Error rates
docker logs olympian-backend | grep "Failed to detect capabilities"
```

## 🔍 Detection Method Examples

### Method 1: Modalities Field
```json
{
  "modalities": ["text", "vision"]  // ✅ Detected
}
```

### Method 3: Capabilities Flag
```json
{
  "capabilities": {
    "image_processing": true  // ✅ Detected
  }
}
```

### Method 5: Architecture Detection
```json
{
  "model_info": {
    "architecture": "llava"  // ✅ Detected
  }
}
```

### Method 7: Modelfile Patterns
```
PARAMETER vision_encoder clip-vit-large  # ✅ Detected
PARAMETER image_size 336                 # ✅ Detected
```

## 🚨 Error Codes & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `VISION_UNSUPPORTED` | Model doesn't support images | Select vision model or use hybrid processing |
| Network timeout | Ollama unreachable | Check `host.docker.internal` connectivity |
| Empty model list | Ollama connection failed | Verify Ollama is running on port 11434 |
| Detection cache miss | Backend restarted | Normal - will re-detect on next request |

---

**Quick Links**:
- 📖 [Full Technical Documentation](./VISION_DETECTION_TECHNICAL.md)
- 👤 [User Guide](./VISION_CAPABILITIES.md)
- 🏗️ [Architecture Overview](./ARCHITECTURE.md)
