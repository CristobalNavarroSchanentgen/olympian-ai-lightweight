import { useState, useEffect, useRef, useTransition, Suspense, useMemo, useCallback } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useTypedMessagesStore, useStreamedContent } from '@/stores/useTypedMessagesStore';
import { webSocketChatService } from '@/services/websocketChat';
import { ChatInput } from './ChatInput';
import { MessageList } from './MessageList';
import { ModelSelector } from './ModelSelector';
import { ArtifactPanel } from '@/components/Artifacts';
import { Button } from '@/components/ui/button';
import { Message } from '@olympian/shared';
import { toast } from '@/hooks/useToast';
import { detectArtifact } from '@/lib/artifactDetection';
import { Plus } from 'lucide-react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Spinner } from '@/components/ui/spinner';
import { useRenderDebug } from '@/hooks/useRenderDebug';

// Utility function to safely convert conversation ID to string
function getConversationId(conversation: any): string {
  if (!conversation?._id) return '';
  return String(conversation._id);
}

// Loading fallback for Suspense - moved outside component to prevent recreation
const DialogLoadingFallback = () => (
  <div className="h-full flex items-center justify-center">
    <div className="flex items-center gap-2 text-gray-400">
      <Spinner size="lg" />
      <span>Loading conversation...</span>
    </div>
  </div>
);

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
    createArtifact, 
    isArtifactPanelOpen, 
    selectArtifact,
    setArtifactPanelOpen,
    getArtifactsForConversation
  } = useArtifactStore();
  
  const { clearTypedMessages, addTypedContent, getTypedContent } = useTypedMessagesStore();
  
  const [isThinking, setIsThinking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasImages, setHasImages] = useState(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Use React 18's useTransition for non-urgent updates
  const [isPending, startTransition] = useTransition();
  
  // Get conversation ID with memoization to prevent re-calculations
  const currentConversationId = useMemo(() => getConversationId(currentConversation), [currentConversation]);
  
  // Use the new selector hook to properly subscribe to streaming content
  const streamedContent = useStreamedContent(currentConversationId);

  // Debug hook to track renders and identify infinite loops
  useRenderDebug('DivineDialog', {
    currentConversation: currentConversation?._id,
    messages: messages.length,
    selectedModel,
    isArtifactPanelOpen,
    isThinking,
    isGenerating,
    streamedContent: streamedContent.length,
    currentConversationId,
  });

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Initialize WebSocket connection on component mount
  useEffect(() => {
    const initializeWebSocket = async () => {
      try {
        console.log('[DivineDialog] Initializing WebSocket connection...');
        await webSocketChatService.connect();
        console.log('[DivineDialog] ✅ WebSocket connected successfully');
      } catch (error) {
        console.error('[DivineDialog] ❌ Failed to connect WebSocket:', error);
        toast({
          title: 'Connection Error',
          description: 'Failed to establish real-time connection. Using fallback mode.',
          variant: 'destructive',
        });
      }
    };

    initializeWebSocket();

    // Cleanup on unmount
    return () => {
      console.log('[DivineDialog] Cleaning up WebSocket connection...');
      webSocketChatService.disconnect();
    };
  }, []);

  // Sync artifact panel state with conversation changes
  useEffect(() => {
    if (!currentConversationId) {
      // No conversation selected, clear artifacts
      selectArtifact(null);
      setArtifactPanelOpen(false);
      return;
    }

    // Debounce artifact loading to prevent rapid updates
    const timeoutId = setTimeout(() => {
      const artifactsForConversation = getArtifactsForConversation(currentConversationId);
      
      console.log('🎨 [DivineDialog] Conversation changed, artifacts:', artifactsForConversation.length);
      
      // If conversation has artifacts, ensure panel is open and select most recent
      if (artifactsForConversation.length > 0) {
        const mostRecentArtifact = artifactsForConversation.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];
        
        selectArtifact(mostRecentArtifact);
        setArtifactPanelOpen(true);
        console.log('🎨 [DivineDialog] Auto-selected artifact for conversation:', mostRecentArtifact.id);
      } else {
        // No artifacts, clear selection but keep panel state as user preference
        selectArtifact(null);
        console.log('🎨 [DivineDialog] No artifacts found for conversation');
      }
    }, 100); // Small debounce to prevent rapid updates
    
    return () => clearTimeout(timeoutId);
  }, [currentConversationId, getArtifactsForConversation, selectArtifact, setArtifactPanelOpen]);

  const handleNewConversation = useCallback(() => {
    // Clear typed messages and artifact state when creating a new conversation
    clearTypedMessages();
    selectArtifact(null);
    setArtifactPanelOpen(false);
    createConversation();
    console.log('🆕 [DivineDialog] Created new conversation, cleared artifacts');
  }, [clearTypedMessages, selectArtifact, setArtifactPanelOpen, createConversation]);

  const handleSendMessage = useCallback(async (content: string, images?: string[]) => {
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
      conversationId: currentConversationId || '',
      role: 'user',
      content,
      images,
      createdAt: new Date(),
    };
    addMessage(userMessage);

    // Set loading state
    setIsThinking(true);
    setIsGenerating(false);

    let messageId: string | null = null;
    let assistantContent = '';

    try {
      console.log('[DivineDialog] 📤 Sending message via WebSocket...');
      
      // Send message via WebSocket with handlers
      messageId = await webSocketChatService.sendMessage(
        {
          content,
          model: selectedModel,
          visionModel: selectedVisionModel || undefined,
          conversationId: currentConversationId || undefined,
          images,
        },
        {
          onThinking: (data) => {
            console.log('[DivineDialog] 🤔 Model is thinking...', data);
            setIsThinking(true);
            setIsGenerating(false);
          },

          onGenerating: (data) => {
            console.log('[DivineDialog] ⚡ Model started generating...', data);
            setIsThinking(false);
            setIsGenerating(true);
            // Clear any previous typed content for this conversation
            if (currentConversation) {
              clearTypedMessages();
            }
          },

          onToken: (data) => {
            console.log('[DivineDialog] 🔤 Received token:', data.token);
            assistantContent += data.token;
            
            // Use startTransition for non-urgent content updates
            startTransition(() => {
              // Add token to typed messages store for real-time display
              if (currentConversation) {
                const conversationId = getConversationId(currentConversation);
                addTypedContent(conversationId, data.token);
              }
            });
          },

          onComplete: (data) => {
            console.log('[DivineDialog] ✅ Message completed:', data);
            
            // Wrap all processing in try-catch-finally to ensure UI states are always reset
            try {
              // If this was a new conversation, update the current conversation
              if (!currentConversation && data.conversationId) {
                // Safely convert conversationId to string
                const conversationId = String(data.conversationId);
                
                console.log('[DivineDialog] 🆕 Creating new conversation with ID:', conversationId);
                
                try {
                  setCurrentConversation({
                    _id: conversationId,
                    title: content.substring(0, 50) + '...',
                    model: selectedModel,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    messageCount: 2,
                  });
                  console.log('[DivineDialog] ✅ Successfully set new conversation');
                } catch (convError) {
                  console.error('[DivineDialog] ❌ Error setting conversation:', convError);
                  // Continue processing even if conversation setting fails
                }
              }

              // Get the final content (either from typed messages or from assistant content)
              const finalContent = currentConversationId 
                ? getTypedContent(currentConversationId) || assistantContent
                : assistantContent;

              // Detect if the response should create an artifact
              const artifactDetection = detectArtifact(finalContent);
              let artifactId: string | undefined;

              // Store original response content
              const originalContent = finalContent;
              
              // Determine what content to display in chat
              let chatDisplayContent = originalContent;
              
              // Use processed content that removes code blocks when artifacts are created
              if (artifactDetection.processedContent && artifactDetection.codeBlocksRemoved) {
                chatDisplayContent = artifactDetection.processedContent;
              }

              if (artifactDetection.shouldCreateArtifact && artifactDetection.content) {
                // Create the artifact
                const conversationId = String(data.conversationId);
                
                const artifact = createArtifact({
                  title: artifactDetection.title || 'Untitled Artifact',
                  type: artifactDetection.type!,
                  content: artifactDetection.content,
                  language: artifactDetection.language,
                  conversationId,
                  version: 1,
                });
                artifactId = artifact.id;
                
                // Auto-open artifact panel when artifact is created
                setArtifactPanelOpen(true);
                console.log('🎨 [DivineDialog] Created new artifact:', artifact.id);
              }

              // Add the assistant message to the store with enhanced metadata
              const assistantMessage: Message = {
                conversationId: String(data.conversationId),
                role: 'assistant',
                content: chatDisplayContent, // Use processed content when code blocks are in artifacts
                metadata: {
                  ...data.metadata,
                  artifactId,
                  artifactType: artifactDetection.type,
                  hasArtifact: artifactDetection.shouldCreateArtifact,
                  // Store original content and code removal status
                  originalContent: originalContent,
                  codeBlocksRemoved: artifactDetection.codeBlocksRemoved || false,
                },
                createdAt: new Date(),
              };
              
              // Use startTransition for adding message to avoid blocking UI
              startTransition(() => {
                try {
                  addMessage(assistantMessage);
                  console.log('[DivineDialog] ✅ Successfully added assistant message');
                } catch (msgError) {
                  console.error('[DivineDialog] ❌ Error adding message:', msgError);
                  // Don't throw - we still want to reset UI states
                }
              });

              // Clear typed messages after adding the final message
              if (currentConversation) {
                clearTypedMessages();
              }

              // Reset states
              setHasImages(false);
              
            } catch (error) {
              console.error('[DivineDialog] ❌ Error processing completion:', error);
              
              // Show error to user
              toast({
                title: 'Error',
                description: 'Failed to process the response. The message may not have been saved properly.',
                variant: 'destructive',
              });
              
              // Clear typed messages on error
              if (currentConversation) {
                clearTypedMessages();
              }
            } finally {
              // CRITICAL: Always reset UI states, no matter what happens above
              setIsThinking(false);
              setIsGenerating(false);
              setCurrentMessageId(null);
              console.log('[DivineDialog] ✅ UI states reset in finally block');
            }
          },

          onError: (data) => {
            console.error('[DivineDialog] ❌ WebSocket error:', data);
            setIsThinking(false);
            setIsGenerating(false);
            setCurrentMessageId(null);

            toast({
              title: 'Error',
              description: data.error || 'Failed to send message',
              variant: 'destructive',
            });

            // Clear typed messages on error
            if (currentConversation) {
              clearTypedMessages();
            }
          },

          onConversationCreated: (data) => {
            console.log('[DivineDialog] 🆕 New conversation created:', data.conversationId);
            // Update current conversation if we don't have one
            if (!currentConversation) {
              const conversationId = String(data.conversationId);
              
              try {
                setCurrentConversation({
                  _id: conversationId,
                  title: content.substring(0, 50) + '...',
                  model: selectedModel,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  messageCount: 1,
                });
                console.log('[DivineDialog] ✅ Set conversation from conversation:created event');
              } catch (convError) {
                console.error('[DivineDialog] ❌ Error setting conversation from event:', convError);
              }
            }
          },
        }
      );

      setCurrentMessageId(messageId);
      console.log('[DivineDialog] ✅ Message sent successfully, ID:', messageId);

    } catch (error) {
      console.error('[DivineDialog] ❌ Error sending message:', error);
      
      setIsThinking(false);
      setIsGenerating(false);
      setCurrentMessageId(null);

      toast({
        title: 'Connection Error',
        description: 'Failed to send message. Please check your connection.',
        variant: 'destructive',
      });

      // Clear typed messages on error
      if (currentConversation) {
        clearTypedMessages();
      }
    }
  }, [selectedModel, selectedVisionModel, currentConversationId, addMessage, currentConversation, 
      clearTypedMessages, getTypedContent, addTypedContent, createArtifact, setArtifactPanelOpen, 
      setCurrentConversation]);

  const handleCancelMessage = useCallback(() => {
    if (currentMessageId) {
      console.log('[DivineDialog] ❌ Cancelling message:', currentMessageId);
      webSocketChatService.cancelMessage(currentMessageId);
      setCurrentMessageId(null);
    }
    
    setIsThinking(false);
    setIsGenerating(false);
    
    // Clear typed messages on cancel
    if (currentConversation) {
      clearTypedMessages();
    }
  }, [currentMessageId, currentConversation, clearTypedMessages]);

  const handleLayoutChange = useCallback((sizes: number[]) => {
    // Persist layout to localStorage
    localStorage.setItem('olympian-dialog-layout', JSON.stringify(sizes));
  }, []);

  // Get default layout from localStorage or use defaults
  const defaultLayout = useMemo((): [number, number] => {
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
  }, []);

  // Memoize the chat panel to prevent recreation on every render
  const renderChatPanel = useMemo(() => (
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
        <Suspense fallback={<DialogLoadingFallback />}>
          <MessageList
            messages={messages}
            streamedContent={streamedContent}
            isThinking={isThinking}
            isGenerating={isGenerating}
            isTransitioning={isPending}
          />
        </Suspense>
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Fixed at bottom */}
      <div className="border-t border-gray-800 p-4 flex-shrink-0 bg-gray-900/80 backdrop-blur-sm">
        <ChatInput
          onSendMessage={handleSendMessage}
          onCancel={handleCancelMessage}
          isDisabled={isThinking || isGenerating}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  ), [currentConversation, hasImages, messages, streamedContent, isThinking, isGenerating, 
      isPending, handleNewConversation, handleSendMessage, handleCancelMessage]);

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
            {renderChatPanel}
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
        // When artifact panel is closed, use single panel
        <div className="flex-1 flex flex-col bg-gray-900">
          {renderChatPanel}
        </div>
      )}
    </div>
  );
}
