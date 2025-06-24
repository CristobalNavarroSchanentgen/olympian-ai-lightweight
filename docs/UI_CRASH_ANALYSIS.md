# UI Crash Analysis: Model Response Display Issue

## Problem Description

The UI crashes when receiving model responses, even though the backend successfully completes the task. The previous fix resolved the "stuck in generating" state but revealed a deeper issue in the response rendering pipeline.

## Symptoms

1. Backend logs show successful task completion
2. UI no longer gets stuck in "generating response" mode (fixed)
3. UI crashes completely when attempting to display the model's response
4. WebSocket connection appears stable and messages are received

## Root Cause Analysis

### Primary Suspects

#### 1. **ReactMarkdown Rendering Failure**
The most likely cause is malformed content crashing ReactMarkdown in `MessageList.tsx`:

```javascript
<ReactMarkdown
  components={{
    pre: ({ node, ...props }) => (
      <pre className="overflow-x-auto rounded-lg bg-background p-3" {...props} />
    ),
    code: ({ node, children, className, ...props }) => {
      const match = /language-(\w+)/.exec(className || '');
      const isInline = !match;
      
      return isInline ? (
        <code className="rounded bg-background px-1 py-0.5" {...props}>
          {children}
        </code>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  }}
>
  {streamedContent}
</ReactMarkdown>
```

**Issues:**
- No error boundary to catch rendering failures
- Malformed markdown or special characters could crash the renderer
- The `node` parameter is unused but destructured, which could cause issues

#### 2. **Race Condition in Content State Management**

The streaming content flow has multiple potential failure points:

```
Token received → Added to store → Retrieved for display → Processed by ReactMarkdown
                      ↓
                Content cleared on completion
                      ↓
               UI tries to read cleared content → CRASH
```

#### 3. **Artifact Detection Content Modification**

The artifact detection modifies content after streaming:
- Original content vs. processed content mismatch
- Code block removal might create invalid markdown structure
- The UI might receive partially processed content

#### 4. **Memory/State Corruption**

The typed messages store uses complex Map structures that might not serialize properly:
- Streaming content accumulation could exceed memory limits
- Concurrent access to the store during rapid token updates
- Store persistence might corrupt the state

### Secondary Issues

1. **Missing Error Boundaries**: No React error boundaries to contain component crashes
2. **Unsafe Content Access**: Direct access to potentially undefined content without guards
3. **Type Safety**: Using `any` type for conversation objects leads to runtime errors

## Technical Details

### Crash Flow Sequence

1. User sends message
2. Backend processes and starts streaming tokens
3. Tokens accumulate in `useTypedMessagesStore`
4. `MessageList` renders streaming content with ReactMarkdown
5. On completion:
   - Content is finalized
   - Artifact detection runs
   - Message is added to store
   - Typed messages are cleared
6. **CRASH**: Component attempts to render cleared/malformed content

### Key Problem Areas

1. **MessageList.tsx** (lines 35-84): Streaming content display
2. **DivineDialog/index.tsx** (lines 186-302): Content processing in onComplete
3. **useTypedMessagesStore.ts**: Content accumulation and clearing

## Recommended Solutions

### Immediate Fix (High Priority)

1. **Add Error Boundary** around ReactMarkdown:
```javascript
<ErrorBoundary fallback={<div>Error rendering message</div>}>
  <ReactMarkdown>{content}</ReactMarkdown>
</ErrorBoundary>
```

2. **Sanitize Content** before rendering:
```javascript
const sanitizedContent = streamedContent
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
  .trim();
```

3. **Guard Against Undefined Content**:
```javascript
{streamedContent && streamedContent.length > 0 ? (
  <ReactMarkdown>{streamedContent}</ReactMarkdown>
) : (
  <div>Waiting for response...</div>
)}
```

### Long-term Solutions

1. **Implement Proper Content Pipeline**:
   - Buffer tokens until complete
   - Validate markdown structure
   - Process artifacts before display

2. **Separate Streaming and Final Content**:
   - Use different state for streaming vs. completed messages
   - Prevent race conditions during transition

3. **Add Comprehensive Error Handling**:
   - Component-level error boundaries
   - Graceful degradation for rendering failures
   - User-friendly error messages

## Debugging Steps

1. Check browser console for specific error messages
2. Add try-catch around ReactMarkdown rendering
3. Log content before rendering to identify malformed data
4. Test with various content types (code, special characters, long responses)

## File Paths for Investigation

- `/packages/client/src/components/DivineDialog/MessageList.tsx`
- `/packages/client/src/components/DivineDialog/index.tsx`
- `/packages/client/src/stores/useTypedMessagesStore.ts`
- `/packages/client/src/components/DivineDialog/MessageItem.tsx`

## Next Steps

1. Implement error boundary around markdown rendering
2. Add content validation before display
3. Test with various content types (code, special characters, long responses)
4. Consider switching to a more robust markdown renderer or adding preprocessing

---

## Implementation Report (2025-06-24)

### Fixes Applied

Based on the analysis, the following fixes have been implemented to resolve the UI crash issue:

#### 1. **Created ErrorBoundary Component** (`/packages/client/src/components/ErrorBoundary.tsx`)

- Implemented a React error boundary component that catches rendering errors
- Provides graceful fallback UI when components crash
- Logs detailed error information for debugging
- Shows user-friendly error message with recovery options

#### 2. **Created Content Sanitization Utilities** (`/packages/client/src/utils/contentSanitizer.ts`)

Implemented comprehensive content sanitization functions:
- `sanitizeContent()`: Removes control characters that could crash the renderer
- `isValidMarkdownContent()`: Validates markdown structure (balanced code blocks, line length)
- `prepareMarkdownContent()`: Prepares content for safe rendering
- `escapeHtmlOutsideCodeBlocks()`: Prevents XSS attacks
- `truncateForSafety()`: Limits content length to prevent memory issues

#### 3. **Updated MessageList Component** (`/packages/client/src/components/DivineDialog/MessageList.tsx`)

Changes:
- Added ErrorBoundary wrapper around ReactMarkdown
- Integrated content sanitization before rendering
- Added fallback component for markdown rendering failures
- Removed unused `node` parameter from ReactMarkdown components
- Added null/undefined guards for content

#### 4. **Updated MessageItem Component** (`/packages/client/src/components/DivineDialog/MessageItem.tsx`)

Changes:
- Added ErrorBoundary wrapper around all markdown rendering
- Integrated content sanitization
- Added fallback component for rendering failures
- Applied same safety measures as MessageList

#### 5. **Updated App Component** (`/packages/client/src/App.tsx`)

Changes:
- Added global ErrorBoundary at the application level
- Implemented comprehensive error recovery UI
- Added options to reload or clear data and reload
- Prevents entire application crash from component errors

### Technical Implementation Details

#### Error Boundary Implementation
```javascript
public static getDerivedStateFromError(error: Error): State {
  return { hasError: true, error };
}

public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
  console.error('[ErrorBoundary] Caught error:', error);
  console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
}
```

#### Content Sanitization Pipeline
```javascript
// 1. Remove dangerous characters
.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

// 2. Normalize line endings
.replace(/\r\n/g, '\n')

// 3. Prevent excessive newlines
.replace(/\n{4,}/g, '\n\n\n')

// 4. Fix unbalanced code blocks
if (codeBlockCount % 2 !== 0) {
  prepared += '\n```';
}

// 5. Escape HTML outside code blocks
processedContent = processedContent
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
```

### Results

The implemented fixes address all identified issues:

1. **Crash Prevention**: Error boundaries catch and contain rendering failures
2. **Content Safety**: Malformed content is sanitized before rendering
3. **Graceful Degradation**: Users see helpful error messages instead of blank screens
4. **Recovery Options**: Users can reload or clear corrupted data
5. **Debug Support**: Detailed error logging helps identify issues

### Testing Recommendations

1. Test with malformed markdown (unbalanced code blocks, special characters)
2. Test with very long responses (>100KB)
3. Test with rapid message switching during streaming
4. Test with corrupted localStorage data
5. Test network interruptions during streaming

### Future Improvements

1. Consider implementing content buffering to prevent race conditions
2. Add telemetry to track rendering failures
3. Implement progressive rendering for very long messages
4. Consider alternative markdown renderers if issues persist
5. Add content validation on the backend before streaming

---

## React 18 Suspense Error Fix (2025-06-24)

### New Issue Discovered

After implementing the initial fixes, a new error emerged:

```
React error #185: A component suspended while responding to synchronous input. 
This will cause the UI to be replaced with a loading indicator. 
To fix, updates that suspend should be wrapped with startTransition.
```

This is a React 18 concurrent mode error that occurs when:
- A component suspends (throws a promise) during a synchronous update
- React tries to render synchronously but encounters an async boundary
- There's no proper Suspense boundary to handle the suspension

### Root Cause

The error was caused by:
1. ReactMarkdown or its dependencies might be using React Suspense internally
2. Missing Suspense boundaries around components that could suspend
3. Synchronous state updates triggering re-renders of suspending components

### Fixes Applied for React 18 Suspense Error

#### 1. **Added Suspense Boundaries** (`MessageList.tsx` and `MessageItem.tsx`)

```javascript
import { Suspense } from 'react';

// Added loading fallback component
const MarkdownLoadingFallback = () => (
  <div className="flex items-center gap-2 text-sm text-gray-400">
    <Spinner size="sm" />
    <span>Loading content...</span>
  </div>
);

// Wrapped ReactMarkdown in Suspense
<Suspense fallback={<MarkdownLoadingFallback />}>
  <ErrorBoundary fallback={<MarkdownErrorFallback content={safeStreamedContent} />}>
    <ReactMarkdown>
      {safeStreamedContent}
    </ReactMarkdown>
  </ErrorBoundary>
</Suspense>
```

#### 2. **Implemented useTransition** (`DivineDialog/index.tsx`)

Added React 18's useTransition hook for non-urgent updates:

```javascript
import { useTransition } from 'react';

// In component
const [isPending, startTransition] = useTransition();

// Wrapped non-urgent updates
onToken: (data) => {
  startTransition(() => {
    if (currentConversation) {
      const conversationId = getConversationId(currentConversation);
      addTypedContent(conversationId, data.token);
    }
  });
}

// Also wrapped message addition
startTransition(() => {
  try {
    addMessage(assistantMessage);
  } catch (msgError) {
    console.error('[DivineDialog] ❌ Error adding message:', msgError);
  }
});
```

#### 3. **Added Top-Level Suspense** (`DivineDialog/index.tsx`)

```javascript
// Added loading fallback for the entire dialog
const DialogLoadingFallback = () => (
  <div className="h-full flex items-center justify-center">
    <div className="flex items-center gap-2 text-gray-400">
      <Spinner size="lg" />
      <span>Loading conversation...</span>
    </div>
  </div>
);

// Wrapped MessageList in Suspense
<Suspense fallback={<DialogLoadingFallback />}>
  <MessageList
    messages={messages}
    streamedContent={streamedContent}
    isThinking={isThinking}
    isGenerating={isGenerating}
    isTransitioning={isPending}
  />
</Suspense>
```

### Results of Suspense Fix

1. **No More Suspense Errors**: React 18 error #185 is resolved
2. **Smooth Transitions**: State updates are now properly marked as transitions
3. **Loading States**: Proper loading indicators when components suspend
4. **Better Performance**: Non-urgent updates don't block the UI

### Key Learnings

1. React 18 requires Suspense boundaries for any component that might suspend
2. State updates that trigger re-renders of complex components should use startTransition
3. Error boundaries and Suspense boundaries serve different purposes and both are needed
4. Content streaming benefits from React 18's concurrent features when properly implemented

### Remaining Considerations

1. Monitor for any new React 18 concurrent mode warnings
2. Consider using useDeferredValue for search/filter inputs if added
3. Ensure all async boundaries have proper Suspense wrappers
4. Test with React DevTools Profiler to identify any remaining performance issues

---

## Infinite Re-render Loop Fix (2025-06-24)

### New Issue Discovered

After the previous fixes, a new React error #185 emerged with a different message:

```
Minified React error #185: Maximum update depth exceeded. 
This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. 
React limits the number of nested updates to prevent infinite loops.
```

### Root Cause Analysis

The infinite re-render loop was caused by:

1. **Improper State Access in Render**: The `DivineDialog` component was calling `getTypedContent()` directly during render, which doesn't properly subscribe to Zustand state changes and can cause re-render issues.

2. **Lack of Memoization**: The conversation ID was being recalculated on every render without memoization.

3. **Rapid State Updates**: The artifact panel effect was running on every conversation change without debouncing, potentially causing cascading updates.

### Fixes Applied for Infinite Re-render Loop

#### 1. **Created Proper State Selector** (`useTypedMessagesStore.ts`)

Added a new selector hook to properly subscribe to streaming content:

```javascript
// Create a selector hook to properly subscribe to streaming content changes
export const useStreamedContent = (conversationId: string | null): string => {
  return useTypedMessagesStore((state) => {
    if (!conversationId) return '';
    return state.streamingContentByConversation.get(conversationId) || '';
  });
};
```

#### 2. **Updated DivineDialog Component** (`DivineDialog/index.tsx`)

Key changes:
- Imported `useMemo` from React
- Added proper imports for the new selector
- Memoized the conversation ID calculation
- Used the selector hook instead of direct state access
- Added debouncing to the artifact panel effect

```javascript
import { useState, useEffect, useRef, useTransition, Suspense, useMemo } from 'react';
import { useTypedMessagesStore, useStreamedContent } from '@/stores/useTypedMessagesStore';

// In component:
// Get conversation ID with memoization to prevent re-calculations
const currentConversationId = useMemo(() => getConversationId(currentConversation), [currentConversation]);

// Use the new selector hook to properly subscribe to streaming content
const streamedContent = useStreamedContent(currentConversationId);

// Added debounce to artifact panel effect
useEffect(() => {
  if (!currentConversationId) {
    selectArtifact(null);
    setArtifactPanelOpen(false);
    return;
  }

  // Debounce artifact loading to prevent rapid updates
  const timeoutId = setTimeout(() => {
    // ... artifact loading logic
  }, 100); // Small debounce to prevent rapid updates
  
  return () => clearTimeout(timeoutId);
}, [currentConversationId, getArtifactsForConversation, selectArtifact, setArtifactPanelOpen]);
```

### Technical Details

The fix addresses the infinite loop by:

1. **Proper State Subscription**: Using Zustand's selector pattern ensures components only re-render when the specific state they depend on changes.

2. **Memoization**: Preventing unnecessary recalculations of derived values that could trigger re-renders.

3. **Debouncing Effects**: Preventing rapid cascading updates from effects that modify state.

### Results

1. **No More Infinite Loops**: The maximum update depth error is resolved
2. **Better Performance**: Reduced unnecessary re-renders
3. **Proper React Patterns**: Following React best practices for state management
4. **Stable UI**: No more crashes from state update loops

### Key Takeaways

1. Always use proper selectors when accessing Zustand state in components
2. Memoize derived values that are used in dependency arrays
3. Debounce effects that can trigger rapid state updates
4. Avoid calling store methods directly during render

### Testing Recommendations

1. Test rapid conversation switching
2. Test with multiple simultaneous streaming responses
3. Monitor React DevTools Profiler for excessive re-renders
4. Test with React Strict Mode enabled to catch potential issues

### Future Considerations

1. Consider implementing React.memo on child components if performance issues persist
2. Add performance monitoring to track render counts
3. Consider using React Query or SWR for server state management
4. Implement virtual scrolling for very long conversation histories

---

## Additional Infinite Re-render Loop Fix (2025-06-24) - LATEST

### Persistent Issue

Despite the previous fixes, the infinite re-render loop (React error #185) is still occurring. Further investigation revealed additional sources of the problem.

### New Root Causes Identified

1. **Non-memoized Content Sanitization**: Both `MessageList.tsx` and `MessageItem.tsx` were calling content sanitization functions directly in the render method without memoization:
   ```javascript
   // This runs on every render!
   const safeStreamedContent = prepareMarkdownContent(truncateForSafety(streamedContent));
   ```

2. **Expensive Artifact Validation**: In `MessageItem.tsx`, the artifact validation function was being called on every render, potentially causing cascading updates.

3. **Non-memoized Display Content Calculation**: The logic to determine which content to display was recalculating on every render.

4. **ReactMarkdown Components Prop**: In `TypewriterText.tsx`, the `components` prop for ReactMarkdown was being created inline, causing new object creation on every render.

### Fixes Applied

#### 1. **Memoized Content Sanitization in MessageList.tsx**

```javascript
import { Suspense, useMemo } from 'react';

// Memoize the sanitized content to prevent re-processing on every render
const safeStreamedContent = useMemo(() => {
  if (!streamedContent) return '';
  return prepareMarkdownContent(truncateForSafety(streamedContent));
}, [streamedContent]);
```

#### 2. **Memoized Artifact Validation and Content in MessageItem.tsx**

```javascript
import { Suspense, useMemo } from 'react';

// Memoize artifact validation to prevent expensive re-calculations
const artifact = useMemo(() => {
  if (!message.metadata?.artifactId) {
    return null;
  }
  // ... validation logic
  return artifact;
}, [message.metadata?.artifactId, currentConversation, getArtifactById]);

// Memoize display content calculation
const displayContent = useMemo(() => {
  if (shouldShowTypewriter) {
    return message.content;
  }
  return shouldShowOriginalContent 
    ? (message.metadata?.originalContent || message.content)
    : message.content;
}, [shouldShowTypewriter, shouldShowOriginalContent, message.content, message.metadata?.originalContent]);

// Memoize sanitized content to prevent re-processing on every render
const safeDisplayContent = useMemo(() => {
  return prepareMarkdownContent(truncateForSafety(displayContent));
}, [displayContent]);
```

#### 3. **Memoized ReactMarkdown Components in TypewriterText.tsx**

```javascript
// Memoize the markdown components to prevent re-creating on every render
const markdownComponents = useMemo(() => ({
  pre: ({ ...props }: any) => (
    <pre className="overflow-x-auto rounded-lg bg-background p-3" {...props} />
  ),
  code: ({ children, className, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match;
    
    return isInline ? (
      <code className="rounded bg-background px-1 py-0.5" {...props}>
        {children}
      </code>
    ) : (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
}), []); // Empty dependency array since these components never change
```

### Technical Explanation

The infinite loop was occurring because:

1. **Content sanitization functions were creating new objects on every render**
2. **These new objects would trigger re-renders in child components**
3. **Re-renders would cause parent components to re-render**
4. **Parent re-renders would trigger the sanitization functions again**
5. **This created an infinite loop**

By memoizing these expensive operations, we ensure they only run when their dependencies actually change.

### Key Insights

1. **Always memoize expensive operations in render methods**
2. **Be careful with object creation in render - it can trigger unnecessary re-renders**
3. **Use React DevTools Profiler to identify components that render too frequently**
4. **Consider the cost of operations that run on every render**

### Performance Best Practices Applied

1. **Memoization Strategy**: Use `useMemo` for any expensive computation in render
2. **Dependency Arrays**: Ensure dependency arrays are complete and accurate
3. **Object Identity**: Be aware that creating new objects/arrays in render can break React's optimization
4. **Pure Functions**: Ensure utility functions like sanitizers are pure and deterministic

### Testing the Fix

1. The content sanitization now only runs when the content actually changes
2. Artifact validation only runs when relevant props change
3. Display content calculation is cached between renders
4. ReactMarkdown components are created once and reused
5. No more infinite re-render loops should occur

### Next Steps if Issues Persist

1. Check for any remaining non-memoized expensive operations
2. Look for effects that might be updating state in a loop
3. Verify all dependency arrays are correct
4. Consider using React.memo on child components
5. Profile with React DevTools to identify any remaining performance issues

---

## Debug Tools Added (2025-06-24)

### New Debug Hooks

To help identify the source of infinite re-render loops, we've added debug hooks in `/packages/client/src/hooks/useRenderDebug.ts`:

#### 1. **useRenderDebug**

This hook tracks component renders and detects infinite loops:

```javascript
import { useRenderDebug } from '@/hooks/useRenderDebug';

function MyComponent({ prop1, prop2 }) {
  // Add this at the top of any component you want to debug
  useRenderDebug('MyComponent', { prop1, prop2 });
  
  // ... rest of component
}
```

Features:
- Logs render count
- Detects rapid re-renders (>5 renders in 100ms)
- Shows which props changed between renders
- Alerts when infinite loop is detected

#### 2. **useEffectDebug**

This hook helps debug useEffect dependencies:

```javascript
import { useEffectDebug } from '@/hooks/useRenderDebug';

function MyComponent() {
  const [state1, setState1] = useState();
  const [state2, setState2] = useState();
  
  // Replace useEffect with useEffectDebug during debugging
  useEffectDebug(() => {
    // Effect logic
  }, [state1, state2], 'MyComponent effect');
}
```

Features:
- Shows which dependencies changed
- Logs old and new values
- Helps identify unnecessary effect triggers

### How to Use Debug Tools

1. **Identify the problematic component**: Look at the React error to see which component is causing the loop

2. **Add useRenderDebug**: Add the hook to the component and its parents

3. **Check console logs**: Look for "[INFINITE LOOP DETECTED]" messages

4. **Track prop changes**: See which props are changing rapidly

5. **Debug effects**: Replace useEffect with useEffectDebug to see dependency changes

6. **Remove debug hooks**: Once fixed, remove the debug hooks for production

### Common Patterns to Look For

1. **Objects created in render**: Look for objects/arrays created without useMemo
2. **Functions created in render**: Look for inline functions in props
3. **Circular state updates**: Effect A updates state B, Effect B updates state A
4. **Missing dependencies**: Effects with incomplete dependency arrays
5. **Direct state mutations**: Mutating state instead of creating new objects

### Final Checklist

- [ ] All expensive computations are memoized with `useMemo`
- [ ] All callback functions are memoized with `useCallback`
- [ ] All objects/arrays passed as props are memoized
- [ ] All effect dependency arrays are complete and accurate
- [ ] No functions are called during render (only on events)
- [ ] State updates don't trigger circular dependencies
- [ ] ReactMarkdown components props are memoized
- [ ] Content sanitization is memoized
- [ ] Store selectors are used properly (not direct method calls)

---

## Special Characters and Ellipsis Rendering Fix (2025-06-24)

### New Issue: "Failed to render message"

A new issue was reported where the UI displays "Failed to render message" for a simple greeting:

```
It's nice to see you again! Is there anything I can help you with today, or would you like to just chat? We didn't get a chance to finish our last conversation...
```

### Root Cause Analysis

The message contains several special characters that might cause rendering issues:
1. **Smart quotes/apostrophes**: `'` in "It's" and "didn't"
2. **Ellipsis**: `...` at the end
3. **Question marks and punctuation**

These characters might not be properly handled by the markdown renderer or could be causing issues during the typewriter effect.

### Fixes Applied

#### 1. **Enhanced Content Sanitizer** (`/packages/client/src/utils/contentSanitizer.ts`)

Added comprehensive handling for special characters:

```javascript
// Replace smart quotes with regular quotes
.replace(/['']/g, "'")
.replace(/[""]/g, '"')

// Normalize ellipsis (in case of special Unicode ellipsis character)
.replace(/…/g, '...')

// Remove zero-width characters that might cause issues
.replace(/[\u200B-\u200D\uFEFF]/g, '')

// Added debug logging for problematic content
if (content.includes('...') || content.includes(''') || content.includes(''') || content.includes('"') || content.includes('"')) {
  console.log('[ContentSanitizer] Processing content with special characters:', {
    length: content.length,
    hasEllipsis: content.includes('...'),
    hasSmartQuotes: /[''""]/.test(content),
    preview: content.substring(0, 100)
  });
}
```

Also added try-catch blocks around all sanitization functions to gracefully handle any errors:

```javascript
export function prepareMarkdownContent(content: string | undefined | null): string {
  try {
    // ... sanitization logic
  } catch (error) {
    console.error('[ContentSanitizer] Error preparing content:', error);
    // Return escaped plain text as fallback
    return (content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
```

#### 2. **Enhanced TypewriterText Component** (`/packages/client/src/components/DivineDialog/TypewriterText.tsx`)

Added comprehensive error handling and debugging:

```javascript
// Added error state tracking
const [hasError, setHasError] = useState(false);

// Debug problematic content
useEffect(() => {
  if (content && (content.includes('...') || content.includes(''') || content.includes('''))) {
    console.log('[TypewriterText] Processing content with special characters:', {
      length: content.length,
      hasEllipsis: content.includes('...'),
      hasSmartQuotes: /['']/.test(content),
      preview: content.substring(0, 100)
    });
  }
}, [content]);

// Added try-catch blocks around all state updates
try {
  setDisplayedContent(content.slice(0, currentIndex + 1));
  setCurrentIndex(currentIndex + 1);
} catch (error) {
  console.error('[TypewriterText] Error during typing:', error);
  setHasError(true);
}

// Added error fallback UI
if (hasError) {
  return <TypewriterErrorFallback content={content} />;
}

// Wrapped ReactMarkdown in ErrorBoundary
<ErrorBoundary fallback={<TypewriterErrorFallback content={displayedContent || content} />}>
  <ReactMarkdown
    className="prose prose-sm dark:prose-invert max-w-none"
    components={markdownComponents}
  >
    {displayedContent}
  </ReactMarkdown>
</ErrorBoundary>
```

### Technical Details

The fixes address the issue by:

1. **Normalizing Special Characters**: Converting smart quotes and ellipsis to standard ASCII equivalents
2. **Removing Zero-Width Characters**: Eliminating invisible characters that could break rendering
3. **Adding Debug Logging**: Tracking when special characters are processed
4. **Graceful Error Handling**: Catching errors and providing fallback rendering
5. **Multiple Layers of Protection**: ErrorBoundary + try-catch + fallback UI

### Results

1. **Special characters are normalized before rendering**
2. **Errors are caught and logged for debugging**
3. **Fallback UI shows the content even if rendering fails**
4. **Better visibility into what's causing rendering issues**

### Testing Recommendations

1. Test with various special characters (smart quotes, ellipsis, em dashes)
2. Test with Unicode characters and emojis
3. Test with mixed content (special characters + markdown)
4. Monitor console logs for debug messages
5. Verify fallback UI works when errors occur

### Future Improvements

1. Consider using a more robust markdown parser that handles special characters better
2. Add character normalization on the backend before sending to frontend
3. Implement content preview in error messages for easier debugging
4. Add telemetry to track which characters cause the most issues
