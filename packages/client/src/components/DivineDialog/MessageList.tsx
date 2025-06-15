import { Message } from '@olympian/shared';
import { MessageItem } from './MessageItem';
import { Spinner } from '@/components/ui/spinner';
import { Bot } from 'lucide-react';

interface MessageListProps {
  messages: Message[];
  streamedContent: string;
  isThinking: boolean;
  isGenerating: boolean;
}

export function MessageList({
  messages,
  streamedContent,
  isThinking,
  isGenerating,
}: MessageListProps) {
  if (messages.length === 0 && !isThinking && !isGenerating) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <Bot className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">Start a conversation</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Select a model and send a message to begin. You can include images by dragging them into the input area.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message, index) => (
        <MessageItem 
          key={message._id?.toString() || index} 
          message={message} 
          isLatest={index === messages.length - 1 && message.role === 'assistant'}
        />
      ))}
      
      {/* Thinking State */}
      {isThinking && (
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" />
              <span>Model is thinking...</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Generating State / Streamed Content */}
      {(isGenerating || streamedContent) && (
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Bot className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="rounded-lg bg-muted p-3">
              {streamedContent ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {streamedContent}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
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
