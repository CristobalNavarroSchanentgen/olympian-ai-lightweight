#!/bin/bash

# Colors
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${CYAN}🔍 Disabling UI debug logging...${RESET}"

# Remove debug configuration
if [ -f "packages/client/src/config/debug.ts" ]; then
    rm -f "packages/client/src/config/debug.ts"
    echo -e "${GREEN}✅ Debug configuration removed${RESET}"
fi

# Restore original TypewriterText
if [ -f "packages/client/src/components/DivineDialog/TypewriterText.original.tsx" ]; then
    cp packages/client/src/components/DivineDialog/TypewriterText.original.tsx packages/client/src/components/DivineDialog/TypewriterText.tsx
    rm -f packages/client/src/components/DivineDialog/TypewriterText.original.tsx
    rm -f packages/client/src/components/DivineDialog/TypewriterText.debug.tsx
    echo -e "${GREEN}✅ TypewriterText restored${RESET}"
fi

# Restore original contentSanitizer
if [ -f "packages/client/src/utils/contentSanitizer.original.ts" ]; then
    cp packages/client/src/utils/contentSanitizer.original.ts packages/client/src/utils/contentSanitizer.ts
    rm -f packages/client/src/utils/contentSanitizer.original.ts
    rm -f packages/client/src/utils/contentSanitizer.debug.ts
    echo -e "${GREEN}✅ contentSanitizer restored${RESET}"
fi

# Remove debug imports from components
for file in \
    "packages/client/src/components/DivineDialog/MessageList.tsx" \
    "packages/client/src/components/DivineDialog/MessageItem.tsx" \
    "packages/client/src/components/DivineDialog/index.tsx" \
    "packages/client/src/stores/useTypedMessagesStore.ts"
do
    if [ -f "$file" ]; then
        # Remove debug import line
        sed -i "/import { uiDebugLogger } from '@\/config\/debug';/d" "$file"
    fi
done

echo -e "${GREEN}✅ UI debug logging disabled!${RESET}"
echo -e "${YELLOW}Note: You may need to rebuild the application for changes to take effect.${RESET}"
