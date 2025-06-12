import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { useChatStore } from '@/stores/useChatStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ConversationSidebar } from './ConversationSidebar';
import { ModelSelector } from './ModelSelector';
import { Message } from '@olympian/shared';
import { toast } from '@/hooks/useToast';

export function DivineDialog() {
  const {
    currentConversation,
    messages,
    selectedModel,
    fetchModels,
    addMessage,
  } = useChatStore();
  
  const { emit, on, off } = useWebSocket();
  const [isThinking, setIsThinking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [streamedContent, setStreamedContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    // WebSocket event handlers
    const handleThinking = ({ messageId }: { messageId: string }) => {
      setCurrentMessageId(messageId);
      setIsThinking(true);
      setIsGenerating(false);
    };

    const handleGenerating = ({ messageId }: { messageId: string }) => {
      setCurrentMessageId(messageId);
      setIsThinking(false);
      setIsGenerating(true);
    };

    const handleToken = ({ messageId, token }: { messageId: string; token: string }) => {
      if (messageId === currentMessageId) {
        setStreamedContent(prev => prev + token);
      }
    };

    const handleComplete = ({ messageId, metadata }: { messageId: string; metadata: any }) => {
      if (messageId === currentMessageId) {
        // Add the assistant message to the store
        const assistantMessage: Message = {
          conversationId: currentConversation?._id!,
          role: 'assistant',
          content: streamedContent,
          metadata,
          createdAt: new Date(),
        };
        addMessage(assistantMessage);
        
        // Reset states
        setIsThinking(false);
        setIsGenerating(false);
        setCurrentMessageId(null);
        setStreamedContent('');
      }
    };

    const handleError = ({ messageId, error }: { messageId: string; error: string }) => {
      if (messageId === currentMessageId) {
        toast({
          title: 'Error',
          description: error,
          variant: 'destructive',
        });
        setIsThinking(false);
        setIsGenerating(false);
        setCurrentMessageId(null);
        setStreamedContent('');
      }
    };

    on('chat:thinking', handleThinking);
    on('chat:generating', handleGenerating);
    on('chat:token', handleToken);
    on('chat:complete', handleComplete);
    on('chat:error', handleError);

    return () => {
      off('chat:thinking', handleThinking);
      off('chat:generating', handleGenerating);
      off('chat:token', handleToken);
      off('chat:complete', handleComplete);
      off('chat:error', handleError);
    };
  }, [currentMessageId, streamedContent, currentConversation, addMessage, on, off]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedContent]);

  const handleSendMessage = async (content: string, images?: string[]) => {
    if (!selectedModel) {
      toast({
        title: 'Error',
        description: 'Please select a model first',
        variant: 'destructive',
      });
      return;
    }

    // Add user message to store
    const userMessage: Message = {
      conversationId: currentConversation?._id,
      role: 'user',
      content,
      images,
      createdAt: new Date(),
    };
    addMessage(userMessage);

    // Send message via WebSocket
    emit('chat:message', {
      content,
      images,
      model: selectedModel,
      conversationId: currentConversation?._id?.toString(),
    });
  };

  const handleCancelGeneration = () => {
    if (currentMessageId) {
      emit('chat:cancel', { messageId: currentMessageId });
      setIsThinking(false);
      setIsGenerating(false);
      setCurrentMessageId(null);
      setStreamedContent('');
    }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] gap-4">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0">
        <ConversationSidebar />
      </div>

      {/* Main Chat Area */}
      <Card className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {currentConversation ? currentConversation.title : 'New Conversation'}
            </h3>
            <ModelSelector />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          <MessageList
            messages={messages}
            streamedContent={streamedContent}
            isThinking={isThinking}
            isGenerating={isGenerating}
          />
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <ChatInput
            onSendMessage={handleSendMessage}
            onCancel={handleCancelGeneration}
            isDisabled={isThinking || isGenerating}
            isGenerating={isGenerating}
          />
        </div>
      </Card>
    </div>
  );
}