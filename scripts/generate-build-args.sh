#!/bin/bash

# Script to generate build arguments for cache busting
# This ensures that Docker rebuilds when source code changes

# Get current git commit hash (short version)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")

# Get current timestamp
BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Generate a hash of source files to detect changes
SOURCE_HASH=$(find packages/client/src packages/server/src -type f -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" 2>/dev/null | xargs -I {} stat -c '%Y' {} 2>/dev/null | md5sum | cut -d' ' -f1 || echo "no-hash")

# Create cache bust token combining all factors
CACHE_BUST="${GIT_COMMIT}-${SOURCE_HASH}-$(date +%s)"

# Export for docker-compose to use
export BUILD_DATE
export GIT_COMMIT
export CACHE_BUST

# Write to .env.build file for persistence
cat > .env.build << EOF
# Auto-generated build arguments - DO NOT EDIT
# Generated at: ${BUILD_DATE}
BUILD_DATE=${BUILD_DATE}
GIT_COMMIT=${GIT_COMMIT}
CACHE_BUST=${CACHE_BUST}
SOURCE_HASH=${SOURCE_HASH}
EOF

echo "Build arguments generated:"
echo "  BUILD_DATE: ${BUILD_DATE}"
echo "  GIT_COMMIT: ${GIT_COMMIT}"
echo "  SOURCE_HASH: ${SOURCE_HASH}"
echo "  CACHE_BUST: ${CACHE_BUST}"
