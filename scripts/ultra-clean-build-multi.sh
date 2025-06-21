#!/bin/bash

# Ultra-clean build script for multi-host deployment (subproject 3)
# This script ensures Docker layer corruption issues are prevented
# by performing comprehensive cleanup before building

set -e

# Colors for output
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

echo -e "${CYAN}🔧 Ultra-clean build for multi-host deployment (subproject 3)${RESET}"
echo -e "${YELLOW}This script prevents Docker layer corruption by ensuring completely clean builds${RESET}"
echo ""

# Function to log with timestamp
log() {
    echo -e "${CYAN}[$(date '+%H:%M:%S')] $1${RESET}"
}

# Function to handle errors
error_exit() {
    echo -e "${RED}❌ Error: $1${RESET}" >&2
    exit 1
}

# Check if we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
    error_exit "docker-compose.prod.yml not found. Please run this script from the project root."
fi

# Step 1: Stop all containers
log "Stopping all containers..."
docker-compose -f docker-compose.prod.yml down -v --remove-orphans 2>/dev/null || true

# Step 2: Remove multi-host specific images
log "Removing multi-host specific Docker images..."
docker images | grep -E "(olympian|multi|prod)" | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true

# Step 3: Clean build cache
log "Cleaning Docker build cache..."
docker builder prune -af 2>/dev/null || true

# Step 4: Remove intermediate containers
log "Removing intermediate containers..."
docker container prune -f 2>/dev/null || true

# Step 5: Clean build artifacts
log "Cleaning build artifacts..."
rm -f .env.build 2>/dev/null || true

# Step 6: Clean npm cache (optional but helpful)
if command -v npm &> /dev/null; then
    log "Cleaning npm cache..."
    npm cache clean --force 2>/dev/null || true
fi

# Step 7: Generate fresh build arguments
log "Generating fresh build arguments..."
chmod +x scripts/generate-build-args.sh
./scripts/generate-build-args.sh --quiet

# Step 8: Load build environment
if [ -f ".env.build" ]; then
    source .env.build
    log "Loaded fresh build arguments: BUILD_DATE=${BUILD_DATE}, GIT_COMMIT=${GIT_COMMIT}"
else
    error_exit "Failed to generate build arguments"
fi

# Step 9: Perform ultra-clean build
log "Starting ultra-clean build with fresh base images..."
log "Using build arguments:"
log "  BUILD_DATE: ${BUILD_DATE}"
log "  GIT_COMMIT: ${GIT_COMMIT}"
log "  CACHE_BUST: ${CACHE_BUST}"

export BUILD_DATE GIT_COMMIT CACHE_BUST SOURCE_HASH

# Build with --no-cache and --pull to ensure completely fresh build
docker-compose -f docker-compose.prod.yml build --no-cache --pull

# Step 10: Verification
log "Verifying build success..."
if docker images | grep -q "olympian"; then
    echo -e "${GREEN}✅ Ultra-clean build completed successfully!${RESET}"
    echo ""
    echo -e "${CYAN}Built images:${RESET}"
    docker images | grep "olympian" | awk '{print "  " $1 ":" $2 " (" $7 " " $8 ")"}'
    echo ""
    echo -e "${CYAN}Next steps:${RESET}"
    echo -e "  Run: ${CYAN}make up-prod${RESET} to start the multi-host deployment"
    echo -e "  Or run: ${CYAN}docker-compose -f docker-compose.prod.yml up -d${RESET}"
else
    error_exit "Build verification failed - no olympian images found"
fi

# Step 11: Show build info
echo ""
echo -e "${CYAN}🏷️  Build Information:${RESET}"
echo -e "  Build Date: ${BUILD_DATE}"
echo -e "  Git Commit: ${GIT_COMMIT}"
echo -e "  Source Hash: ${SOURCE_HASH:0:16}..."
echo -e "  Cache Bust: ${CACHE_BUST}"
echo ""
echo -e "${GREEN}✅ Docker layer corruption prevention: SUCCESS${RESET}"
echo -e "${YELLOW}💡 This ultra-clean build ensures no cached layers can cause corruption issues${RESET}"
