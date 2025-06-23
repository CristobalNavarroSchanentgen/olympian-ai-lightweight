# WebSocket Disconnection Fix - Regex Syntax Error

## Problem Description
The client was disconnecting immediately after receiving model responses. The WebSocket connection would drop right after the backend successfully streamed the response.

## Root Cause
There was a JavaScript regex syntax error in two components:
- `TypewriterText.tsx`
- `MessageItem.tsx`

Both files contained this incorrect regex pattern:
```javascript
const match = /language-(\\w+)/.exec(className || '');
```

The double backslash `\\w` is invalid JavaScript regex syntax. This caused the components to crash when rendering code blocks in markdown content.

## Solution
Fixed the regex pattern in both files to use the correct single backslash:
```javascript
const match = /language-(\w+)/.exec(className || '');
```

## Technical Details
- The regex is used to detect programming language classes in code blocks (e.g., `language-javascript`)
- The double backslash was likely a copy-paste error or confusion with string escaping
- When the regex threw an error, it crashed the React component
- This crash caused the WebSocket connection to disconnect

## Files Modified
1. `packages/client/src/components/DivineDialog/TypewriterText.tsx`
2. `packages/client/src/components/DivineDialog/MessageItem.tsx`

## Testing
After the fix:
1. Model responses should display correctly with the typewriter effect
2. WebSocket connections should remain stable
3. Code blocks in responses should render properly
4. No client disconnections after receiving messages

## Related Issues
This fix complements the typewriter effect improvements made earlier. The complete set of fixes includes:
- Typewriter effect timing and state management
- Regex syntax corrections for code block rendering
- WebSocket stability improvements
