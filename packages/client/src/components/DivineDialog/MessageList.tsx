import { Message } from '@olympian/shared';
import { MessageItem } from './MessageItem';
import { TypewriterText } from './TypewriterText';
import { Spinner } from '@/components/ui/spinner';

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
      
      {/* Streaming Content with Typewriter Effect - Hide during transition */}
      {(isGenerating || (streamedContent && !isTransitioning)) && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-4xl flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-gray-300">Assistant</span>
              <span className="text-xs text-gray-500">
                {isGenerating ? 'streaming...' : 'typing...'}
              </span>
            </div>
            <div className="w-full max-w-3xl">
              {streamedContent ? (
                <TypewriterText
                  content={streamedContent}
                  speed={5} // Faster speed for streaming (5ms per character)
                  isStreaming={isGenerating} // Pass streaming state
                  className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed"
                />
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
