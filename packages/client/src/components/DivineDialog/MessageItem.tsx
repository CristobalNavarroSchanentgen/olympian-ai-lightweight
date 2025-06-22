import { useState, useEffect } from 'react';
import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { CodeBlock } from '../ui/codeblock';

interface MessageItemProps {
  message: Message;
  isLatest?: boolean;
}

export function MessageItem({ message, isLatest = false }: MessageItemProps) {
  const isUser = message.role === 'user';
  const [hasTyped, setHasTyped] = useState(!isLatest || isUser);

  // Reset typing state when message changes
  useEffect(() => {
    if (isLatest && !isUser) {
      setHasTyped(false);
    }
  }, [message._id, isLatest, isUser]);

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            'text-xs font-medium',
            isUser ? 'text-gray-400' : 'text-gray-300'
          )}>
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-gray-500">
            {format(new Date(message.createdAt), 'HH:mm')}
          </span>
          {message.metadata?.model && (
            <span className="text-xs text-gray-500">
              • {message.metadata.model}
            </span>
          )}
          {message.metadata?.tokens && (
            <span className="text-xs text-gray-500">
              • {message.metadata.tokens} tokens
            </span>
          )}
        </div>
        
        <div
          className={cn(
            'w-full max-w-3xl',
            isUser ? 'bg-gray-800 rounded-2xl px-4 py-3' : ''
          )}
        >
          {/* Images */}
          {message.images && message.images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              {message.images.map((image, index) => (
                <img
                  key={index}
                  src={`data:image/jpeg;base64,${image}`}
                  alt={`Message image ${index + 1}`}
                  className="rounded-lg w-full h-32 object-cover"
                />
              ))}
            </div>
          )}
          
          {/* Content */}
          {isUser ? (
            <p className="text-sm text-white/90">{message.content}</p>
          ) : (
            <>
              {!hasTyped ? (
                <TypewriterText
                  content={message.content}
                  speed={15}
                  onComplete={() => setHasTyped(true)}
                />
              ) : (
                <ReactMarkdown
                  className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed"
                  components={{
                    pre: ({ node: _node, children }) => {
                      // Extract the code content and language from the children
                      if (children && typeof children === 'object' && 'props' in children) {
                        const { className, children: codeChildren } = (children as any).props;
                        return (
                          <CodeBlock className={className} showLineNumbers={false}>
                            {codeChildren}
                          </CodeBlock>
                        );
                      }
                      return (
                        <CodeBlock showLineNumbers={false}>
                          {children}
                        </CodeBlock>
                      );
                    },
                    code: ({ node: _node, children, className, ...props }) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !match;
                      
                      return isInline ? (
                        <code className="rounded bg-gray-800 px-1 py-0.5 text-sm" {...props}>
                          {children}
                        </code>
                      ) : (
                        // For code blocks, let the parent pre element handle the rendering
                        <>{children}</>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </>
          )}
          
          {/* Error */}
          {message.metadata?.error && (
            <div className="mt-2 text-sm text-red-400">
              Error: {message.metadata.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
