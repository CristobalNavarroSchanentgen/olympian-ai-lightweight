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
import { Plus } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

// Create a unique identifier for messages (handles messages without _id)
const getMessageIdentifier = (message: Message, index?: number): string => {
  if (message._id) {
    return message._id.toString();
  }
  // Fallback for messages without _id: use content hash + timestamp + index
  const timestamp = new Date(message.createdAt).getTime();
  const contentHash = message.content.slice(0, 50); // First 50 chars as simple hash
  return `temp_${timestamp}_${contentHash.replace(/\s+/g, '_')}_${index || 0}`;
};

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

  const { 
    isArtifactPanelOpen, 
    setArtifactPanelOpen, 
    selectArtifact,
    loadArtifactsForConversation,
    getArtifactById 
  } = useArtifactStore();
  
  const [isThinking, setIsThinking] = useState(false);
  const [hasImages, setHasImages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Track completed typewriter messages using a ref - persists across remounts
  const completedTypewriterMessages = useRef<Set<string>>(new Set());

  // Track finalized messages - messages that should never show typewriter again
  const finalizedMessages = useRef<Set<string>>(new Set());

  // Check if a message has completed typewriter effect
  const hasCompletedTypewriter = (message: Message, index?: number): boolean => {
    const messageId = getMessageIdentifier(message, index);
    return completedTypewriterMessages.current.has(messageId);
  };

  // Check if a message is finalized (should never show typewriter again)
  const isMessageFinalized = (message: Message, index?: number): boolean => {
    const messageId = getMessageIdentifier(message, index);
    return finalizedMessages.current.has(messageId);
  };

  // Mark a message as finalized (will never show typewriter again)
  const markMessageFinalized = (message: Message, index?: number) => {
    const messageId = getMessageIdentifier(message, index);
    finalizedMessages.current.add(messageId);
    
    // Also persist to localStorage as backup
    try {
      const finalized = JSON.parse(localStorage.getItem('typewriter-finalized') || '{}');
      finalized[messageId] = true;
      localStorage.setItem('typewriter-finalized', JSON.stringify(finalized));
    } catch (error) {
      console.warn('Failed to save finalized message state:', error);
    }
  };

  // Mark a message as having completed typewriter effect
  const onTypewriterComplete = (message: Message, index?: number) => {
    const messageId = getMessageIdentifier(message, index);
    completedTypewriterMessages.current.add(messageId);
    
    // Also mark as finalized when typewriter completes
    markMessageFinalized(message, index);
    
    // Also persist to localStorage as backup for page refreshes
    try {
      const completedMessages = JSON.parse(localStorage.getItem('typewriter-completed') || '{}');
      completedMessages[messageId] = true;
      localStorage.setItem('typewriter-completed', JSON.stringify(completedMessages));
    } catch (error) {
      console.warn('Failed to save typewriter completion state:', error);
    }
  };

  // Initialize refs from localStorage on mount
  useEffect(() => {
    try {
      const savedCompleted = localStorage.getItem('typewriter-completed');
      if (savedCompleted) {
        const completedMessages = JSON.parse(savedCompleted);
        Object.keys(completedMessages).forEach(messageId => {
          if (completedMessages[messageId]) {
            completedTypewriterMessages.current.add(messageId);
          }
        });
      }

      const savedFinalized = localStorage.getItem('typewriter-finalized');
      if (savedFinalized) {
        const finalizedMessagesData = JSON.parse(savedFinalized);
        Object.keys(finalizedMessagesData).forEach(messageId => {
          if (finalizedMessagesData[messageId]) {
            finalizedMessages.current.add(messageId);
          }
        });
      }
    } catch (error) {
      console.warn('Failed to load typewriter state:', error);
    }
  }, []);

  // Mark existing messages as finalized when messages change (conversation load/switch)
  useEffect(() => {
    messages.forEach((message, index) => {
      if (message.role === 'assistant') {
        // If this message already existed (has an _id), mark it as finalized
        // This prevents re-typewriting when switching conversations or UI events
        if (!isMessageFinalized(message, index)) {
          markMessageFinalized(message, index);
        }
      }
    });
  }, [messages]);

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
      // Send message to server (server handles artifact creation)
      const response = await api.sendMessage({
        message: content,
        model: selectedModel,
        visionModel: selectedVisionModel || undefined,
        conversationId: currentConversation?._id,
        images,
      });

      console.log('🎯 [DivineDialog] Server response:', {
        hasConversation: !!response.conversation,
        messageLength: response.message?.length || 0,
        hasMetadata: !!response.metadata,
        hasArtifact: !!response.artifact,
        artifactId: response.artifact?.id,
        artifactType: response.artifact?.type,
        metadata: response.metadata
      });

      // If this was a new conversation, update the current conversation
      if (!currentConversation && response.conversation) {
        setCurrentConversation(response.conversation);
      }

      // Create assistant message using server-provided data
      const assistantMessage: Message = {
        conversationId: response.conversationId,
        role: 'assistant',
        content: response.message, // Use server-processed content (code blocks removed if artifacts created)
        metadata: response.metadata, // Use server-provided metadata (includes artifact info)
        createdAt: new Date(),
      };
      addMessage(assistantMessage);

      // Handle artifact if created by server - use proper server-first approach
      if (response.artifact?.id) {
        console.log('🎨 [DivineDialog] Server created artifact, syncing conversation artifacts:', response.artifact);
        
        try {
          // Use server-first loading to sync all artifacts for this conversation
          await loadArtifactsForConversation(response.conversationId, true);
          console.log('✅ [DivineDialog] Artifacts synced from server');
          
          // Find and select the specific artifact that was just created
          const createdArtifact = getArtifactById(response.artifact.id);
          
          if (createdArtifact) {
            console.log('🎯 [DivineDialog] Found created artifact, selecting it:', {
              id: createdArtifact.id,
              type: createdArtifact.type,
              title: createdArtifact.title
            });
            
            // Open artifact panel and select the artifact
            setArtifactPanelOpen(true);
            selectArtifact(createdArtifact);
          } else {
            console.warn('⚠️ [DivineDialog] Created artifact not found in store after sync:', response.artifact.id);
          }
          
        } catch (artifactError) {
          console.error('❌ [DivineDialog] Failed to sync artifacts from server:', artifactError);
          // Continue without artifact rather than failing the whole operation
        }
      }

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

  const handleLayoutChange = (sizes: number[]) => {
    // Persist layout to localStorage
    localStorage.setItem('olympian-dialog-layout', JSON.stringify(sizes));
  };

  // Get default layout from localStorage or use defaults
  const getDefaultLayout = (): [number, number] => {
    try {
      const savedLayout = localStorage.getItem('olympian-dialog-layout');
      if (savedLayout) {
        const parsed = JSON.parse(savedLayout);
        if (Array.isArray(parsed) && parsed.length === 2) {
          return [parsed[0], parsed[1]];
        }
      }
    } catch (error) {
      console.warn('Failed to parse saved layout:', error);
    }
    // Default layout: 60% chat, 40% artifacts when both panels are open
    return [60, 40];
  };

  const defaultLayout = getDefaultLayout();

  // Extract the chat content into a stable component to prevent remounting
  const ChatContent = () => (
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
          hasCompletedTypewriter={hasCompletedTypewriter}
          isMessageFinalized={isMessageFinalized}
          onTypewriterComplete={onTypewriterComplete}
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
  );

  return (
    <div className="h-full flex bg-gray-900">
      {isArtifactPanelOpen ? (
        // When artifact panel is open, use resizable panels
        <PanelGroup 
          direction="horizontal" 
          onLayout={handleLayoutChange}
          className="h-full"
        >
          {/* Chat Panel */}
          <Panel 
            defaultSize={defaultLayout[0]} 
            minSize={30}
            id="chat-panel"
            order={1}
          >
            <ChatContent />
          </Panel>

          {/* Resizable Handle */}
          <PanelResizeHandle className="w-1 bg-gray-700 hover:bg-gray-600 transition-colors duration-200 relative group">
            {/* Visual indicator */}
            <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 bg-gray-600 group-hover:bg-gray-500 rounded-full"></div>
          </PanelResizeHandle>

          {/* Artifact Panel */}
          <Panel 
            defaultSize={defaultLayout[1]} 
            minSize={25}
            id="artifact-panel"
            order={2}
          >
            <ArtifactPanel />
          </Panel>
        </PanelGroup>
      ) : (
        // When artifact panel is closed, use the same ChatContent component
        <div className="flex-1">
          <ChatContent />
        </div>
      )}
    </div>
  );
}