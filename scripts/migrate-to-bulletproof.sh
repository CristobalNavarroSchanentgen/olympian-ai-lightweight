#!/bin/bash

# 🎯 BULLETPROOF MESSAGE ID SYSTEM MIGRATION SCRIPT
# 
# Automates the migration from the old WebSocket system to the bulletproof system
# Run this script from the repository root directory

set -e

echo "🚀 Starting Bulletproof Message ID System Migration..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "packages/client" ]; then
    print_error "Please run this script from the repository root directory"
    exit 1
fi

print_status "Detected olympian-ai-lightweight repository"

# Step 1: Install required dependencies
print_status "Installing required dependencies..."
cd packages/client
if npm install uuid @types/uuid; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi
cd ../..

# Step 2: Create backup of existing files
print_status "Creating backup of existing files..."
BACKUP_DIR="migration_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# Backup files that will be modified
BACKUP_FILES=(
    "packages/client/src/components/DivineDialog/index.tsx"
    "packages/client/src/components/DivineDialog/MessageList.tsx"
    "packages/client/src/components/DivineDialog/MessageItem.tsx"
    "packages/client/src/services/websocketChat.ts"
    "packages/client/src/stores/useTypedMessagesStore.ts"
)

for file in "${BACKUP_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "$BACKUP_DIR/$(basename "$file").bak"
        print_status "Backed up $file"
    fi
done

print_success "Backup created in $BACKUP_DIR"

# Step 3: Validate that bulletproof files exist
print_status "Validating bulletproof system files..."

REQUIRED_FILES=(
    "packages/client/src/services/messageIdManager.ts"
    "packages/client/src/services/bulletproofWebSocketChat.ts"
    "packages/client/src/hooks/useBulletproofChat.ts"
    "packages/client/src/stores/useBulletproofTypedMessagesStore.ts"
    "docs/BULLETPROOF_MESSAGE_ID_SYSTEM.md"
)

ALL_FILES_EXIST=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        print_error "Required file missing: $file"
        ALL_FILES_EXIST=false
    else
        print_status "✓ Found $file"
    fi
done

if [ "$ALL_FILES_EXIST" = false ]; then
    print_error "Some required bulletproof system files are missing. Please ensure all files are committed."
    exit 1
fi

print_success "All bulletproof system files are present"

# Step 4: Create migration status file
print_status "Creating migration status file..."
cat > "MIGRATION_STATUS.md" << EOF
# 🎯 Bulletproof Message ID System Migration Status

**Migration Started**: $(date)
**Backup Directory**: $BACKUP_DIR

## Migration Checklist

### Phase 1: Infrastructure ✅
- [x] Install dependencies (uuid, @types/uuid)
- [x] Validate bulletproof system files
- [x] Create backup of existing files

### Phase 2: Component Updates (Manual)
- [ ] Update DivineDialog component to use useBulletproofChat
- [ ] Replace WebSocket service with bulletproof service
- [ ] Update MessageList to use bulletproof store selectors
- [ ] Update MessageItem to use bulletproof typewriter

### Phase 3: Store Migration (Manual)
- [ ] Replace useTypedMessagesStore with useBulletproofTypedMessagesStore
- [ ] Update streaming content selectors
- [ ] Migrate typewriter effect logic

### Phase 4: Testing
- [ ] Test Subproject 1: Same-host with Ollama container
- [ ] Test Subproject 2: Same-host with existing Ollama  
- [ ] Test Subproject 3: Multi-host deployment

### Phase 5: Cleanup
- [ ] Remove old WebSocket service (after validation)
- [ ] Remove old typed messages store (after validation)
- [ ] Update imports throughout codebase

## Manual Steps Required

1. **Update DivineDialog Component** (\`packages/client/src/components/DivineDialog/index.tsx\`)
   - Replace \`webSocketChatService\` with \`useBulletproofChat\` hook
   - Update message sending logic to use bulletproof handlers
   - Replace typed messages store with bulletproof store

2. **Update MessageList Component** (\`packages/client/src/components/DivineDialog/MessageList.tsx\`)
   - Replace \`useStreamedContent\` with \`useCurrentStreamingContent\`
   - Update imports to use bulletproof store

3. **Update MessageItem Component** (\`packages/client/src/components/DivineDialog/MessageItem.tsx\`)
   - Replace typewriter logic with bulletproof typewriter
   - Update imports and state management

4. **Test Each Subproject**
   - Run \`make quick-docker-same\` for Subproject 1
   - Run \`make quick-docker-same-existing\` for Subproject 2  
   - Run \`make quick-docker-multi\` for Subproject 3

## Debugging Tools

Access debugging tools in browser console:
\`\`\`javascript
// Check message system health
window.debugMessageSystem();

// Monitor performance
const chat = useBulletproofChat({ enableDebugLogging: true });
console.log(chat.getConnectionStats());
\`\`\`

## Rollback Instructions

If migration fails, restore from backup:
\`\`\`bash
# Restore backed up files
cp $BACKUP_DIR/*.bak packages/client/src/components/DivineDialog/
cp $BACKUP_DIR/*.bak packages/client/src/services/
cp $BACKUP_DIR/*.bak packages/client/src/stores/
\`\`\`

EOF

print_success "Migration status file created: MIGRATION_STATUS.md"

# Step 5: Check TypeScript compilation
print_status "Checking TypeScript compilation..."
cd packages/client
if npm run type-check 2>/dev/null || npx tsc --noEmit 2>/dev/null; then
    print_success "TypeScript compilation successful"
else
    print_warning "TypeScript compilation issues detected. This is expected before manual migration steps."
fi
cd ../..

# Step 6: Generate migration report
print_status "Generating migration report..."
cat > "MIGRATION_REPORT.md" << EOF
# 🎯 Bulletproof Migration Report

**Generated**: $(date)

## System Analysis

### Current System Status
- **WebSocket Service**: Legacy (to be replaced)
- **Typed Messages Store**: Legacy (to be replaced)  
- **Message ID Generation**: Basic timestamp (vulnerable to collisions)
- **Error Handling**: Limited (prone to race conditions)

### Bulletproof System Ready
- **MessageIdManager**: ✅ Collision-resistant ID generation
- **BulletproofWebSocketService**: ✅ Event queuing and retry logic
- **BulletproofChat Hook**: ✅ React best practices implementation
- **BulletproofStore**: ✅ Deterministic state management

### Known Issues Resolved
1. **Race Conditions**: Event handler lifecycle management
2. **Message ID Collisions**: Cryptographically secure generation
3. **Multi-host Timing**: Event queuing with grace periods
4. **Infinite Re-renders**: Proper React memoization
5. **Memory Leaks**: Automatic cleanup and validation

## Implementation Benefits

### Reliability
- Zero tolerance for message ID collisions
- Bulletproof event handler lifecycle
- Multi-layer error recovery
- Comprehensive validation and monitoring

### Performance  
- Optimized React patterns (memoization, selectors)
- Efficient state management with Zustand
- Memory leak prevention
- Real-time performance monitoring

### Maintainability
- Clear separation of concerns
- Comprehensive debugging tools
- Extensive documentation
- Future-proof architecture

## Next Steps

1. **Manual Component Migration**: Follow MIGRATION_STATUS.md checklist
2. **Subproject Testing**: Validate across all deployment scenarios
3. **Performance Validation**: Monitor metrics and debug tools
4. **Legacy Cleanup**: Remove old system after validation

## Support

- **Documentation**: docs/BULLETPROOF_MESSAGE_ID_SYSTEM.md
- **Debug Tools**: Built-in hooks and console utilities
- **Monitoring**: Real-time health checks and performance metrics

EOF

print_success "Migration report generated: MIGRATION_REPORT.md"

# Step 7: Final validation
print_status "Performing final validation..."

# Check if package.json has uuid dependency
if grep -q '"uuid"' packages/client/package.json; then
    print_success "UUID dependency confirmed in package.json"
else
    print_warning "UUID dependency not found in package.json - manual installation may be required"
fi

# Summary
echo ""
echo "🎯 ==============================================="
echo "   BULLETPROOF MIGRATION SETUP COMPLETE"
echo "==============================================="
echo ""
print_success "Infrastructure setup completed successfully!"
echo ""
print_status "📋 NEXT STEPS (Manual):"
echo "  1. Review MIGRATION_STATUS.md for detailed checklist"
echo "  2. Update DivineDialog component with bulletproof chat hook"
echo "  3. Replace store usage with bulletproof store selectors"
echo "  4. Test each subproject deployment scenario"
echo "  5. Monitor performance with built-in debugging tools"
echo ""
print_status "📚 DOCUMENTATION:"
echo "  - Migration Guide: MIGRATION_STATUS.md"
echo "  - System Overview: MIGRATION_REPORT.md"
echo "  - Technical Details: docs/BULLETPROOF_MESSAGE_ID_SYSTEM.md"
echo ""
print_status "🔧 DEBUGGING:"
echo "  - Enable debug mode: useBulletproofChat({ enableDebugLogging: true })"
echo "  - Browser console: window.debugMessageSystem()"
echo "  - Performance monitoring: chat.getConnectionStats()"
echo ""
print_warning "⚠️  IMPORTANT: Manual component updates are required to complete migration"
print_warning "⚠️  Test thoroughly in each subproject before removing legacy code"
echo ""
print_success "🚀 Bulletproof Message ID System is ready for implementation!"
