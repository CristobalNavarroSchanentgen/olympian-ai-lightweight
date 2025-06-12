import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import { User, Bot } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex items-start gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-full',
          isUser ? 'bg-secondary' : 'bg-primary text-primary-foreground'
        )}
      >
        {isUser ? <User className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
      </div>
      
      <div className={cn('flex-1', isUser && 'flex flex-col items-end')}>
        <div className="flex items-center gap-2 mb-1">
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
            <ReactMarkdown
              className="prose prose-sm dark:prose-invert max-w-none"
              components={{
                pre: ({ node, ...props }) => (
                  <pre className="overflow-x-auto rounded-lg bg-background p-3" {...props} />
                ),
                code: ({ node, inline, ...props }) =>
                  inline ? (
                    <code className="rounded bg-background px-1 py-0.5" {...props} />
                  ) : (
                    <code {...props} />
                  ),
              }}
            >
              {message.content}
            </ReactMarkdown>
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