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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingMessageRef = useRef<Message | null>(null);
  const accumulatedContentRef = useRef<string>('');

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedContent]);

  const handleNewConversation = () => {
    createConversation();
  };

  // Helper function to check if current model is basic (no capabilities)
  // Fixed for subproject 3: Handle null modelCapabilities by defaulting to base model for streaming
  const isBasicModel = () => {
    // If modelCapabilities is null (capability detection failed), default to base model
    // This is the correct behavior for subproject 3 multi-host deployment
    if (!modelCapabilities) {
      console.log('🔄 [DivineDialog] modelCapabilities is null, defaulting to basic model for streaming compatibility');
      return true;
    }
    
    const isBasic = !modelCapabilities.vision && !modelCapabilities.tools && !modelCapabilities.reasoning;
    console.log('🔍 [DivineDialog] Model capability check:', {
      model: selectedModel,
      vision: modelCapabilities.vision,
      tools: modelCapabilities.tools,
      reasoning: modelCapabilities.reasoning,
      isBasic
    });
    
    return isBasic;
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

    // Set loading states and reset accumulated content
    setIsThinking(true);
    setIsGenerating(false);
    setStreamedContent('');
    setIsTransitioning(false);
    pendingMessageRef.current = null;
    accumulatedContentRef.current = '';

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
            console.log('📡 Streaming event:', event.type);
            
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
                accumulatedContentRef.current = '';
                setIsTransitioning(false);
                break;
                
              case 'token':
                if (event.token) {
                  // Accumulate tokens for the final message
                  accumulatedContentRef.current += event.token;
                  // Update streamed content to show real-time streaming
                  setStreamedContent(accumulatedContentRef.current);
                }
                break;
                
              case 'streaming_end':
                // Mark that streaming has ended but keep showing the content
                setIsGenerating(false);
                break;
                
              case 'complete':
                // Create the final message using accumulated content
                if (event.metadata) {
                  const assistantMessage: Message = {
                    conversationId: currentConversation?._id || event.conversationId || '',
                    role: 'assistant',
                    content: accumulatedContentRef.current || event.message || '',
                    metadata: event.metadata,
                    createdAt: new Date(),
                  };
                  
                  // Immediately add the message and clear streaming content
                  // This avoids any flash of content
                  addMessage(assistantMessage);
                  setStreamedContent('');
                  setIsGenerating(false);
                  setIsThinking(false);
                  setHasImages(false);
                  accumulatedContentRef.current = '';
                }
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
                setIsTransitioning(false);
                accumulatedContentRef.current = '';
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
      setIsTransitioning(false);
      accumulatedContentRef.current = '';
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
    setIsTransitioning(false);
    accumulatedContentRef.current = '';
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
          isTransitioning={isTransitioning}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Fixed at bottom */}
      <div className="border-t border-gray-800 p-4 flex-shrink-0 bg-gray-900/80 backdrop-blur-sm">
        <ChatInput
          onSendMessage={handleSendMessage}
          onCancel={handleCancelGeneration}
          isDisabled={isThinking || isGenerating || isTransitioning}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
