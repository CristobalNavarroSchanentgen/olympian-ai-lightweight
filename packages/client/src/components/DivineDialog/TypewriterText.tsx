import { useEffect, useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { safeMarkdownRender } from '@/utils/contentSanitizer';

// Enhanced debug imports
import { useRenderDebug, useEffectDebug, useStateDebug, usePerformanceMonitor } from '@/hooks/useRenderDebug';
import { useComponentDebugger } from '@/utils/debug/debugManager';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onStart?: () => void;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean;
}

// Enhanced fallback component with debug information
const TypewriterErrorFallback = ({ content, error, debugInfo }: { 
  content: string; 
  error?: Error; 
  debugInfo?: any; 
}) => (
  <div className="prose prose-sm dark:prose-invert max-w-none">
    <div className="p-4 border border-yellow-500 rounded-md bg-yellow-50 dark:bg-yellow-900/20 mb-4">
      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
        ⚠️ Typewriter effect failed
      </p>
      
      {error && (
        <details className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
          <summary className="cursor-pointer hover:underline">Error details</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono overflow-x-auto text-xs">
            {error.message}
            {error.stack && `\n\nStack:\n${error.stack}`}
          </pre>
        </details>
      )}
      
      {debugInfo && import.meta.env.VITE_UI_DEBUG_MODE === 'true' && (
        <details className="text-xs text-yellow-700 dark:text-yellow-300 mb-2">
          <summary className="cursor-pointer hover:underline">Debug information</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono overflow-x-auto text-xs">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </details>
      )}
      
      <p className="text-xs text-yellow-600 dark:text-yellow-400">
        Showing content directly:
      </p>
    </div>
    <div className="whitespace-pre-wrap">{content}</div>
  </div>
);

export function TypewriterText({ 
  content, 
  speed = 20, 
  onStart,
  onComplete,
  className,
  isStreaming = false,
}: TypewriterTextProps) {
  // Enhanced component debugging setup
  const componentDebugger = useComponentDebugger('TypewriterText');
  const getDebugInfo = useRenderDebug('TypewriterText', { content, speed, isStreaming });
  usePerformanceMonitor('TypewriterText', 16); // 16ms threshold for smooth 60fps

  // State with debugging
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);
  const lastStreamedIndexRef = useRef(0);

  // Debug state changes
  useStateDebug('displayedContent', displayedContent, 'TypewriterText');
  useStateDebug('currentIndex', currentIndex, 'TypewriterText');
  useStateDebug('isTyping', isTyping, 'TypewriterText');
  useStateDebug('hasError', hasError, 'TypewriterText');

  // Enhanced content sanitization with comprehensive debugging
  const safeContent = useMemo(() => {
    try {
      componentDebugger.logDebug('Processing content for sanitization', {
        contentLength: content?.length || 0,
        contentType: typeof content,
        isStreaming
      });

      // Input validation with enhanced logging
      if (!content || typeof content !== 'string') {
        const warning = `Invalid content provided: ${typeof content}`;
        componentDebugger.logWarning(warning, { content });
        return '';
      }

      // Use enhanced safe markdown render function
      const renderResult = safeMarkdownRender(content, 'TypewriterText');
      
      if (!renderResult.isValid) {
        componentDebugger.logWarning('Content validation failed', {
          warnings: renderResult.warnings,
          contentPreview: content.substring(0, 100)
        });
      }

      if (renderResult.warnings.length > 0) {
        componentDebugger.logInfo('Content sanitization warnings', {
          warnings: renderResult.warnings,
          originalLength: content.length,
          processedLength: renderResult.content.length
        });
      }

      componentDebugger.logDebug('Content sanitization completed', {
        originalLength: content.length,
        processedLength: renderResult.content.length,
        isValid: renderResult.isValid,
        warningCount: renderResult.warnings.length
      });
      
      return renderResult.content;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      componentDebugger.logError(errorObj, {
        context: 'Content sanitization',
        contentLength: content?.length || 0
      });
      setHasError(true);
      setLastError(errorObj);
      
      // Return safe fallback
      return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [content, componentDebugger, isStreaming]);

  // Memoized markdown components with enhanced error handling
  const markdownComponents = useMemo(() => {
    componentDebugger.logDebug('Creating markdown components');
    
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
          componentDebugger.logError(error as Error, { 
            context: 'Markdown pre component render',
            props: Object.keys(props)
          });
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
          componentDebugger.logError(error as Error, { 
            context: 'Markdown code component render',
            props: Object.keys(props)
          });
          return <code {...props}>{props.children}</code>;
        }
      },
    };
  }, [componentDebugger]);

  // Enhanced content update effect with comprehensive debugging
  useEffectDebug(() => {
    try {
      componentDebugger.logDebug('Content update effect triggered', {
        isStreaming,
        contentLength: safeContent.length,
        lastStreamedIndex: lastStreamedIndexRef.current,
        displayedContentLength: displayedContent.length
      });

      if (isStreaming) {
        // Streaming mode: show content progressively
        const newContentLength = safeContent.length;
        
        if (newContentLength > lastStreamedIndexRef.current) {
          componentDebugger.logDebug('Streaming content updated', {
            previousLength: lastStreamedIndexRef.current,
            newLength: newContentLength,
            delta: newContentLength - lastStreamedIndexRef.current
          });
          
          setDisplayedContent(safeContent);
          lastStreamedIndexRef.current = newContentLength;
        }
        
        setIsTyping(true);
        return;
      }
      
      // Non-streaming mode: reset for typewriter effect
      componentDebugger.logDebug('Resetting for typewriter mode', {
        contentLength: safeContent.length
      });
      
      setDisplayedContent('');
      setCurrentIndex(0);
      setIsTyping(true);
      setHasStarted(false);
      lastStreamedIndexRef.current = 0;
      
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      componentDebugger.logError(errorObj, { 
        context: 'Content update effect',
        isStreaming,
        contentLength: safeContent.length
      });
      setHasError(true);
      setLastError(errorObj);
    }
  }, [safeContent, isStreaming], 'Content update effect', 'TypewriterText');

  // Enhanced typewriter animation effect
  useEffectDebug(() => {
    try {
      if (isStreaming) return;

      // Start callback with debugging
      if (currentIndex === 0 && safeContent.length > 0 && !hasStarted) {
        componentDebugger.logInfo('Starting typewriter effect', {
          contentLength: safeContent.length,
          speed
        });
        setHasStarted(true);
        onStart?.();
      }

      // Typing animation with error handling
      if (currentIndex < safeContent.length) {
        const timeout = setTimeout(() => {
          try {
            const nextChar = safeContent[currentIndex];
            
            // Debug special characters
            if (/[\u2018\u2019\u201C\u201D\u2026]/.test(nextChar)) {
              componentDebugger.logDebug('Processing special character', {
                char: nextChar,
                charCode: nextChar.charCodeAt(0),
                index: currentIndex
              });
            }
            
            setDisplayedContent(safeContent.slice(0, currentIndex + 1));
            setCurrentIndex(prev => prev + 1);
          } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            componentDebugger.logError(errorObj, { 
              context: 'Typewriter animation',
              currentIndex,
              character: safeContent[currentIndex]
            });
            setHasError(true);
            setLastError(errorObj);
          }
        }, speed);

        return () => clearTimeout(timeout);
      } 
      
      // Completion with debugging
      if (currentIndex === safeContent.length && isTyping) {
        const debugInfo = getDebugInfo();
        componentDebugger.logInfo('Typewriter effect completed', {
          totalCharacters: currentIndex,
          totalTime: debugInfo.totalLifetime,
          renderCount: debugInfo.renderCount
        });
        
        setIsTyping(false);
        onComplete?.();
      }
      
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      componentDebugger.logError(errorObj, { context: 'Typewriter effect' });
      setHasError(true);
      setLastError(errorObj);
    }
  }, [currentIndex, safeContent, speed, isTyping, onComplete, onStart, isStreaming, hasStarted, getDebugInfo, componentDebugger], 
  'Typewriter animation effect', 'TypewriterText');

  // Enhanced streaming display effect
  useEffectDebug(() => {
    try {
      if (isStreaming && safeContent.length > displayedContent.length) {
        const timeout = setTimeout(() => {
          try {
            const nextLength = displayedContent.length + 1;
            componentDebugger.logDebug('Streaming display update', {
              from: displayedContent.length,
              to: nextLength,
              totalLength: safeContent.length
            });
            
            setDisplayedContent(safeContent.slice(0, nextLength));
          } catch (error) {
            const errorObj = error instanceof Error ? error : new Error(String(error));
            componentDebugger.logError(errorObj, { 
              context: 'Streaming display',
              displayedLength: displayedContent.length,
              targetLength: safeContent.length
            });
            setHasError(true);
            setLastError(errorObj);
          }
        }, 5);
        
        return () => clearTimeout(timeout);
      }
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      componentDebugger.logError(errorObj, { context: 'Streaming effect' });
      setHasError(true);
      setLastError(errorObj);
    }
  }, [safeContent, displayedContent, isStreaming, componentDebugger], 
  'Streaming display effect', 'TypewriterText');

  // Log render
  componentDebugger.logRender({ content: content?.length, isStreaming, hasError });

  // Enhanced error state handling with debug information
  if (hasError) {
    const debugInfo = getDebugInfo();
    componentDebugger.logWarning('Rendering fallback due to error', {
      error: lastError?.message,
      debugInfo
    });
    
    return (
      <TypewriterErrorFallback 
        content={safeContent} 
        error={lastError || undefined}
        debugInfo={import.meta.env.VITE_UI_DEBUG_MODE === 'true' ? debugInfo : undefined}
      />
    );
  }

  // Enhanced content validation
  if (!safeContent || safeContent.length === 0) {
    componentDebugger.logWarning('No valid content to display', {
      originalContent: content?.length || 0,
      processedContent: safeContent?.length || 0
    });
    return null;
  }

  // Enhanced final validation before rendering
  const finalDisplayedContent = displayedContent || '';
  if (!finalDisplayedContent && !isTyping && !isStreaming) {
    componentDebugger.logWarning('No displayed content and not active', {
      isTyping,
      isStreaming,
      contentLength: safeContent.length
    });
    
    const debugInfo = getDebugInfo();
    return (
      <TypewriterErrorFallback 
        content={safeContent} 
        debugInfo={import.meta.env.VITE_UI_DEBUG_MODE === 'true' ? debugInfo : undefined}
      />
    );
  }

  // Enhanced render with comprehensive error handling
  try {
    return (
      <div className={cn("relative", className)}>
        <ErrorBoundary 
          fallback={
            <TypewriterErrorFallback 
              content={finalDisplayedContent || safeContent}
              debugInfo={import.meta.env.VITE_UI_DEBUG_MODE === 'true' ? getDebugInfo() : undefined}
            />
          }
          componentName="TypewriterText"
        >
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
    const errorObj = error instanceof Error ? error : new Error(String(error));
    componentDebugger.logError(errorObj, { context: 'Final render' });
    
    const debugInfo = getDebugInfo();
    return (
      <TypewriterErrorFallback 
        content={safeContent} 
        error={errorObj}
        debugInfo={import.meta.env.VITE_UI_DEBUG_MODE === 'true' ? debugInfo : undefined}
      />
    );
  }
}
