#!/bin/bash

# Colors
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

echo -e "${CYAN}🔍 Enabling extensive UI debug logging...${RESET}"

# Create a debug configuration file
DEBUG_CONFIG_PATH="packages/client/src/config/debug.ts"

# Create the debug configuration
cat > "$DEBUG_CONFIG_PATH" << 'EOF'
// UI Debug Configuration - Auto-generated
export const DEBUG_CONFIG = {
  // Enable all debug logging
  enabled: true,
  
  // Component-specific logging
  components: {
    typewriterText: true,
    messageList: true,
    messageItem: true,
    divineDialog: true,
    contentSanitizer: true,
    websocket: true,
    stores: true,
    errorBoundary: true,
    artifactPanel: true,
  },
  
  // Log levels
  logLevels: {
    error: true,
    warn: true,
    info: true,
    debug: true,
    trace: true,
  },
  
  // Performance monitoring
  performance: {
    measureRenders: true,
    measureEffects: true,
    trackReRenders: true,
  },
  
  // Content tracking
  content: {
    logSpecialCharacters: true,
    logContentLength: true,
    logSanitization: true,
    logMarkdownParsing: true,
  },
  
  // State tracking
  state: {
    logStateChanges: true,
    logStoreUpdates: true,
    logWebSocketMessages: true,
  },
  
  // Error tracking
  errors: {
    logErrorBoundaries: true,
    logRenderErrors: true,
    logNetworkErrors: true,
    stackTraces: true,
  },
  
  // Timestamp all logs
  timestamps: true,
  
  // Include component stack in logs
  componentStack: true,
};

// Debug logger utility
export class UIDebugLogger {
  private static instance: UIDebugLogger;
  private startTime: number;
  
  private constructor() {
    this.startTime = Date.now();
  }
  
  static getInstance(): UIDebugLogger {
    if (!UIDebugLogger.instance) {
      UIDebugLogger.instance = new UIDebugLogger();
    }
    return UIDebugLogger.instance;
  }
  
  private getTimestamp(): string {
    return DEBUG_CONFIG.timestamps 
      ? `[${new Date().toISOString()}] [+${Date.now() - this.startTime}ms]`
      : '';
  }
  
  private shouldLog(component: string, level: string): boolean {
    if (!DEBUG_CONFIG.enabled) return false;
    
    const componentKey = component.toLowerCase().replace(/-/g, '');
    const componentEnabled = DEBUG_CONFIG.components[componentKey as keyof typeof DEBUG_CONFIG.components];
    const levelEnabled = DEBUG_CONFIG.logLevels[level as keyof typeof DEBUG_CONFIG.logLevels];
    
    return componentEnabled && levelEnabled;
  }
  
  log(component: string, level: string, message: string, data?: any) {
    if (!this.shouldLog(component, level)) return;
    
    const timestamp = this.getTimestamp();
    const prefix = `${timestamp} [${component}] [${level.toUpperCase()}]`;
    
    console[level as keyof Console](`${prefix} ${message}`, data || '');
    
    // Log to localStorage for persistence
    if (level === 'error' || level === 'warn') {
      this.logToStorage(component, level, message, data);
    }
  }
  
  private logToStorage(component: string, level: string, message: string, data?: any) {
    try {
      const logs = JSON.parse(localStorage.getItem('ui-debug-logs') || '[]');
      logs.push({
        timestamp: new Date().toISOString(),
        component,
        level,
        message,
        data: data ? JSON.stringify(data) : null,
      });
      
      // Keep only last 1000 entries
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      localStorage.setItem('ui-debug-logs', JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to log to localStorage:', e);
    }
  }
  
  measurePerformance(component: string, operation: string, fn: () => void) {
    if (!DEBUG_CONFIG.performance.measureRenders) return fn();
    
    const start = performance.now();
    fn();
    const duration = performance.now() - start;
    
    if (duration > 16) { // Log if takes more than one frame (16ms)
      this.log(component, 'warn', `${operation} took ${duration.toFixed(2)}ms`);
    }
  }
  
  logContentInfo(component: string, content: string | undefined | null, context: string) {
    if (!DEBUG_CONFIG.content.logSpecialCharacters || !content) return;
    
    const info = {
      context,
      length: content.length,
      hasSpecialChars: /[\u2018\u2019\u201C\u201D\u2026]/.test(content),
      hasEllipsis: content.includes('...'),
      hasSmartQuotes: /[\u2018\u2019\u201C\u201D]/.test(content),
      hasUnicodeEllipsis: content.includes('\u2026'),
      hasControlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content),
      preview: content.substring(0, 100),
      specialChars: content.match(/[\u2018\u2019\u201C\u201D\u2026]/g) || [],
    };
    
    this.log(component, 'debug', `Content analysis for ${context}:`, info);
  }
  
  clearLogs() {
    localStorage.removeItem('ui-debug-logs');
    console.clear();
    this.log('UIDebugLogger', 'info', 'Logs cleared');
  }
  
  exportLogs(): string {
    const logs = localStorage.getItem('ui-debug-logs') || '[]';
    return logs;
  }
}

// Export singleton instance
export const uiDebugLogger = UIDebugLogger.getInstance();

// Window utility for debugging
if (typeof window !== 'undefined') {
  (window as any).uiDebugLogger = uiDebugLogger;
  (window as any).clearUILogs = () => uiDebugLogger.clearLogs();
  (window as any).exportUILogs = () => {
    const logs = uiDebugLogger.exportLogs();
    const blob = new Blob([logs], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ui-debug-logs-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  console.log('%c🔍 UI Debug Logging Enabled', 'color: #00ff00; font-size: 16px; font-weight: bold');
  console.log('%cCommands available:', 'color: #00ff00');
  console.log('%c  window.clearUILogs() - Clear all debug logs', 'color: #00ff00');
  console.log('%c  window.exportUILogs() - Export logs to file', 'color: #00ff00');
  console.log('%c  window.uiDebugLogger - Access logger instance', 'color: #00ff00');
}
EOF

echo -e "${GREEN}✅ Debug configuration created${RESET}"

# Create enhanced TypewriterText with debug logging
echo -e "${CYAN}📝 Enhancing TypewriterText with debug logging...${RESET}"

cat > "packages/client/src/components/DivineDialog/TypewriterText.debug.tsx" << 'EOF'
import { useEffect, useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { prepareMarkdownContent, truncateForSafety } from '@/utils/contentSanitizer';
import { uiDebugLogger } from '@/config/debug';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onStart?: () => void;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean;
}

// Fallback component for typewriter rendering errors
const TypewriterErrorFallback = ({ content }: { content: string }) => {
  uiDebugLogger.log('TypewriterText', 'error', 'Rendering fallback due to error', { contentLength: content?.length });
  
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <div className="p-4 border border-yellow-500 rounded-md bg-yellow-50 dark:bg-yellow-900/20 mb-4">
        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
          Typewriter effect failed. Showing content directly:
        </p>
      </div>
      <div className="whitespace-pre-wrap">{content}</div>
    </div>
  );
};

export function TypewriterText({ 
  content, 
  speed = 20, 
  onStart,
  onComplete,
  className,
  isStreaming = false,
}: TypewriterTextProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const lastStreamedIndexRef = useRef(0);
  const renderCountRef = useRef(0);
  
  // Track renders
  useEffect(() => {
    renderCountRef.current++;
    uiDebugLogger.log('TypewriterText', 'trace', `Component rendered (${renderCountRef.current} times)`, {
      contentLength: content?.length,
      isStreaming,
      displayedContentLength: displayedContent.length,
    });
  });

  // Validate and sanitize content using useMemo
  const safeContent = useMemo(() => {
    uiDebugLogger.log('TypewriterText', 'debug', 'Starting content sanitization', {
      contentType: typeof content,
      contentLength: content?.length,
      isStreaming,
    });
    
    try {
      // Guard against null/undefined content
      if (!content || typeof content !== 'string') {
        uiDebugLogger.log('TypewriterText', 'warn', 'Invalid content provided', { 
          contentType: typeof content,
          contentValue: content,
        });
        return '';
      }

      // Log content analysis
      uiDebugLogger.logContentInfo('TypewriterText', content, 'pre-sanitization');
      
      // Apply comprehensive sanitization
      const sanitized = prepareMarkdownContent(truncateForSafety(content));
      
      if (!sanitized) {
        uiDebugLogger.log('TypewriterText', 'warn', 'Content sanitization resulted in empty string');
        return '';
      }
      
      uiDebugLogger.log('TypewriterText', 'info', 'Content sanitized successfully', {
        originalLength: content.length,
        sanitizedLength: sanitized.length,
        lengthDiff: content.length - sanitized.length,
      });
      
      // Log post-sanitization analysis
      uiDebugLogger.logContentInfo('TypewriterText', sanitized, 'post-sanitization');
      
      return sanitized;
    } catch (error) {
      uiDebugLogger.log('TypewriterText', 'error', 'Error sanitizing content', { 
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });
      setHasError(true);
      return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [content]);

  // Memoize markdown components
  const markdownComponents = useMemo(() => {
    uiDebugLogger.log('TypewriterText', 'trace', 'Creating markdown components');
    
    return {
      pre: (props: any) => {
        try {
          const { children, ...rest } = props;
          return (
            <pre className="overflow-x-auto rounded-lg bg-background p-3" {...rest}>
              {children}
            </pre>
          );
        } catch (error) {
          uiDebugLogger.log('TypewriterText', 'error', 'Error rendering pre', { error });
          return <pre {...props} />;
        }
      },
      code: (props: any) => {
        try {
          const { children, className, node, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          const isInline = !match;
          
          return isInline ? (
            <code className="rounded bg-background px-1 py-0.5" {...rest}>
              {children}
            </code>
          ) : (
            <code className={className} {...rest}>
              {children}
            </code>
          );
        } catch (error) {
          uiDebugLogger.log('TypewriterText', 'error', 'Error rendering code', { error });
          return <code {...props}>{props.children}</code>;
        }
      },
    };
  }, []);

  // Handle content updates with debug logging
  useEffect(() => {
    uiDebugLogger.measurePerformance('TypewriterText', 'content-update-effect', () => {
      try {
        uiDebugLogger.log('TypewriterText', 'debug', 'Content update effect triggered', {
          isStreaming,
          contentLength: safeContent.length,
          lastStreamedIndex: lastStreamedIndexRef.current,
          currentDisplayedLength: displayedContent.length,
        });

        if (isStreaming) {
          const newContent = safeContent.slice(0, lastStreamedIndexRef.current + 1);
          setDisplayedContent(newContent);
          
          if (safeContent.length > lastStreamedIndexRef.current) {
            lastStreamedIndexRef.current = safeContent.length;
            uiDebugLogger.log('TypewriterText', 'trace', 'Updated streaming index', {
              newIndex: lastStreamedIndexRef.current,
            });
          }
          
          setIsTyping(true);
          return;
        }
        
        uiDebugLogger.log('TypewriterText', 'debug', 'Resetting for typewriter mode');
        setDisplayedContent('');
        setCurrentIndex(0);
        setIsTyping(true);
        setHasStarted(false);
        lastStreamedIndexRef.current = 0;
        
      } catch (error) {
        uiDebugLogger.log('TypewriterText', 'error', 'Error in content update effect', { 
          error: error instanceof Error ? error.message : error,
          stack: error instanceof Error ? error.stack : undefined,
        });
        setHasError(true);
      }
    });
  }, [safeContent, isStreaming, displayedContent.length]);

  // Typewriter animation effect with debug logging
  useEffect(() => {
    uiDebugLogger.measurePerformance('TypewriterText', 'typewriter-effect', () => {
      try {
        if (isStreaming) return;

        // Start callback
        if (currentIndex === 0 && safeContent.length > 0 && !hasStarted) {
          uiDebugLogger.log('TypewriterText', 'info', 'Starting typewriter effect', {
            contentLength: safeContent.length,
            speed,
          });
          setHasStarted(true);
          onStart?.();
        }

        // Typing animation
        if (currentIndex < safeContent.length) {
          const timeout = setTimeout(() => {
            try {
              setDisplayedContent(safeContent.slice(0, currentIndex + 1));
              setCurrentIndex(prev => prev + 1);
              
              // Log progress every 10%
              const progress = Math.floor((currentIndex / safeContent.length) * 10) * 10;
              if (currentIndex % Math.floor(safeContent.length / 10) === 0) {
                uiDebugLogger.log('TypewriterText', 'trace', `Typewriter progress: ${progress}%`, {
                  currentIndex,
                  totalLength: safeContent.length,
                });
              }
            } catch (error) {
              uiDebugLogger.log('TypewriterText', 'error', 'Error during typing animation', { error });
              setHasError(true);
            }
          }, speed);

          return () => clearTimeout(timeout);
        } 
        
        // Completion
        if (currentIndex === safeContent.length && isTyping) {
          uiDebugLogger.log('TypewriterText', 'info', 'Typewriter effect completed', {
            finalLength: safeContent.length,
            duration: hasStarted ? 'calculated' : 'unknown',
          });
          setIsTyping(false);
          onComplete?.();
        }
        
      } catch (error) {
        uiDebugLogger.log('TypewriterText', 'error', 'Error in typewriter effect', { error });
        setHasError(true);
      }
    });
  }, [currentIndex, safeContent, speed, isTyping, onComplete, onStart, isStreaming, hasStarted]);

  // Streaming display effect with debug logging
  useEffect(() => {
    uiDebugLogger.measurePerformance('TypewriterText', 'streaming-effect', () => {
      try {
        if (isStreaming && safeContent.length > displayedContent.length) {
          const timeout = setTimeout(() => {
            try {
              const newDisplayedContent = safeContent.slice(0, displayedContent.length + 1);
              setDisplayedContent(newDisplayedContent);
              
              // Log streaming progress
              if (displayedContent.length % 50 === 0) {
                uiDebugLogger.log('TypewriterText', 'trace', 'Streaming progress', {
                  displayed: displayedContent.length,
                  total: safeContent.length,
                  percentage: Math.round((displayedContent.length / safeContent.length) * 100),
                });
              }
            } catch (error) {
              uiDebugLogger.log('TypewriterText', 'error', 'Error during streaming display', { error });
              setHasError(true);
            }
          }, 5);
          
          return () => clearTimeout(timeout);
        }
      } catch (error) {
        uiDebugLogger.log('TypewriterText', 'error', 'Error in streaming effect', { error });
        setHasError(true);
      }
    });
  }, [safeContent, displayedContent, isStreaming]);

  // Error state handling
  if (hasError) {
    uiDebugLogger.log('TypewriterText', 'warn', 'Rendering fallback due to error state');
    return <TypewriterErrorFallback content={safeContent} />;
  }

  // Content validation
  if (!safeContent || safeContent.length === 0) {
    uiDebugLogger.log('TypewriterText', 'debug', 'No valid content to display');
    return null;
  }

  // Validate displayed content before rendering
  const finalDisplayedContent = displayedContent || '';
  if (!finalDisplayedContent && !isTyping && !isStreaming) {
    uiDebugLogger.log('TypewriterText', 'warn', 'No displayed content and not typing/streaming');
    return <TypewriterErrorFallback content={safeContent} />;
  }

  try {
    uiDebugLogger.log('TypewriterText', 'trace', 'Rendering content', {
      displayedLength: finalDisplayedContent.length,
      isTyping,
      isStreaming,
    });
    
    return (
      <div className={cn("relative", className)}>
        <ErrorBoundary fallback={<TypewriterErrorFallback content={finalDisplayedContent || safeContent} />}>
          <ReactMarkdown
            className="prose prose-sm dark:prose-invert max-w-none"
            components={markdownComponents}
          >
            {finalDisplayedContent}
          </ReactMarkdown>
          {(isTyping || isStreaming) && finalDisplayedContent && (
            <span className="typewriter-cursor animate-pulse" aria-hidden="true">▌</span>
          )}
        </ErrorBoundary>
      </div>
    );
  } catch (error) {
    uiDebugLogger.log('TypewriterText', 'error', 'Error in render', { 
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return <TypewriterErrorFallback content={safeContent} />;
  }
}
EOF

# Backup original and replace with debug version
echo -e "${CYAN}📝 Backing up and replacing TypewriterText...${RESET}"
cp packages/client/src/components/DivineDialog/TypewriterText.tsx packages/client/src/components/DivineDialog/TypewriterText.original.tsx
cp packages/client/src/components/DivineDialog/TypewriterText.debug.tsx packages/client/src/components/DivineDialog/TypewriterText.tsx

# Create debug wrapper for contentSanitizer
echo -e "${CYAN}📝 Creating debug wrapper for contentSanitizer...${RESET}"

cat > "packages/client/src/utils/contentSanitizer.debug.ts" << 'EOF'
import { uiDebugLogger } from '@/config/debug';

// Original functions with debug logging
export function sanitizeContent(content: string | undefined | null): string {
  uiDebugLogger.log('ContentSanitizer', 'debug', 'sanitizeContent called', {
    contentType: typeof content,
    contentLength: content?.length,
  });
  
  if (!content || typeof content !== 'string') {
    uiDebugLogger.log('ContentSanitizer', 'warn', 'Invalid content type', { content });
    return '';
  }

  const steps = [];
  let sanitized = content;
  
  // Step 1: Remove control characters
  const beforeControlChars = sanitized;
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (beforeControlChars !== sanitized) {
    steps.push({
      step: 'remove-control-chars',
      removed: beforeControlChars.length - sanitized.length,
      chars: beforeControlChars.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g),
    });
  }
  
  // Step 2: Replace smart quotes
  const beforeSmartQuotes = sanitized;
  sanitized = sanitized
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"');
  if (beforeSmartQuotes !== sanitized) {
    steps.push({
      step: 'replace-smart-quotes',
      count: (beforeSmartQuotes.match(/[\u2018\u2019\u201C\u201D]/g) || []).length,
    });
  }
  
  // Step 3: Normalize ellipsis
  const beforeEllipsis = sanitized;
  sanitized = sanitized.replace(/\u2026/g, '...');
  if (beforeEllipsis !== sanitized) {
    steps.push({
      step: 'normalize-ellipsis',
      count: (beforeEllipsis.match(/\u2026/g) || []).length,
    });
  }
  
  // Step 4: Remove zero-width characters
  const beforeZeroWidth = sanitized;
  sanitized = sanitized.replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (beforeZeroWidth !== sanitized) {
    steps.push({
      step: 'remove-zero-width',
      removed: beforeZeroWidth.length - sanitized.length,
    });
  }
  
  // Step 5: Normalize line endings
  const beforeLineEndings = sanitized;
  sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (beforeLineEndings !== sanitized) {
    steps.push({
      step: 'normalize-line-endings',
      normalized: true,
    });
  }
  
  uiDebugLogger.log('ContentSanitizer', 'info', 'Content sanitized', {
    originalLength: content.length,
    sanitizedLength: sanitized.length,
    steps,
    preview: sanitized.substring(0, 100),
  });
  
  return sanitized;
}

export function isValidMarkdownContent(content: string): boolean {
  uiDebugLogger.log('ContentSanitizer', 'trace', 'Validating markdown content', {
    contentLength: content.length,
  });
  
  try {
    const checks = {
      hasContent: content.trim().length > 0,
      codeBlocksBalanced: (content.match(/```/g) || []).length % 2 === 0,
      noExcessiveLineLength: !content.split('\n').some(line => line.length > 10000),
      validUnicode: true,
    };
    
    try {
      decodeURIComponent(encodeURIComponent(content));
    } catch {
      checks.validUnicode = false;
    }
    
    const isValid = Object.values(checks).every(v => v === true);
    
    uiDebugLogger.log('ContentSanitizer', 'debug', 'Markdown validation result', {
      isValid,
      checks,
    });
    
    return isValid;
  } catch (error) {
    uiDebugLogger.log('ContentSanitizer', 'error', 'Error validating markdown', { error });
    return false;
  }
}

export function prepareMarkdownContent(content: string | undefined | null): string {
  uiDebugLogger.log('ContentSanitizer', 'debug', 'prepareMarkdownContent called', {
    contentType: typeof content,
    contentLength: content?.length,
  });
  
  try {
    if (!content) {
      uiDebugLogger.log('ContentSanitizer', 'warn', 'No content to prepare');
      return '';
    }
    
    let prepared = sanitizeContent(content);
    
    // Fix unbalanced code blocks
    const codeBlockCount = (prepared.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      prepared += '\n```';
      uiDebugLogger.log('ContentSanitizer', 'info', 'Fixed unbalanced code blocks', {
        codeBlockCount,
      });
    }
    
    // Prevent excessive newlines
    const beforeNewlines = prepared;
    prepared = prepared.replace(/\n{4,}/g, '\n\n\n');
    if (beforeNewlines !== prepared) {
      uiDebugLogger.log('ContentSanitizer', 'debug', 'Normalized excessive newlines');
    }
    
    // Escape HTML
    const htmlEscaped = escapeHtmlOutsideCodeBlocks(prepared);
    if (htmlEscaped !== prepared) {
      uiDebugLogger.log('ContentSanitizer', 'debug', 'Escaped HTML outside code blocks');
    }
    
    return htmlEscaped;
  } catch (error) {
    uiDebugLogger.log('ContentSanitizer', 'error', 'Error preparing markdown content', { error });
    return content || '';
  }
}

export function escapeHtmlOutsideCodeBlocks(content: string): string {
  uiDebugLogger.log('ContentSanitizer', 'trace', 'Escaping HTML outside code blocks');
  
  try {
    const parts = content.split(/(```[\s\S]*?```)/);
    const escaped = parts.map((part, index) => {
      if (index % 2 === 0) {
        // Outside code block
        return part.replace(/</g, '&lt;').replace(/>/g, '&gt;');
      }
      return part;
    }).join('');
    
    return escaped;
  } catch (error) {
    uiDebugLogger.log('ContentSanitizer', 'error', 'Error escaping HTML', { error });
    return content;
  }
}

export function truncateForSafety(content: string | undefined | null, maxLength: number = 500000): string {
  if (!content) return '';
  
  if (content.length > maxLength) {
    uiDebugLogger.log('ContentSanitizer', 'warn', 'Content truncated', {
      originalLength: content.length,
      maxLength,
    });
    return content.substring(0, maxLength) + '\n\n[Content truncated for safety]';
  }
  
  return content;
}
EOF

# Backup and replace contentSanitizer
echo -e "${CYAN}📝 Backing up and replacing contentSanitizer...${RESET}"
cp packages/client/src/utils/contentSanitizer.ts packages/client/src/utils/contentSanitizer.original.ts
cp packages/client/src/utils/contentSanitizer.debug.ts packages/client/src/utils/contentSanitizer.ts

# Modify other components to import and use debug logger
echo -e "${CYAN}📝 Adding debug imports to key components...${RESET}"

# Add debug logging to MessageList.tsx
sed -i '1i import { uiDebugLogger } from '\''@/config/debug'\'';' packages/client/src/components/DivineDialog/MessageList.tsx

# Add debug logging to MessageItem.tsx
sed -i '1i import { uiDebugLogger } from '\''@/config/debug'\'';' packages/client/src/components/DivineDialog/MessageItem.tsx

# Add debug logging to DivineDialog/index.tsx
sed -i '1i import { uiDebugLogger } from '\''@/config/debug'\'';' packages/client/src/components/DivineDialog/index.tsx

# Add debug logging to useTypedMessagesStore.ts
sed -i '1i import { uiDebugLogger } from '\''@/config/debug'\'';' packages/client/src/stores/useTypedMessagesStore.ts

echo -e "${GREEN}✅ UI debug logging enabled!${RESET}"
echo -e "${CYAN}📋 Debug commands available in browser console:${RESET}"
echo -e "  ${YELLOW}window.clearUILogs()${RESET} - Clear all debug logs"
echo -e "  ${YELLOW}window.exportUILogs()${RESET} - Export logs to file"
echo -e "  ${YELLOW}window.uiDebugLogger${RESET} - Access logger instance"
echo -e ""
echo -e "${CYAN}📋 To disable debug logging:${RESET}"
echo -e "  ${YELLOW}make disable-ui-debug${RESET}"
