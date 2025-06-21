import { useState, useEffect } from 'react';
import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';

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
    <div className={cn('flex flex-col', isUser && 'items-end')}>
      <div className={cn('w-full', isUser && 'flex flex-col items-end')}>
        <div className="flex items-center gap-2 mb-1">
          {/* User/Bot Icon */}
          <div className={cn(
            'flex items-center justify-center w-6 h-6 rounded-full',
            isUser ? 'bg-primary/10' : 'bg-secondary'
          )}>
            {isUser ? (
              <User className="w-4 h-4 text-primary" />
            ) : (
              <Bot className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
          
          <span className="text-sm font-medium">
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-muted-foreground">
            {format(new Date(message.createdAt), 'HH:mm')}
          </span>
          {message.metadata?.model && (
            <span className="text-xs text-muted-foreground">
              • {message.metadata.model}
            </span>
          )}
          {message.metadata?.tokens && (
            <span className="text-xs text-muted-foreground">
              • {message.metadata.tokens} tokens
            </span>
          )}
        </div>
        
        <div
          className={cn(
            'rounded-lg p-3',
            isUser ? 'bg-secondary' : 'bg-muted',
            isUser && 'max-w-[80%]'
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
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          ) : (
            <>
              {!hasTyped && isLatest ? (
                <TypewriterText
                  content={message.content}
                  speed={15}
                  onComplete={() => setHasTyped(true)}
                />
              ) : (
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
                  {message.content}
                </ReactMarkdown>
              )}
            </>
          )}
          
          {/* Error */}
          {message.metadata?.error && (
            <div className="mt-2 text-sm text-destructive">
              Error: {message.metadata.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
