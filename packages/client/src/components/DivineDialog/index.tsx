import { useState, useEffect, useRef } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useTypedMessagesStore } from '@/stores/useTypedMessagesStore';
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
    if (!currentConversation) {
      // No conversation selected, clear artifacts
      selectArtifact(null);
      setArtifactPanelOpen(false);
      return;
    }

    const conversationId = currentConversation._id?.toString() || '';
    const artifactsForConversation = getArtifactsForConversation(conversationId);
    
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
  }, [currentConversation, getArtifactsForConversation, selectArtifact, setArtifactPanelOpen]);

  const handleNewConversation = () => {
    // Clear typed messages and artifact state when creating a new conversation
    clearTypedMessages();
    selectArtifact(null);
    setArtifactPanelOpen(false);
    createConversation();
    console.log('🆕 [DivineDialog] Created new conversation, cleared artifacts');
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
          conversationId: currentConversation?._id,
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
            
            // Add token to typed messages store for real-time display
            if (currentConversation) {
              addTypedContent(currentConversation._id?.toString() || '', data.token);
            }
          },

          onComplete: (data) => {
            console.log('[DivineDialog] ✅ Message completed:', data);
            setIsThinking(false);
            setIsGenerating(false);
            setCurrentMessageId(null);

            // If this was a new conversation, update the current conversation
            if (!currentConversation && data.conversationId) {
              // Safely convert conversationId to string and create conversation object
              const conversationId = typeof data.conversationId === 'object' 
                ? data.conversationId.toString() 
                : String(data.conversationId);
              
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
            const finalContent = currentConversation 
              ? getTypedContent(currentConversation._id?.toString() || '') || assistantContent
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
              const conversationId = typeof data.conversationId === 'object' 
                ? data.conversationId.toString() 
                : String(data.conversationId);
              
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
              conversationId: typeof data.conversationId === 'object' 
                ? data.conversationId.toString() 
                : String(data.conversationId),
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
            
            try {
              addMessage(assistantMessage);
              console.log('[DivineDialog] ✅ Successfully added assistant message');
            } catch (msgError) {
              console.error('[DivineDialog] ❌ Error adding message:', msgError);
            }

            // Clear typed messages after adding the final message
            if (currentConversation) {
              clearTypedMessages();
            }

            // Reset states
            setHasImages(false);
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
              const conversationId = typeof data.conversationId === 'object' 
                ? data.conversationId.toString() 
                : String(data.conversationId);
              
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
  };

  const handleCancelMessage = () => {
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

  // Get the current streamed content for display
  const streamedContent = currentConversation 
    ? getTypedContent(currentConversation._id?.toString() || '') || ''
    : '';

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
                  streamedContent={streamedContent}
                  isThinking={isThinking}
                  isGenerating={isGenerating}
                  isTransitioning={false}
                />
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
              streamedContent={streamedContent}
              isThinking={isThinking}
              isGenerating={isGenerating}
              isTransitioning={false}
            />
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
      )}
    </div>
  );
}