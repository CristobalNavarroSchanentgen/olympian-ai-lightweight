import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { api } from '@/services/api';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ModelSelector } from './ModelSelector';
import { ArtifactPanel } from '@/components/Artifacts';
import { Button } from '@/components/ui/button';
import { Message } from '@olympian/shared';
import { toast } from '@/hooks/useToast';
import { detectArtifact } from '@/lib/artifactDetection';
import { Plus } from 'lucide-react';

export function DivineDialog() {
  const {
    currentConversation,
    messages,
    selectedModel,
    selectedVisionModel,
    fetchModels,
    addMessage,
    setCurrentConversation,
    createConversation,
  } = useChatStore();

  const { createArtifact, isArtifactPanelOpen } = useArtifactStore();
  
  const [isThinking, setIsThinking] = useState(false);
  const [hasImages, setHasImages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleNewConversation = () => {
    createConversation();
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

    // Set loading state
    setIsThinking(true);

    try {
      // Use traditional API for all models
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

      // Detect if the response should create an artifact
      const artifactDetection = detectArtifact(response.message);
      let artifactId: string | undefined;

      // Store original response content
      const originalContent = response.message;
      
      // Determine what content to display in chat
      let chatDisplayContent = originalContent;
      
      // Use processed content that removes code blocks when artifacts are created
      if (artifactDetection.processedContent && artifactDetection.codeBlocksRemoved) {
        chatDisplayContent = artifactDetection.processedContent;
      }

      if (artifactDetection.shouldCreateArtifact && artifactDetection.content) {
        // Create the artifact
        const artifact = createArtifact({
          title: artifactDetection.title || 'Untitled Artifact',
          type: artifactDetection.type!,
          content: artifactDetection.content,
          language: artifactDetection.language,
          conversationId: response.conversationId,
          version: 1,
        });
        artifactId = artifact.id;
      }

      // Add the assistant message to the store with enhanced metadata
      const assistantMessage: Message = {
        conversationId: response.conversationId,
        role: 'assistant',
        content: chatDisplayContent, // Use processed content when code blocks are in artifacts
        metadata: {
          ...response.metadata,
          artifactId,
          artifactType: artifactDetection.type,
          hasArtifact: artifactDetection.shouldCreateArtifact,
          // Store original content and code removal status
          originalContent: originalContent,
          codeBlocksRemoved: artifactDetection.codeBlocksRemoved || false,
        },
        createdAt: new Date(),
      };
      addMessage(assistantMessage);

      // Reset states
      setIsThinking(false);
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
    }
  };

  return (
    <div className="h-full flex bg-gray-900">
      {/* Left Panel - Conversation */}
      <div className={`${isArtifactPanelOpen ? 'w-1/2' : 'flex-1'} flex flex-col bg-gray-900 ${isArtifactPanelOpen ? 'border-r border-gray-800' : ''} transition-all duration-300`}>
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
            <div className="text-lg font-semibold text-center flex-1 text-white">
              {currentConversation ? currentConversation.title : 'New Conversation'}
            </div>

            {/* Right side - Model selector */}
            <div className="flex items-center gap-2 justify-end">
              <ModelSelector hasImages={hasImages} />
            </div>
          </div>
        </div>

        {/* Messages - This takes all available space */}
        <div className="flex-1 overflow-y-auto p-4 bg-gray-900">
          <MessageList
            messages={messages}
            streamedContent=""
            isThinking={isThinking}
            isGenerating={false}
            isTransitioning={false}
          />
          <div ref={messagesEndRef} />
        </div>

        {/* Input - Fixed at bottom */}
        <div className="border-t border-gray-800 p-4 flex-shrink-0 bg-gray-900/80 backdrop-blur-sm">
          <ChatInput
            onSendMessage={handleSendMessage}
            onCancel={() => {}}
            isDisabled={isThinking}
            isGenerating={false}
          />
        </div>
      </div>

      {/* Right Panel - Artifacts */}
      <div className={`${isArtifactPanelOpen ? 'w-1/2' : 'w-0'} transition-all duration-300 overflow-hidden`}>
        <ArtifactPanel />
      </div>
    </div>
  );
}