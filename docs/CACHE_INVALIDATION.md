# Cache Invalidation and Auto-Build System

This document explains the automatic cache invalidation system implemented for fresh Docker builds when source files change in the Olympian AI Lightweight project.

## Overview

The cache invalidation system ensures that Docker builds are refreshed when source files change, preventing stale builds and ensuring the latest code is deployed. This is implemented across all three subprojects:

1. **Subproject 1**: Same-host with Ollama container (`make quick-docker-same`)
2. **Subproject 2**: Same-host with existing Ollama (`make quick-docker-same-existing`)  
3. **Subproject 3**: Multi-host deployment (`make quick-docker-multi`)

## How It Works

### Cache-Busting Variables

The system uses three build arguments passed to Docker to invalidate cache when needed:

- **`BUILD_DATE`**: ISO timestamp of when the build started
- **`GIT_COMMIT`**: Short Git commit hash of the current HEAD
- **`CACHE_BUST`**: Unique value combining timestamp and random string

### Frontend Dockerfile Integration

The frontend Dockerfile (subprojects 1-3) includes a cache bust point:

```dockerfile
# Build arguments for cache busting
ARG BUILD_DATE
ARG GIT_COMMIT
ARG CACHE_BUST

# Cache bust point - this will invalidate cache when source files change
RUN echo "Build Date: ${BUILD_DATE}" > /tmp/build_info && \
    echo "Git Commit: ${GIT_COMMIT}" >> /tmp/build_info && \
    echo "Cache Bust: ${CACHE_BUST}" >> /tmp/build_info && \
    cat /tmp/build_info
```

### Docker Compose Integration

All three docker-compose files now pass these build arguments:

```yaml
frontend:
  build:
    context: .
    dockerfile: docker/frontend/Dockerfile
    args:
      BUILD_DATE: ${BUILD_DATE:-}
      GIT_COMMIT: ${GIT_COMMIT:-}
      CACHE_BUST: ${CACHE_BUST:-}
```

## Usage

### Auto-Build Script

The main auto-build script automatically generates cache-busting variables:

```bash
# Basic usage
./scripts/auto-build.sh [deployment-type]

# Examples
./scripts/auto-build.sh same-host           # Subproject 1
./scripts/auto-build.sh same-host-existing  # Subproject 2  
./scripts/auto-build.sh multi-host          # Subproject 3

# Options
./scripts/auto-build.sh multi-host --no-cache    # Force rebuild
./scripts/auto-build.sh multi-host --dry-run     # Preview only
./scripts/auto-build.sh multi-host --quiet       # Suppress output
```

### Makefile Targets

New make targets provide convenient access to auto-build functionality:

```bash
# Auto-build with cache invalidation
make auto-build-same          # Subproject 1: Same-host with Ollama container
make auto-build-same-existing # Subproject 2: Same-host with existing Ollama
make auto-build-multi         # Subproject 3: Multi-host deployment

# Additional options
make auto-build              # Default (same as auto-build-multi)
make auto-build-no-cache     # Force rebuild without Docker cache
make auto-build-dry-run      # Show what would be built
```

### Manual Environment Variables

You can also set the cache-busting variables manually:

```bash
export BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
export GIT_COMMIT=$(git rev-parse --short HEAD)
export CACHE_BUST="${BUILD_DATE}-$(openssl rand -hex 4)"

# Then use normal docker-compose commands
docker-compose -f docker-compose.prod.yml build
```

## When Cache Invalidation Triggers

The cache will be invalidated (causing a fresh build) when:

1. **Source code changes**: Any file changes in the Git repository
2. **Manual build**: Using auto-build script or make targets
3. **Time-based**: Different build timestamps ensure uniqueness
4. **Git commits**: Different commit hashes trigger rebuilds

## Benefits

### 🔄 **Fresh Builds**
- Ensures latest source code is always built
- Eliminates stale container issues
- Prevents deployment of outdated code

### 🚀 **Performance**
- Only rebuilds when necessary
- Leverages Docker layer caching for dependencies
- Smart cache invalidation at source file layer

### 🔧 **Developer Experience**
- Simple make targets for all subprojects
- Dry-run capabilities for testing
- Consistent workflow across all deployment types

### 📋 **Transparency**
- Build info embedded in containers
- Git commit tracking in builds
- Clear logging of cache-busting variables

## Subproject Consistency

Each subproject maintains its own cache invalidation while sharing the same infrastructure:

### Subproject 1: Same-Host with Ollama Container
```bash
make auto-build-same
# Uses: docker-compose.same-host.yml
# Builds: Frontend + Backend + MongoDB + Ollama containers
```

### Subproject 2: Same-Host with Existing Ollama  
```bash
make auto-build-same-existing
# Uses: docker-compose.same-host-existing-ollama.yml
# Builds: Frontend + Backend + MongoDB (assumes Ollama on host)
```

### Subproject 3: Multi-Host Deployment
```bash
make auto-build-multi
# Uses: docker-compose.prod.yml  
# Builds: Frontend + Backend + MongoDB (external Ollama)
```

## Troubleshooting

### Script Not Executable
```bash
chmod +x scripts/auto-build.sh
```

### Git Repository Issues
If not in a Git repository, `GIT_COMMIT` will be set to "unknown" with a warning.

### Docker Build Failures
Use `--dry-run` to preview the build command without executing:
```bash
./scripts/auto-build.sh multi-host --dry-run
```

### Debugging Build Info
Check the build information embedded in containers:
```bash
docker exec olympian-frontend cat /usr/share/nginx/html/build_info.txt
```

## Integration with Existing Workflow

The cache invalidation system integrates seamlessly with existing commands:

- **Quick start commands** (`make quick-docker-*`) use existing build targets
- **Manual builds** can still use `docker-compose build` directly  
- **Auto-build targets** provide enhanced cache invalidation
- **All subprojects** maintain separate namespace and consistency

This ensures backward compatibility while providing enhanced build reliability for when source files change.
