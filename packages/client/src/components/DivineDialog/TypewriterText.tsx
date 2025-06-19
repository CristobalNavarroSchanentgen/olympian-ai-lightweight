import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface TypewriterTextProps {
  content: string;
  speed?: number;
  onComplete?: () => void;
  className?: string;
  isStreaming?: boolean; // NEW: indicates if content is currently being streamed
}

export function TypewriterText({ 
  content, 
  speed = 20, 
  onComplete,
  className,
  isStreaming = false, // NEW: for streaming mode
}: TypewriterTextProps) {
  const [displayedContent, setDisplayedContent] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);

  useEffect(() => {
    // Reset when content changes
    setDisplayedContent('');
    setCurrentIndex(0);
    setIsTyping(true);
  }, [content]);

  useEffect(() => {
    // For streaming mode, show content immediately with cursor
    if (isStreaming) {
      setDisplayedContent(content);
      setIsTyping(true);
      return;
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
  }, [currentIndex, content, speed, isTyping, onComplete, isStreaming]);

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
