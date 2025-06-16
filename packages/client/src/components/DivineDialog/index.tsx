import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { useChatStore } from '@/stores/useChatStore';
import { api } from '@/services/api';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ModelSelector } from './ModelSelector';
import { Message } from '@olympian/shared';
import { toast } from '@/hooks/useToast';

export function DivineDialog() {
  const {
    currentConversation,
    messages,
    selectedModel,
    selectedVisionModel,
    fetchModels,
    addMessage,
    setCurrentConversation,
  } = useChatStore();
  
  const [isThinking, setIsThinking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [hasImages, setHasImages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

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

    // Update hasImages state for model selector
    setHasImages(!!images && images.length > 0);

    // Add user message to store
    const userMessage: Message = {
      conversationId: currentConversation?._id || '',
      role: 'user',
      content,
      images,
      createdAt: new Date(),
    };
    addMessage(userMessage);

    // Set loading states
    setIsThinking(true);
    setIsGenerating(false);
    setStreamedContent('');

    try {
      // Send message via REST API with vision model if selected
      const response = await api.sendMessage({
        message: content,
        model: selectedModel,
        visionModel: selectedVisionModel || undefined,
        conversationId: currentConversation?._id,
        images,
      });

      // If this was a new conversation, update the current conversation
      if (!currentConversation && response.conversation) {
        setCurrentConversation(response.conversation);
      }

      // Add the assistant message to the store
      const assistantMessage: Message = {
        conversationId: response.conversationId,
        role: 'assistant',
        content: response.message,
        metadata: response.metadata,
        createdAt: new Date(),
      };
      addMessage(assistantMessage);

      // Reset states
      setIsThinking(false);
      setIsGenerating(false);
      setStreamedContent('');
      setHasImages(false);
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Handle vision-specific errors
      if (error instanceof Error && error.message.includes('VISION_UNSUPPORTED')) {
        try {
          const errorData = JSON.parse(error.message);
          toast({
            title: 'Vision Model Required',
            description: errorData.message,
            variant: 'destructive',
          });
        } catch {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to send message',
          variant: 'destructive',
        });
      }
      
      setIsThinking(false);
      setIsGenerating(false);
      setStreamedContent('');
    }
  };

  const handleCancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    setIsGenerating(false);
    setStreamedContent('');
  };

  return (
    <div className="h-full flex flex-col p-4">
      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b p-4 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {currentConversation ? currentConversation.title : 'New Conversation'}
            </h3>
            <ModelSelector hasImages={hasImages} />
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
        <div className="border-t p-4 flex-shrink-0">
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
