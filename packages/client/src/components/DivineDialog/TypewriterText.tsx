import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onStart?: () => void;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean; // indicates if content is currently being streamed
}

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
  const lastStreamedIndexRef = useRef(0);

  useEffect(() => {
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
  }, [content, isStreaming]);

  useEffect(() => {
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
        setDisplayedContent(content.slice(0, currentIndex + 1));
        setCurrentIndex(currentIndex + 1);
      }, speed);

      return () => clearTimeout(timeout);
    } else if (currentIndex === content.length && isTyping) {
      setIsTyping(false);
      onComplete?.();
    }
  }, [currentIndex, content, speed, isTyping, onComplete, onStart, isStreaming, hasStarted]);

  // During streaming, progressively show content as it arrives
  useEffect(() => {
    if (isStreaming && content.length > displayedContent.length) {
      // Smoothly add new characters during streaming
      const timeout = setTimeout(() => {
        setDisplayedContent(content.slice(0, displayedContent.length + 1));
      }, 5); // Fast display during streaming
      
      return () => clearTimeout(timeout);
    }
  }, [content, displayedContent, isStreaming]);

  return (
    <div className={cn("relative", className)}>
      <ReactMarkdown
        className="prose prose-sm dark:prose-invert max-w-none"
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
        {displayedContent}
      </ReactMarkdown>
      {(isTyping || isStreaming) && (
        <span className="typewriter-cursor animate-pulse" aria-hidden="true">▌</span>
      )}
    </div>
  );
}
