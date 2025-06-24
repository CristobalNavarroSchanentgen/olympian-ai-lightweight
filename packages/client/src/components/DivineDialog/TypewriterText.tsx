import { useEffect, useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { prepareMarkdownContent, truncateForSafety } from '@/utils/contentSanitizer';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onStart?: () => void;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean;
}

// Fallback component for typewriter rendering errors
const TypewriterErrorFallback = ({ content }: { content: string }) => (
  <div className="prose prose-sm dark:prose-invert max-w-none">
    <div className="p-4 border border-yellow-500 rounded-md bg-yellow-50 dark:bg-yellow-900/20 mb-4">
      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
        Typewriter effect failed. Showing content directly:
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
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const lastStreamedIndexRef = useRef(0);

  // Validate and sanitize content using useMemo - following React patterns from Context7
  const safeContent = useMemo(() => {
    try {
      // Guard against null/undefined content
      if (!content || typeof content !== 'string') {
        console.warn('[TypewriterText] Invalid content provided:', typeof content);
        return '';
      }

      // Log special characters for debugging - using proper Unicode patterns
      if (content.includes('...') || /[\u2018\u2019\u201C\u201D\u2026]/.test(content)) {
        console.log('[TypewriterText] Processing content with special characters:', {
          length: content.length,
          hasEllipsis: content.includes('...'),
          hasSmartQuotes: /[\u2018\u2019\u201C\u201D]/.test(content),
          hasUnicodeEllipsis: content.includes('\u2026'),
          preview: content.substring(0, 100)
        });
      }
      
      // Apply comprehensive sanitization
      const sanitized = prepareMarkdownContent(truncateForSafety(content));
      
      if (!sanitized) {
        console.warn('[TypewriterText] Content sanitization resulted in empty string');
        return '';
      }
      
      console.log('[TypewriterText] Content sanitized successfully:', {
        originalLength: content.length,
        sanitizedLength: sanitized.length
      });
      
      return sanitized;
    } catch (error) {
      console.error('[TypewriterText] Error sanitizing content:', error);
      setHasError(true);
      // Return plain text fallback following React error handling patterns
      return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
  }, [content]);

  // Memoize markdown components following ReactMarkdown documentation patterns
  const markdownComponents = useMemo(() => ({
    // Custom pre component following ReactMarkdown docs
    pre: (props: any) => {
      try {
        const { children, ...rest } = props;
        return (
          <pre className="overflow-x-auto rounded-lg bg-background p-3" {...rest}>
            {children}
          </pre>
        );
      } catch (error) {
        console.error('[TypewriterText] Error rendering pre:', error);
        return <pre {...props} />;
      }
    },
    // Custom code component following ReactMarkdown docs
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
        console.error('[TypewriterText] Error rendering code:', error);
        return <code {...props}>{props.children}</code>;
      }
    },
  }), []); // Empty dependency array since components never change

  // Handle content updates with proper error handling
  useEffect(() => {
    try {
      console.log('[TypewriterText] Content update effect triggered:', {
        isStreaming,
        contentLength: safeContent.length,
        lastStreamedIndex: lastStreamedIndexRef.current
      });

      if (isStreaming) {
        // During streaming, show content progressively
        const newContent = safeContent.slice(0, lastStreamedIndexRef.current + 1);
        setDisplayedContent(newContent);
        
        if (safeContent.length > lastStreamedIndexRef.current) {
          lastStreamedIndexRef.current = safeContent.length;
        }
        
        setIsTyping(true);
        return;
      }
      
      // For non-streaming mode, reset for typewriter effect
      console.log('[TypewriterText] Resetting for typewriter mode');
      setDisplayedContent('');
      setCurrentIndex(0);
      setIsTyping(true);
      setHasStarted(false);
      lastStreamedIndexRef.current = 0;
      
    } catch (error) {
      console.error('[TypewriterText] Error in content update effect:', error);
      setHasError(true);
    }
  }, [safeContent, isStreaming]);

  // Typewriter animation effect
  useEffect(() => {
    try {
      if (isStreaming) return;

      // Start callback
      if (currentIndex === 0 && safeContent.length > 0 && !hasStarted) {
        console.log('[TypewriterText] Starting typewriter effect');
        setHasStarted(true);
        onStart?.();
      }

      // Typing animation
      if (currentIndex < safeContent.length) {
        const timeout = setTimeout(() => {
          try {
            setDisplayedContent(safeContent.slice(0, currentIndex + 1));
            setCurrentIndex(prev => prev + 1);
          } catch (error) {
            console.error('[TypewriterText] Error during typing animation:', error);
            setHasError(true);
          }
        }, speed);

        return () => clearTimeout(timeout);
      } 
      
      // Completion
      if (currentIndex === safeContent.length && isTyping) {
        console.log('[TypewriterText] Typewriter effect completed');
        setIsTyping(false);
        onComplete?.();
      }
      
    } catch (error) {
      console.error('[TypewriterText] Error in typewriter effect:', error);
      setHasError(true);
    }
  }, [currentIndex, safeContent, speed, isTyping, onComplete, onStart, isStreaming, hasStarted]);

  // Streaming display effect
  useEffect(() => {
    try {
      if (isStreaming && safeContent.length > displayedContent.length) {
        const timeout = setTimeout(() => {
          try {
            setDisplayedContent(safeContent.slice(0, displayedContent.length + 1));
          } catch (error) {
            console.error('[TypewriterText] Error during streaming display:', error);
            setHasError(true);
          }
        }, 5);
        
        return () => clearTimeout(timeout);
      }
    } catch (error) {
      console.error('[TypewriterText] Error in streaming effect:', error);
      setHasError(true);
    }
  }, [safeContent, displayedContent, isStreaming]);

  // Error state handling
  if (hasError) {
    console.warn('[TypewriterText] Rendering fallback due to error');
    return <TypewriterErrorFallback content={safeContent} />;
  }

  // Content validation
  if (!safeContent || safeContent.length === 0) {
    console.warn('[TypewriterText] No valid content to display');
    return null;
  }

  // Validate displayed content before rendering
  const finalDisplayedContent = displayedContent || '';
  if (!finalDisplayedContent && !isTyping && !isStreaming) {
    console.warn('[TypewriterText] No displayed content and not typing/streaming');
    return <TypewriterErrorFallback content={safeContent} />;
  }

  try {
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
    console.error('[TypewriterText] Error in render:', error);
    return <TypewriterErrorFallback content={safeContent} />;
  }
}
