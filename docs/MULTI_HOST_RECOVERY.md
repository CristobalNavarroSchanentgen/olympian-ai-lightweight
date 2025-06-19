# Multi-Host Deployment Recovery Guide

This guide helps resolve common issues identified in the multi-host deployment diagnostics.

## 🚨 **Immediate Actions**

### 1. **Apply Configuration Fixes**
The following optimizations have been implemented:

- **Nginx Configuration**: Extended timeouts and optimized buffering for vision processing
- **Docker Compose**: Improved resource limits and health checks
- **Health Check Timing**: Increased startup periods for vision model loading

### 2. **Restart Deployment with New Configuration**
```bash
# Stop current deployment
make stop

# Rebuild with optimizations
make build-prod-clean

# Start with new configuration
make up-prod
```

### 3. **Run Comprehensive Diagnostics**
```bash
# New diagnostic command available
make diagnose
```

## 🔧 **Issue-Specific Fixes**

### **Container Restart Loop**
**Problem**: Backend container repeatedly restarting
**Root Cause**: Insufficient resources for vision model processing

**Solutions Applied**:
- Increased memory limit to 3GB (was unlimited)
- Extended health check start period to 90s (was 40s)
- Added Node.js memory optimization flags
- Improved dependency health checks

**Manual Check**:
```bash
# Monitor resource usage
docker stats olympian-backend

# Check container logs for restart reason
docker logs --tail=50 olympian-backend
```

### **Client Timeout During Vision Processing**
**Problem**: HTTP 499 errors during image processing
**Root Cause**: Frontend timeout shorter than processing time

**Solutions Applied**:
- Extended Nginx proxy timeouts to 10 minutes (was 5 minutes)
- Disabled proxy request buffering for streaming
- Optimized connection handling with keepalive

**Test Fix**:
```bash
# Test with a large image upload
curl -X POST http://localhost:8080/api/chat/send \
  -F "message=Describe this image" \
  -F "image=@large_image.jpg" \
  --max-time 600
```

### **Large Request Buffering**
**Problem**: Nginx buffering large image uploads to disk
**Root Cause**: Default buffering configuration

**Solutions Applied**:
- Optimized client body buffer size to 1MB
- Improved proxy buffering configuration
- Added request buffering optimization

## 🔍 **Monitoring & Validation**

### **Use the New Diagnostic Tool**
```bash
# Run comprehensive health check
make diagnose

# The script will check:
# - Container health status
# - Resource usage
# - Network connectivity
# - Configuration validation
# - Recent error logs
```

### **Monitor Key Metrics**

#### **Backend Performance**
```bash
# Check backend logs for processing times
make logs-backend | grep "Stream completed"

# Monitor memory usage
docker stats olympian-backend --no-stream
```

#### **Vision Processing Health**
```bash
# Check vision model loading
make logs-backend | grep "vision models"

# Monitor processing success rate
make logs-backend | grep "Successfully processed images"
```

#### **Network Connectivity**
```bash
# Test Ollama connectivity
curl -sf http://ollama.prd.ihmn.fr/api/tags

# Test backend health
curl -sf http://localhost:4000/api/health

# Test frontend
curl -sf http://localhost:8080/health
```

## ⚙️ **Configuration Validation**

### **Environment Variables Check**
```bash
# Verify multi-host configuration
grep -E "^(DEPLOYMENT_MODE|OLLAMA_HOST|MONGODB_URI)" .env

# Should show:
# DEPLOYMENT_MODE=docker-multi-host
# OLLAMA_HOST=http://ollama.prd.ihmn.fr
# MONGODB_URI=mongodb://mongodb:27017/olympian_ai_lite
```

### **Container Resource Limits**
The new configuration includes:

**Backend**:
- Memory Limit: 3GB
- CPU Limit: 2 cores
- Reserved: 1GB RAM, 1 CPU core

**Frontend**:
- Memory Limit: 256MB
- CPU Limit: 0.5 cores

**MongoDB**:
- Memory Limit: 1GB
- CPU Limit: 1 core

## 🚀 **Performance Optimization**

### **For High-Volume Vision Processing**
If you experience heavy vision processing workloads:

1. **Increase Backend Resources**:
   ```yaml
   # In docker-compose.prod.yml
   deploy:
     resources:
       limits:
         memory: 4G
         cpus: '3.0'
   ```

2. **Add Multiple Ollama Instances**:
   ```bash
   # In .env
   OLLAMA_HOSTS=http://ollama1.prd.ihmn.fr:11434,http://ollama2.prd.ihmn.fr:11434
   ```

3. **Enable Load Balancing**:
   ```bash
   # In .env
   OLLAMA_LOAD_BALANCER=round-robin
   ```

## 🆘 **Emergency Recovery**

### **Complete Reset**
If issues persist:

```bash
# 1. Stop all containers
make stop

# 2. Clean everything
make clean

# 3. Reconfigure environment
make env-docker-multi-interactive

# 4. Rebuild from scratch
make build-prod-clean

# 5. Start fresh
make up-prod

# 6. Run diagnostics
make diagnose
```

### **Fallback to Previous Configuration**
If the new configuration causes issues:

```bash
# Revert to previous working state
git log --oneline -10  # Find last working commit
git revert <commit-sha>  # Revert problematic changes
make restart-prod
```

## 📊 **Success Indicators**

### **Healthy Deployment Shows**:
- ✅ All containers running and healthy
- ✅ No restart loops in backend logs
- ✅ Vision processing completes without timeouts
- ✅ Nginx not buffering requests to disk
- ✅ Memory usage stable under 80% of limits
- ✅ Response times under 30 seconds for vision tasks

### **Monitor These Commands**:
```bash
# Overall health
make diagnose

# Container status
make status

# Real-time logs
make logs-backend

# Resource usage
docker stats --no-stream
```

## 📞 **Getting Help**

If issues persist after applying these fixes:

1. **Collect Diagnostic Information**:
   ```bash
   make diagnose > diagnostic_output.txt
   ```

2. **Gather Logs**:
   ```bash
   make logs-backend > backend_logs.txt 2>&1
   ```

3. **Include System Information**:
   ```bash
   docker version
   docker-compose version
   free -h
   df -h
   ```

4. **Check the specific error patterns**:
   - Container restart frequency
   - Memory usage spikes
   - Network connectivity issues
   - Configuration mismatches

The diagnostic script now provides comprehensive analysis and actionable recommendations for resolving multi-host deployment issues.
