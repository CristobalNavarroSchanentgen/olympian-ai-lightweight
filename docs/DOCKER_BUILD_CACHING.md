# Docker Build Caching and Development Guide

This guide explains how the Docker build caching system works in Olympian AI Lightweight and how to effectively develop with subproject 3 (multi-host deployment).

## The Problem

When developing with Docker, changes to React components or other source files may not be reflected in the running containers due to Docker's build caching mechanism. This is because:

1. Docker caches build layers to speed up subsequent builds
2. Without proper cache invalidation, Docker reuses cached layers even when source files change
3. The production Docker images serve pre-built static files, not source files

## The Solution

We've implemented a comprehensive solution with multiple approaches:

### 1. Automatic Cache Busting (Production)

The build system now automatically detects source file changes and invalidates the Docker cache:

```bash
# These commands will always rebuild when source files change
make quick-docker-multi      # Full rebuild for multi-host
make rebuild-frontend        # Rebuild only frontend
make rebuild-backend         # Rebuild only backend
```

#### How it works:
- `generate-build-args.sh` creates a hash of all source files
- This hash is passed as a build argument to Docker
- When source files change, the hash changes, invalidating the cache
- The Dockerfile uses these arguments to ensure fresh builds

### 2. Development Mode with Hot Reloading (Recommended for Development)

For active development, use the new development mode that provides hot reloading:

```bash
# Start development mode for multi-host deployment
make dev-multi

# Or use the full command
make up-dev-multi
```

#### Benefits:
- ✅ **Hot Reloading**: React components update instantly without rebuilding
- ✅ **Fast Iteration**: No need to rebuild Docker images for frontend changes
- ✅ **Volume Mounts**: Source files are mounted directly into containers
- ✅ **Separate Dev Server**: Frontend runs on Vite dev server with HMR

#### Access Points:
- Application: http://localhost:8080
- Vite Dev Server: http://localhost:5173
- Backend API: http://localhost:4000

### 3. Manual Cache Invalidation (When Needed)

If you need to force a complete rebuild:

```bash
# Force rebuild without cache
make build-prod-clean

# Or for specific deployment
docker-compose -f docker-compose.prod.yml build --no-cache
```

## Development Workflow

### For Frontend Development (React Components)

1. **Start development mode**:
   ```bash
   make dev-multi
   ```

2. **Edit your React components** - changes will be reflected immediately

3. **View logs if needed**:
   ```bash
   make logs-frontend-dev  # Frontend dev server logs
   make logs-backend       # Backend logs
   ```

### For Backend Development

1. **Start development mode**:
   ```bash
   make dev-multi
   ```

2. **Edit backend code**

3. **Rebuild backend only**:
   ```bash
   make rebuild-backend
   ```

### For Production Testing

1. **Make your changes**

2. **Rebuild and deploy**:
   ```bash
   make quick-docker-multi
   ```

3. **Verify the build**:
   ```bash
   # Check build info
   docker exec olympian-frontend cat /usr/share/nginx/html/build_info.txt
   ```

## Build Process Details

### Build Arguments

The system uses several build arguments for cache busting:

- `BUILD_DATE`: Timestamp of the build
- `GIT_COMMIT`: Current git commit hash
- `SOURCE_HASH`: Hash of all source files
- `CACHE_BUST`: Combined token for cache invalidation

### File Monitoring

The build system monitors these files for changes:
- `packages/client/src/**/*.(ts|tsx|js|jsx)`
- `packages/server/src/**/*.(ts|tsx|js|jsx)`
- `packages/shared/src/**/*.(ts|tsx|js|jsx)`
- All `package.json` files (except in node_modules)

### Docker Compose Integration

The Makefile automatically:
1. Generates build arguments before each build
2. Passes them to docker-compose via environment variables
3. Ensures Docker rebuilds affected layers

## Troubleshooting

### Changes Not Reflected

1. **Check you're using the right command**:
   ```bash
   # For development (with hot reloading)
   make dev-multi
   
   # For production (requires rebuild)
   make quick-docker-multi
   ```

2. **Verify build arguments are generated**:
   ```bash
   cat .env.build
   ```

3. **Force a clean rebuild if needed**:
   ```bash
   make build-prod-clean
   ```

### Development Mode Issues

1. **Frontend not hot reloading**:
   ```bash
   # Check frontend dev logs
   make logs-frontend-dev
   
   # Restart development mode
   make restart-dev-multi
   ```

2. **Port conflicts**:
   - Ensure ports 8080, 5173, and 4000 are available
   - Stop other services using these ports

### Performance Issues

1. **Slow rebuilds**:
   - Use development mode for faster iteration
   - Only rebuild what changed (frontend or backend)

2. **High memory usage**:
   - Development mode uses more memory due to dev servers
   - Close unnecessary applications

## Best Practices

1. **Use Development Mode** for active development:
   - Faster iteration cycles
   - No need to rebuild for frontend changes
   - Better debugging experience

2. **Use Production Builds** for:
   - Testing the final build
   - Performance testing
   - Deployment preparation

3. **Keep Dependencies Updated**:
   - Run `npm install` when package.json changes
   - Rebuild after dependency updates

4. **Monitor Build Logs**:
   - Check for "Build arguments generated" message
   - Verify SOURCE_HASH changes when files are modified

## Summary

- **Development**: Use `make dev-multi` for hot reloading
- **Production**: Use `make quick-docker-multi` for full rebuilds
- **Partial Rebuilds**: Use `make rebuild-frontend` or `make rebuild-backend`
- **Force Rebuild**: Use `make build-prod-clean` when needed

The system now automatically handles cache invalidation, but understanding these mechanisms helps you work more effectively with the Docker-based development environment.
