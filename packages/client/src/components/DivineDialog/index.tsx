import { useState, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { useChatStore } from '@/stores/useChatStore';
import { api } from '@/services/api';
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
    setCurrentConversation,
  } = useChatStore();
  
  const [isThinking, setIsThinking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
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
      // Send message via REST API
      const response = await api.sendMessage({
        message: content,
        model: selectedModel,
        conversationId: currentConversation?._id?.toString(),
        images,
      });

      // If this was a new conversation, update the current conversation ID
      if (!currentConversation && response.conversationId) {
        // Fetch the new conversation details
        const newConversation = await api.getConversation(response.conversationId);
        setCurrentConversation(newConversation);
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
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });
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