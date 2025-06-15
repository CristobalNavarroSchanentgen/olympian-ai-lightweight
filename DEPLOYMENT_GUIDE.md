# Quick deployment guide for olympian-ai-lightweight

## Prerequisites
- Docker and Docker Compose installed
- Ollama running on host at localhost:11434 (for same-host-existing deployment)
- Port 8080 available

## Quick Start

### For deployment with existing Ollama on host:
```bash
git clone https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight.git
cd olympian-ai-lightweight
make quick-docker-same-existing
```

### Access the application:
- Frontend: http://localhost:8080
- API: http://localhost:8080/api

## Troubleshooting

If you see the nginx welcome page instead of the app:
1. Stop containers: `make docker-down`
2. Remove old images: `docker rmi olympian-ai-lightweight-frontend`
3. Rebuild: `make quick-docker-same-existing`

## Verify deployment:
```bash
# Check if services are healthy
make health-check

# View logs
make logs-same-existing

# Check what's in the frontend container
docker exec olympian-frontend ls -la /usr/share/nginx/html/
```

The application should now be running correctly!
