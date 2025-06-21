import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import { api, StreamingEvent } from '@/services/api';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ModelSelector } from './ModelSelector';
import { Button } from '@/components/ui/button';
import { Message } from '@olympian/shared';
import { toast } from '@/hooks/useToast';
import { Plus } from 'lucide-react';

export function DivineDialog() {
  const {
    currentConversation,
    messages,
    selectedModel,
    selectedVisionModel,
    modelCapabilities,
    fetchModels,
    addMessage,
    setCurrentConversation,
    createConversation,
  } = useChatStore();
  
  const [isThinking, setIsThinking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamedContent, setStreamedContent] = useState('');
  const [hasImages, setHasImages] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<Message | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedContent]);

  // Handle pending message after streaming content is cleared
  useEffect(() => {
    if (pendingMessage && streamedContent === '') {
      addMessage(pendingMessage);
      setPendingMessage(null);
    }
  }, [pendingMessage, streamedContent, addMessage]);

  const handleNewConversation = () => {
    createConversation();
  };

  // Helper function to check if current model is basic (no capabilities)
  const isBasicModel = () => {
    if (!modelCapabilities) return false;
    return !modelCapabilities.vision && !modelCapabilities.tools && !modelCapabilities.reasoning;
  };

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
      // Check if we should use streaming for basic models
      if (isBasicModel()) {
        console.log('🚀 Using streaming for basic model:', selectedModel);
        
        // Use streaming API for basic models
        await api.sendMessageStreaming(
          {
            message: content,
            model: selectedModel,
            visionModel: selectedVisionModel || undefined,
            conversationId: currentConversation?._id,
            images,
          },
          (event: StreamingEvent) => {
            console.log('📡 Streaming event:', event.type, event);
            
            switch (event.type) {
              case 'connected':
                console.log('✅ Stream connected');
                break;
                
              case 'conversation':
                if (event.conversation && !currentConversation) {
                  setCurrentConversation(event.conversation);
                }
                break;
                
              case 'thinking':
                setIsThinking(event.isThinking || false);
                break;
                
              case 'streaming_start':
                setIsThinking(false);
                setIsGenerating(true);
                setStreamedContent('');
                break;
                
              case 'token':
                if (event.content) {
                  setStreamedContent(event.content);
                }
                break;
                
              case 'streaming_end':
                setIsGenerating(false);
                break;
                
              case 'complete':
                if (event.message && event.metadata) {
                  // Store the message to be added after streaming content is cleared
                  const assistantMessage: Message = {
                    conversationId: currentConversation?._id || event.conversationId || '',
                    role: 'assistant',
                    content: event.message,
                    metadata: event.metadata,
                    createdAt: new Date(),
                  };
                  
                  // Clear streamed content first, then add message via useEffect
                  setStreamedContent('');
                  setPendingMessage(assistantMessage);
                }
                setIsThinking(false);
                setIsGenerating(false);
                setHasImages(false);
                break;
                
              case 'error':
                console.error('❌ Streaming error:', event.error);
                toast({
                  title: 'Error',
                  description: event.error || 'Streaming failed',
                  variant: 'destructive',
                });
                setIsThinking(false);
                setIsGenerating(false);
                setStreamedContent('');
                break;
            }
          },
          modelCapabilities
        );
      } else {
        console.log('🔄 Using traditional API for advanced model:', selectedModel);
        
        // Use traditional API for models with capabilities
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
      }
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
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-2 flex-shrink-0 bg-gray-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          {/* Left side - New button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewConversation}
            className="flex items-center gap-2 text-gray-300 hover:text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>

          {/* Center - Conversation title */}
          <h3 className="text-lg font-semibold text-center flex-1 text-white">
            {currentConversation ? currentConversation.title : 'New Conversation'}
          </h3>

          {/* Right side - Model selector with streaming indicator */}
          <div className="flex items-center gap-2 justify-end">
            {isBasicModel() && (
              <div className="text-xs bg-green-900/30 text-green-400 px-2 py-1 rounded">
                Streaming Enabled
              </div>
            )}
            <ModelSelector hasImages={hasImages} />
          </div>
        </div>
      </div>

      {/* Messages - This takes all available space */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
        <MessageList
          messages={messages}
          streamedContent={streamedContent}
          isThinking={isThinking}
          isGenerating={isGenerating}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Fixed at bottom */}
      <div className="border-t border-gray-800 p-4 flex-shrink-0 bg-gray-900/80 backdrop-blur-sm">
        <ChatInput
          onSendMessage={handleSendMessage}
          onCancel={handleCancelGeneration}
          isDisabled={isThinking || isGenerating}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
