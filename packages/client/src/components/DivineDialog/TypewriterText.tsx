import { useEffect, useState, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onStart?: () => void;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean; // indicates if content is currently being streamed
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

  // Memoize the markdown components to prevent re-creating on every render
  const markdownComponents = useMemo(() => ({
    pre: ({ ...props }: any) => {
      try {
        return <pre className="overflow-x-auto rounded-lg bg-background p-3" {...props} />;
      } catch (error) {
        console.error('[TypewriterText] Error rendering pre:', error);
        return <pre {...props} />;
      }
    },
    code: ({ children, className, ...props }: any) => {
      try {
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
      } catch (error) {
        console.error('[TypewriterText] Error rendering code:', error);
        return <code {...props}>{children}</code>;
      }
    },
  }), []); // Empty dependency array since these components never change

  useEffect(() => {
    try {
      // When content changes in streaming mode, continue from where we left off
      if (isStreaming) {
        // During streaming, only show the new content that hasn't been displayed yet
        const newContent = content.slice(0, lastStreamedIndexRef.current + 1);
        setDisplayedContent(newContent);
        
        // Update our tracking of what's been shown
        if (content.length > lastStreamedIndexRef.current) {
          lastStreamedIndexRef.current = content.length;
        }
        
        setIsTyping(true);
        return;
      }
      
      // For non-streaming mode (final typewriter effect), reset everything
      setDisplayedContent('');
      setCurrentIndex(0);
      setIsTyping(true);
      setHasStarted(false);
      lastStreamedIndexRef.current = 0;
    } catch (error) {
      console.error('[TypewriterText] Error in content update:', error);
      setHasError(true);
    }
  }, [content, isStreaming]);

  useEffect(() => {
    try {
      // Skip typewriter effect during streaming - content is already displayed progressively
      if (isStreaming) {
        return;
      }

      // Call onStart when typewriter begins (only once)
      if (currentIndex === 0 && content.length > 0 && !hasStarted) {
        setHasStarted(true);
        onStart?.();
      }

      // Original typewriter behavior for non-streaming content
      if (currentIndex < content.length) {
        const timeout = setTimeout(() => {
          try {
            setDisplayedContent(content.slice(0, currentIndex + 1));
            setCurrentIndex(currentIndex + 1);
          } catch (error) {
            console.error('[TypewriterText] Error during typing:', error);
            setHasError(true);
          }
        }, speed);

        return () => clearTimeout(timeout);
      } else if (currentIndex === content.length && isTyping) {
        setIsTyping(false);
        onComplete?.();
      }
    } catch (error) {
      console.error('[TypewriterText] Error in typewriter effect:', error);
      setHasError(true);
    }
  }, [currentIndex, content, speed, isTyping, onComplete, onStart, isStreaming, hasStarted]);

  // During streaming, progressively show content as it arrives
  useEffect(() => {
    try {
      if (isStreaming && content.length > displayedContent.length) {
        // Smoothly add new characters during streaming
        const timeout = setTimeout(() => {
          try {
            setDisplayedContent(content.slice(0, displayedContent.length + 1));
          } catch (error) {
            console.error('[TypewriterText] Error during streaming display:', error);
            setHasError(true);
          }
        }, 5); // Fast display during streaming
        
        return () => clearTimeout(timeout);
      }
    } catch (error) {
      console.error('[TypewriterText] Error in streaming effect:', error);
      setHasError(true);
    }
  }, [content, displayedContent, isStreaming]);

  // If there's an error, show the content directly
  if (hasError) {
    return <TypewriterErrorFallback content={content} />;
  }

  return (
    <div className={cn("relative", className)}>
      <ErrorBoundary fallback={<TypewriterErrorFallback content={displayedContent || content} />}>
        <ReactMarkdown
          className="prose prose-sm dark:prose-invert max-w-none"
          components={markdownComponents}
        >
          {displayedContent}
        </ReactMarkdown>
        {(isTyping || isStreaming) && (
          <span className="typewriter-cursor animate-pulse" aria-hidden="true">▌</span>
        )}
      </ErrorBoundary>
    </div>
  );
}
