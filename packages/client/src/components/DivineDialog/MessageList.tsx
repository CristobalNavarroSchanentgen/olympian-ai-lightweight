import { Message } from '@olympian/shared';
import { MessageItem } from './MessageItem';
import { Spinner } from '@/components/ui/spinner';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { prepareMarkdownContent, truncateForSafety } from '@/utils/contentSanitizer';
import ReactMarkdown from 'react-markdown';

interface MessageListProps {
  messages: Message[];
  streamedContent: string;
  isThinking: boolean;
  isGenerating: boolean;
  isTransitioning?: boolean;
}

// Fallback component for markdown rendering errors
const MarkdownErrorFallback = ({ content }: { content: string }) => (
  <div className="p-4 border border-yellow-500 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
      Failed to render markdown
    </p>
    <pre className="text-xs text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap font-mono overflow-x-auto">
      {content.substring(0, 500)}
      {content.length > 500 && '...'}
    </pre>
  </div>
);

export function MessageList({
  messages,
  streamedContent,
  isThinking,
  isGenerating,
  isTransitioning = false,
}: MessageListProps) {
  if (messages.length === 0 && !isThinking && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold mb-2 text-white">Start a conversation</h3>
        <p className="text-sm text-gray-400 max-w-md">
          Select a model and send a message to begin. You can include images by dragging them into the input area.
        </p>
      </div>
    );
  }

  // Sanitize and prepare streamed content for safe rendering
  const safeStreamedContent = prepareMarkdownContent(truncateForSafety(streamedContent));

  return (
    <div className="space-y-6">
      {messages.map((message, index) => (
        <MessageItem 
          key={message._id?.toString() || index} 
          message={message} 
          isLatest={index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}
      
      {/* Thinking State */}
      {isThinking && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-300">Assistant</span>
              <span className="text-xs text-gray-500">thinking...</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Spinner size="sm" />
              <span>Model is thinking...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Streaming Content - Display directly without typewriter effect */}
      {(isGenerating || safeStreamedContent) && !isTransitioning && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-300">Assistant</span>
              <span className="text-xs text-gray-500">
                {isGenerating ? 'streaming...' : 'complete'}
              </span>
            </div>
            <div className="w-full max-w-3xl">
              {safeStreamedContent ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                  <ErrorBoundary 
                    fallback={<MarkdownErrorFallback content={safeStreamedContent} />}
                  >
                    <ReactMarkdown
                      components={{
                        pre: ({ ...props }) => (
                          <pre className="overflow-x-auto rounded-lg bg-background p-3" {...props} />
                        ),
                        code: ({ children, className, ...props }) => {
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
                      {safeStreamedContent}
                    </ReactMarkdown>
                  </ErrorBoundary>
                  {isGenerating && (
                    <span className="typewriter-cursor animate-pulse ml-1" aria-hidden="true">▌</span>
                  )}
                </div>
              ) : isGenerating ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner size="sm" />
                  <span>Waiting for response...</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
