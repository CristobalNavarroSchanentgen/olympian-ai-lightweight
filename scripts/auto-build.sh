#!/bin/bash

# Auto Build Script with Cache Invalidation
# Automatically sets cache-busting variables for fresh Docker builds when source files change
# Usage: ./scripts/auto-build.sh [deployment-type] [options]
# 
# Deployment types:
#   same-host           - Same-host with Ollama container (make quick-docker-same)
#   same-host-existing  - Same-host with existing Ollama (make quick-docker-same-existing)  
#   multi-host          - Multi-host deployment (make quick-docker-multi)
#
# Options:
#   --no-cache         - Force rebuild without Docker cache
#   --quiet           - Suppress verbose output
#   --dry-run         - Show what would be built without building

set -e

# Colors for output
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

# Default values
DEPLOYMENT_TYPE=""
NO_CACHE=false
QUIET=false
DRY_RUN=false

# Help function
show_help() {
    echo -e "${CYAN}Auto Build Script with Cache Invalidation${RESET}"
    echo ""
    echo "Usage: $0 [deployment-type] [options]"
    echo ""
    echo "Deployment types:"
    echo "  same-host           Same-host with Ollama container"
    echo "  same-host-existing  Same-host with existing Ollama"
    echo "  multi-host          Multi-host deployment"
    echo ""
    echo "Options:"
    echo "  --no-cache         Force rebuild without Docker cache"
    echo "  --quiet           Suppress verbose output"
    echo "  --dry-run         Show what would be built without building"
    echo "  --help            Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 multi-host"
    echo "  $0 same-host --no-cache"
    echo "  $0 same-host-existing --dry-run"
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        same-host|same-host-existing|multi-host)
            DEPLOYMENT_TYPE="$1"
            shift
            ;;
        --no-cache)
            NO_CACHE=true
            shift
            ;;
        --quiet)
            QUIET=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${RESET}"
            show_help
            exit 1
            ;;
    esac
done

# Validate deployment type
if [[ -z "$DEPLOYMENT_TYPE" ]]; then
    echo -e "${RED}❌ Deployment type is required${RESET}"
    show_help
    exit 1
fi

# Function to log messages
log() {
    if [[ "$QUIET" != "true" ]]; then
        echo -e "$1"
    fi
}

# Generate cache-busting variables
log "${CYAN}🔧 Generating cache-busting variables...${RESET}"

# Build date (ISO format)
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Git commit hash (short)
if git rev-parse --git-dir > /dev/null 2>&1; then
    GIT_COMMIT=$(git rev-parse --short HEAD)
else
    GIT_COMMIT="unknown"
    log "${YELLOW}⚠️  Not in a git repository, using 'unknown' for GIT_COMMIT${RESET}"
fi

# Cache bust value (timestamp + random)
CACHE_BUST="${BUILD_DATE}-$(openssl rand -hex 4)"

# Export environment variables for docker-compose
export BUILD_DATE
export GIT_COMMIT
export CACHE_BUST

log "${GREEN}✅ Cache-busting variables generated:${RESET}"
log "  BUILD_DATE: $BUILD_DATE"
log "  GIT_COMMIT: $GIT_COMMIT"
log "  CACHE_BUST: $CACHE_BUST"
log ""

# Determine docker-compose file and make target
case "$DEPLOYMENT_TYPE" in
    "same-host")
        COMPOSE_FILE="docker-compose.same-host.yml"
        MAKE_TARGET="quick-docker-same"
        log "${CYAN}📦 Building for subproject 1: Same-host with Ollama container${RESET}"
        ;;
    "same-host-existing")
        COMPOSE_FILE="docker-compose.same-host-existing-ollama.yml"
        MAKE_TARGET="quick-docker-same-existing"
        log "${CYAN}📦 Building for subproject 2: Same-host with existing Ollama${RESET}"
        ;;
    "multi-host")
        COMPOSE_FILE="docker-compose.prod.yml"
        MAKE_TARGET="quick-docker-multi"
        log "${CYAN}📦 Building for subproject 3: Multi-host deployment${RESET}"
        ;;
esac

# Build command construction
BUILD_CMD="docker-compose -f $COMPOSE_FILE build"
if [[ "$NO_CACHE" == "true" ]]; then
    BUILD_CMD="$BUILD_CMD --no-cache"
fi

# Show what will be executed
log "${CYAN}🏗️  Build command:${RESET}"
log "  $BUILD_CMD"
log ""

if [[ "$DRY_RUN" == "true" ]]; then
    log "${YELLOW}🔍 DRY RUN - Would execute: $BUILD_CMD${RESET}"
    log "${YELLOW}🔍 DRY RUN - Would run make target: $MAKE_TARGET${RESET}"
    exit 0
fi

# Check if docker-compose file exists
if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo -e "${RED}❌ Docker compose file not found: $COMPOSE_FILE${RESET}"
    exit 1
fi

# Execute the build
log "${CYAN}🚀 Starting build...${RESET}"

# Method 1: Use make target (recommended)
if command -v make >/dev/null 2>&1 && [[ -f "Makefile" ]]; then
    log "${CYAN}📋 Using Makefile target: $MAKE_TARGET${RESET}"
    
    # The Makefile targets already handle the build process with appropriate flags
    if [[ "$NO_CACHE" == "true" ]]; then
        # For --no-cache, we need to use docker-compose directly since make targets use --no-cache by default
        log "${CYAN}🔨 Building with docker-compose directly (no-cache)...${RESET}"
        $BUILD_CMD
    else
        log "${CYAN}🔨 Building with make target...${RESET}"
        make "$MAKE_TARGET"
    fi
else
    # Method 2: Direct docker-compose (fallback)
    log "${CYAN}🔨 Building with docker-compose directly...${RESET}"
    $BUILD_CMD
fi

# Verify build success
if [[ $? -eq 0 ]]; then
    log ""
    log "${GREEN}✅ Build completed successfully!${RESET}"
    log "${GREEN}🎉 Cache invalidation applied - fresh build with source file changes${RESET}"
    log ""
    log "${CYAN}📋 Build Summary:${RESET}"
    log "  Deployment: $DEPLOYMENT_TYPE"
    log "  Compose file: $COMPOSE_FILE"
    log "  Build date: $BUILD_DATE"
    log "  Git commit: $GIT_COMMIT"
    log "  Cache bust: $CACHE_BUST"
    
    # Show next steps
    case "$DEPLOYMENT_TYPE" in
        "same-host")
            log ""
            log "${CYAN}🚀 Next steps:${RESET}"
            log "  Start services: ${GREEN}make up-same-host${RESET}"
            log "  View logs: ${GREEN}make logs-backend${RESET}"
            log "  Access app: ${GREEN}http://localhost:8080${RESET}"
            ;;
        "same-host-existing")
            log ""
            log "${CYAN}🚀 Next steps:${RESET}"
            log "  Ensure Ollama is running on host port 11434"
            log "  Start services: ${GREEN}make up-same-host-existing${RESET}"
            log "  View logs: ${GREEN}make logs-backend${RESET}"
            log "  Access app: ${GREEN}http://localhost:8080${RESET}"
            ;;
        "multi-host")
            log ""
            log "${CYAN}🚀 Next steps:${RESET}"
            log "  Configure .env for external services"
            log "  Start services: ${GREEN}make up-prod${RESET}"
            log "  View logs: ${GREEN}make logs-backend${RESET}"
            log "  Access app: ${GREEN}http://localhost:8080${RESET}"
            ;;
    esac
else
    echo -e "${RED}❌ Build failed!${RESET}"
    exit 1
fi
