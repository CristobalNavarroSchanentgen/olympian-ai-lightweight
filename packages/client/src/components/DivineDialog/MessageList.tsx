import { Message } from '@olympian/shared';
import { MessageItem } from './MessageItem';
import { Spinner } from '@/components/ui/spinner';
import ReactMarkdown from 'react-markdown';

interface MessageListProps {
  messages: Message[];
  streamedContent: string;
  isThinking: boolean;
  isGenerating: boolean;
  isTransitioning?: boolean;
}

export function MessageList({
  messages,
  streamedContent,
  isThinking,
  isGenerating,
  isTransitioning = false,
}: MessageListProps) {
  // Handle typewriter completion tracking with localStorage as a fallback
  const handleTypewriterComplete = (messageId: string) => {
    try {
      const completedMessages = JSON.parse(localStorage.getItem('typewriter-completed') || '{}');
      completedMessages[messageId] = true;
      localStorage.setItem('typewriter-completed', JSON.stringify(completedMessages));
    } catch (error) {
      console.warn('Failed to save typewriter completion state:', error);
    }
  };

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

  return (
    <div className="space-y-6">
      {messages.map((message, index) => (
        <MessageItem 
          key={message._id?.toString() || index} 
          message={message} 
          isLatest={index === messages.length - 1 && message.role === 'assistant'}
          onTypewriterComplete={handleTypewriterComplete}
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
      {(isGenerating || streamedContent) && !isTransitioning && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-300">Assistant</span>
              <span className="text-xs text-gray-500">
                {isGenerating ? 'streaming...' : 'complete'}
              </span>
            </div>
            <div className="w-full max-w-3xl">
              {streamedContent ? (
                <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
                  <ReactMarkdown
                    components={{
                      pre: ({ node, ...props }) => (
                        <pre className="overflow-x-auto rounded-lg bg-background p-3" {...props} />
                      ),
                      code: ({ node, children, className, ...props }) => {
                        const match = /language-(\\w+)/.exec(className || '');
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
                    {streamedContent}
                  </ReactMarkdown>
                  {isGenerating && (
                    <span className="typewriter-cursor animate-pulse ml-1" aria-hidden="true">▌</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <Spinner size="sm" />
                  <span>Generating response...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
