# Docker Deployment Guide

## Overview

Olympian AI Lightweight supports two deployment modes:

1. **Same-Host Deployment**: All services (Ollama, MongoDB, MCP) run on the same host in different containers
2. **Multi-Host Deployment**: Services run on different hosts in the local network

## Quick Start

### Same-Host Deployment

```bash
# Deploy with all services on the same host
./scripts/docker-deploy.sh --same-host
```

### Multi-Host Deployment

```bash
# 1. Copy and configure environment
cp .env.docker .env
# Edit .env with your service IPs/hostnames

# 2. Deploy
./scripts/docker-deploy.sh --multi-host
```

## Configuration

### Environment Variables

Key environment variables in `.env.docker`:

```bash
# Deployment mode
DEPLOYMENT_MODE=multi-host  # or 'same-host'

# Multi-host configuration
MONGODB_URI=mongodb://192.168.1.10:27017/olympian_ai_lite
OLLAMA_HOST=http://192.168.1.11:11434
OLLAMA_HOSTS=192.168.1.11:11434,192.168.1.12:11434  # Multiple hosts

# Service discovery
SERVICE_DISCOVERY_SUBNET=192.168.1.0/24
```

### Network Configuration

#### Same-Host Network

Services communicate using Docker network names:
- MongoDB: `olympian-mongodb:27017`
- Ollama: `olympian-ollama:11434`

#### Multi-Host Network

Services communicate using IP addresses or hostnames.

Add host mappings if using hostnames:

```yaml
# In docker-compose.prod.yml
services:
  backend:
    extra_hosts:
      - "mongo-host:192.168.1.10"
      - "ollama-host:192.168.1.11"
```

## Deployment Scenarios

### Scenario 1: Development (Same Host)

```bash
# Use the development compose file
docker compose up -d
```

### Scenario 2: Production (Same Host)

```bash
# Use the same-host production file
docker compose -f docker-compose.same-host.yml up -d
```

### Scenario 3: Production (Multi-Host)

1. **Prepare MongoDB host** (192.168.1.10):
   ```bash
   docker run -d --name mongodb \
     -p 27017:27017 \
     -v mongodb-data:/data/db \
     mongo:7
   ```

2. **Prepare Ollama hosts** (192.168.1.11, 192.168.1.12):
   ```bash
   docker run -d --name ollama \
     -p 11434:11434 \
     -v ollama-data:/root/.ollama \
     --gpus all \
     ollama/ollama:latest
   ```

3. **Deploy Olympian AI**:
   ```bash
   ./scripts/docker-deploy.sh --multi-host
   ```

## Load Balancing

For multiple Ollama instances, configure load balancing:

```bash
# In .env
OLLAMA_HOSTS=192.168.1.11:11434,192.168.1.12:11434,192.168.1.13:11434
OLLAMA_LOAD_BALANCER=round-robin  # or 'least-conn', 'ip-hash'
```

## Health Monitoring

Check service health:

```bash
# View all services
docker compose -f docker-compose.prod.yml ps

# Check application health
curl http://localhost:8080/api/health

# Check service connectivity
curl http://localhost:8080/api/health/services
```

## Troubleshooting

### Connection Issues

1. **Same-Host**: Ensure all containers are on the same network
   ```bash
   docker network inspect olympian-network
   ```

2. **Multi-Host**: Test connectivity between hosts
   ```bash
   # From application host
   nc -zv 192.168.1.10 27017  # MongoDB
   curl http://192.168.1.11:11434/api/version  # Ollama
   ```

### Logs

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service
docker compose -f docker-compose.prod.yml logs -f backend
```

### Performance Tuning

1. **MongoDB**: Add indexes for better performance
2. **Ollama**: Use GPU acceleration when available
3. **Nginx**: Enable caching for static assets

## Security Considerations

1. **Network Isolation**: Use custom Docker networks
2. **Firewall Rules**: Restrict access between hosts
3. **TLS/SSL**: Enable HTTPS for production
4. **Secrets Management**: Use Docker secrets for sensitive data

## Backup and Recovery

### Backup

```bash
# Backup MongoDB
docker exec olympian-mongodb mongodump --out /backup

# Backup configuration
docker cp olympian-backend:/config/.olympian-ai-lite ./backup/
```

### Restore

```bash
# Restore MongoDB
docker exec olympian-mongodb mongorestore /backup

# Restore configuration
docker cp ./backup/.olympian-ai-lite olympian-backend:/config/
```