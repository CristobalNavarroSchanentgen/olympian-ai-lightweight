#!/bin/bash

# Script to generate build arguments for cache busting
# This ensures that Docker rebuilds when source code changes

# Get current git commit hash (short version)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")

# Get current timestamp
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Generate a hash of source files to detect changes
# Include both frontend and backend source files
SOURCE_HASH=""
if [ -d "packages/client/src" ] && [ -d "packages/server/src" ]; then
    # Hash all TypeScript/JavaScript files in both client and server
    SOURCE_HASH=$(find packages/client/src packages/server/src packages/shared/src 2>/dev/null \
        -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \) \
        -exec stat -c '%Y %n' {} \; 2>/dev/null | \
        sort | md5sum | cut -d' ' -f1 || echo "no-hash")
    
    # Also include package.json files as they affect dependencies
    PACKAGE_HASH=$(find . -name "package.json" -not -path "./node_modules/*" \
        -exec stat -c '%Y %n' {} \; 2>/dev/null | \
        sort | md5sum | cut -d' ' -f1 || echo "no-pkg-hash")
    
    SOURCE_HASH="${SOURCE_HASH}-${PACKAGE_HASH}"
else
    SOURCE_HASH="no-src-found"
fi

# Create cache bust token combining all factors
CACHE_BUST="${GIT_COMMIT}-${SOURCE_HASH}-$(date +%s)"

# Export for docker-compose to use
export BUILD_DATE
export GIT_COMMIT
export CACHE_BUST
export SOURCE_HASH

# Write to .env.build file for persistence
cat > .env.build << EOF
# Auto-generated build arguments - DO NOT EDIT
# Generated at: ${BUILD_DATE}
BUILD_DATE=${BUILD_DATE}
GIT_COMMIT=${GIT_COMMIT}
CACHE_BUST=${CACHE_BUST}
SOURCE_HASH=${SOURCE_HASH}
EOF

# Log output only if not in quiet mode
if [ "$1" != "--quiet" ]; then
    echo "Build arguments generated:"
    echo "  BUILD_DATE: ${BUILD_DATE}"
    echo "  GIT_COMMIT: ${GIT_COMMIT}"
    echo "  SOURCE_HASH: ${SOURCE_HASH:0:16}..."
    echo "  CACHE_BUST: ${CACHE_BUST}"
fi