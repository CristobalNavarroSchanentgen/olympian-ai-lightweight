import { create } from 'zustand';
import { Conversation, Message, ModelCapability } from '@olympian/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/useToast';
import { useArtifactStore } from './useArtifactStore';
import { detectArtifact } from '@/lib/artifactDetection';

interface ChatStore {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  models: string[];
  visionModels: string[];
  selectedModel: string | null;
  selectedVisionModel: string | null;
  modelCapabilities: ModelCapability | null;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingModels: boolean;
  
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  setCurrentConversation: (conversation: Conversation) => void;
  createConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  fetchModels: () => Promise<void>;
  fetchVisionModels: () => Promise<void>;
  selectModel: (model: string) => Promise<void>;
  selectVisionModel: (model: string) => void;
  addMessage: (message: Message) => void;
  clearCurrentConversation: () => void;
}

// Fallback vision model detection based on common naming patterns
function detectVisionModelsByName(models: string[]): string[] {
  console.log('🔍 [useChatStore] Running fallback vision model detection on models:', models);
  
  const visionModelPatterns = [
    /llava/i,
    /bakllava/i,
    /llava-llama3/i,
    /llava-phi3/i,
    /llava-v1\.6/i,
    /llama3\.2-vision/i,
    /moondream/i,
    /cogvlm/i,
    /instructblip/i,
    /blip/i,
    /minicpm-v/i,
    /qwen.*vl/i,
    /qwen.*vision/i,
    /internvl/i,
    /deepseek-vl/i,
    /yi-vl/i,
    /phi.*vision/i,
    /phi-3-vision/i,
    // Removed the generic /vision/i pattern as it's too broad
    /multimodal/i
  ];

  const detectedVisionModels = models.filter(model => 
    visionModelPatterns.some(pattern => pattern.test(model))
  );
  
  console.log('🔍 [useChatStore] Fallback detection found vision models:', detectedVisionModels);
  return detectedVisionModels;
}

/**
 * Process messages to recreate artifacts from metadata and restore proper display content
 */
async function processMessagesForArtifacts(messages: Message[], conversationId: string): Promise<Message[]> {
  console.log('🔧 [useChatStore] Processing messages for artifact recreation:', messages.length, 'messages');
  
  // Get the artifact store instance
  const { createArtifact, clearArtifactsForConversation, getArtifactById } = useArtifactStore.getState();
  
  // Clear existing artifacts for this conversation to avoid duplication
  clearArtifactsForConversation(conversationId);
  
  const processedMessages: Message[] = [];
  
  for (const message of messages) {
    // Only process assistant messages that have artifact metadata
    if (message.role === 'assistant' && message.metadata?.hasArtifact && message.metadata?.originalContent) {
      console.log('🔧 [useChatStore] Processing message with artifact metadata:', message._id);
      
      try {
        // Recreate the artifact if it doesn't exist and we have the original content
        if (message.metadata.artifactId && message.metadata.originalContent) {
          const existingArtifact = getArtifactById(message.metadata.artifactId);
          
          if (!existingArtifact) {
            console.log('🔧 [useChatStore] Recreating artifact for message:', message._id);
            
            // Use the detectArtifact function to recreate the artifact
            const artifactDetection = detectArtifact(message.metadata.originalContent);
            
            if (artifactDetection.shouldCreateArtifact && artifactDetection.content) {
              // Create the artifact with a new ID (since we're recreating)
              const recreatedArtifact = createArtifact({
                title: artifactDetection.title || message.metadata.artifactType || 'Recreated Artifact',
                type: message.metadata.artifactType || artifactDetection.type!,
                content: artifactDetection.content,
                language: artifactDetection.language,
                conversationId: conversationId,
                messageId: message._id,
              });
              
              console.log('✅ [useChatStore] Artifact recreated:', recreatedArtifact.id);
              
              // Update the message metadata with the new artifact ID
              const updatedMessage = {
                ...message,
                metadata: {
                  ...message.metadata,
                  artifactId: recreatedArtifact.id,
                },
                // Ensure we show the processed content (without code blocks) in chat
                content: artifactDetection.processedContent || message.content,
              };
              
              processedMessages.push(updatedMessage);
              continue;
            }
          }
        }
        
        // If artifact already exists or creation failed, just restore the proper display content
        const processedMessage = {
          ...message,
          // Use the current content (which should be the processed content without code blocks)
          // If code blocks were removed during original processing, the content should already be correct
        };
        
        processedMessages.push(processedMessage);
        
      } catch (error) {
        console.error('❌ [useChatStore] Failed to recreate artifact for message:', message._id, error);
        // Fallback: use the message as-is
        processedMessages.push(message);
      }
    } else {
      // Regular message without artifacts
      processedMessages.push(message);
    }
  }
  
  console.log('✅ [useChatStore] Message processing complete');
  return processedMessages;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  models: [],
  visionModels: [],
  selectedModel: null,
  selectedVisionModel: null,
  modelCapabilities: null,
  isLoadingConversations: false,
  isLoadingMessages: false,
  isLoadingModels: false,

  fetchConversations: async () => {
    console.log('📞 [useChatStore] fetchConversations called');
    set({ isLoadingConversations: true });
    try {
      const { conversations } = await api.getConversations();
      console.log('✅ [useChatStore] fetchConversations success:', conversations.length, 'conversations');
      set({ conversations });
    } catch (error) {
      console.error('❌ [useChatStore] fetchConversations error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch conversations',
        variant: 'destructive',
      });
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (id) => {
    console.log('📞 [useChatStore] selectConversation called with id:', id);
    try {
      const conversation = await api.getConversation(id);
      console.log('✅ [useChatStore] selectConversation success:', conversation);
      set({ currentConversation: conversation });
      await get().fetchMessages(id);
    } catch (error) {
      console.error('❌ [useChatStore] selectConversation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to load conversation',
        variant: 'destructive',
      });
    }
  },

  setCurrentConversation: (conversation) => {
    console.log('📝 [useChatStore] setCurrentConversation called:', conversation);
    set({ currentConversation: conversation });
    // Also add it to the conversations list if it's not there
    set(state => {
      const exists = state.conversations.some(c => c._id?.toString() === conversation._id?.toString());
      if (!exists) {
        console.log('➕ [useChatStore] Adding new conversation to list');
        return { conversations: [conversation, ...state.conversations] };
      }
      return state;
    });
  },

  createConversation: () => {
    console.log('🆕 [useChatStore] createConversation called');
    set({ currentConversation: null, messages: [] });
  },

  deleteConversation: async (id) => {
    console.log('📞 [useChatStore] deleteConversation called with id:', id);
    try {
      await api.deleteConversation(id);
      
      // Also clear artifacts for this conversation
      const { clearArtifactsForConversation } = useArtifactStore.getState();
      clearArtifactsForConversation(id);
      
      set(state => ({
        conversations: state.conversations.filter(c => c._id?.toString() !== id),
        currentConversation: state.currentConversation?._id?.toString() === id ? null : state.currentConversation,
        messages: state.currentConversation?._id?.toString() === id ? [] : state.messages,
      }));
      console.log('✅ [useChatStore] deleteConversation success');
      toast({
        title: 'Success',
        description: 'Conversation deleted',
      });
    } catch (error) {
      console.error('❌ [useChatStore] deleteConversation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    }
  },

  fetchMessages: async (conversationId) => {
    console.log('📞 [useChatStore] fetchMessages called with conversationId:', conversationId);
    set({ isLoadingMessages: true });
    try {
      const { messages } = await api.getMessages(conversationId);
      console.log('✅ [useChatStore] fetchMessages success:', messages.length, 'messages');
      
      // Process messages to recreate artifacts and restore proper display content
      const processedMessages = await processMessagesForArtifacts(messages, conversationId);
      
      set({ messages: processedMessages });
    } catch (error) {
      console.error('❌ [useChatStore] fetchMessages error:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch messages',
        variant: 'destructive',
      });
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  fetchModels: async () => {
    console.log('🚀 [useChatStore] ===== FETCH MODELS START =====');
    console.log('🚀 [useChatStore] Setting isLoadingModels to true');
    set({ isLoadingModels: true });
    
    try {
      console.log('📞 [useChatStore] Step 1: Calling api.getModels()...');
      
      // Fetch all models first
      const allModels = await api.getModels();
      console.log('✅ [useChatStore] Step 1 SUCCESS: api.getModels() returned:', {
        type: typeof allModels,
        isArray: Array.isArray(allModels),
        length: allModels?.length,
        data: allModels
      });
      
      // Validate the response
      if (!Array.isArray(allModels)) {
        console.error('❌ [useChatStore] ERROR: allModels is not an array!', allModels);
        throw new Error('Invalid models response: expected array, got ' + typeof allModels);
      }
      
      console.log('📊 [useChatStore] Number of models received:', allModels.length);
      console.log('📋 [useChatStore] Models list:', allModels);
      
      // Try to fetch vision models from API
      let visionModels: string[] = [];
      try {
        console.log('📞 [useChatStore] Step 2: Calling api.getVisionModels()...');
        visionModels = await api.getVisionModels();
        console.log('✅ [useChatStore] Step 2 SUCCESS: api.getVisionModels() response:', {
          type: typeof visionModels,
          isArray: Array.isArray(visionModels),
          length: visionModels?.length,
          data: visionModels
        });
      } catch (error) {
        console.warn('⚠️ [useChatStore] Step 2 FAILED: Failed to fetch vision models from API, using fallback detection:', error);
        visionModels = detectVisionModelsByName(allModels);
        console.log('🔄 [useChatStore] Fallback vision models result:', visionModels);
      }
      
      // Validate vision models response
      if (!Array.isArray(visionModels)) {
        console.warn('⚠️ [useChatStore] Warning: visionModels is not an array, converting to empty array:', visionModels);
        visionModels = [];
      }
      
      console.log('📝 [useChatStore] Step 3: About to update store with:');
      console.log('📝 [useChatStore] - models:', allModels);
      console.log('📝 [useChatStore] - visionModels:', visionModels);
      
      // Update the store
      console.log('📝 [useChatStore] Step 3: Calling set() to update store...');
      set({ models: allModels, visionModels });
      console.log('✅ [useChatStore] Step 3 SUCCESS: Store updated');
      
      // Verify the store was updated
      const storeAfterUpdate = get();
      console.log('🔍 [useChatStore] Store verification after update:', {
        modelsLength: storeAfterUpdate.models.length,
        visionModelsLength: storeAfterUpdate.visionModels.length,
        isLoadingModels: storeAfterUpdate.isLoadingModels,
        selectedModel: storeAfterUpdate.selectedModel
      });
      
      // Auto-select first model if none selected
      const currentSelectedModel = storeAfterUpdate.selectedModel;
      console.log('🔍 [useChatStore] Step 4: Auto-selection check - current selected model:', currentSelectedModel);
      
      if (allModels.length > 0 && !currentSelectedModel) {
        console.log('🎯 [useChatStore] Step 4: Auto-selecting first model:', allModels[0]);
        await get().selectModel(allModels[0]);
        console.log('✅ [useChatStore] Step 4 SUCCESS: Auto-selection completed');
      } else {
        console.log('ℹ️ [useChatStore] Step 4 SKIP: Not auto-selecting model', {
          hasModels: allModels.length > 0,
          hasSelectedModel: !!currentSelectedModel,
          reason: allModels.length === 0 ? 'no models available' : 'model already selected'
        });
      }
      
      console.log('🎉 [useChatStore] ===== FETCH MODELS SUCCESS =====');
    } catch (error) {
      console.error('❌ [useChatStore] ===== FETCH MODELS ERROR =====');
      console.error('❌ [useChatStore] Error in fetchModels:', error);
      console.error('❌ [useChatStore] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error
      });
      toast({
        title: 'Error',
        description: 'Failed to fetch models',
        variant: 'destructive',
      });
    } finally {
      console.log('🏁 [useChatStore] ===== FETCH MODELS FINALLY =====');
      console.log('🏁 [useChatStore] Setting isLoadingModels to false');
      set({ isLoadingModels: false });
      
      // Log final state
      const finalState = get();
      console.log('📊 [useChatStore] FINAL STATE after fetchModels:', {
        modelsCount: finalState.models.length,
        models: finalState.models,
        visionModelsCount: finalState.visionModels.length,
        visionModels: finalState.visionModels,
        selectedModel: finalState.selectedModel,
        isLoadingModels: finalState.isLoadingModels
      });
      console.log('🏁 [useChatStore] ===== FETCH MODELS COMPLETE =====');
    }
  },

  fetchVisionModels: async () => {
    console.log('📞 [useChatStore] fetchVisionModels called');
    try {
      const visionModels = await api.getVisionModels();
      console.log('✅ [useChatStore] fetchVisionModels success:', visionModels);
      set({ visionModels });
    } catch (error) {
      console.error('❌ [useChatStore] fetchVisionModels error:', error);
      // Don't show toast for vision models as they are optional
      // Use fallback detection if API fails
      const currentModels = get().models;
      const currentVisionModels = get().visionModels;
      if (currentModels.length > 0 && currentVisionModels.length === 0) {
        console.log('🔄 [useChatStore] Using fallback vision model detection');
        const fallbackVisionModels = detectVisionModelsByName(currentModels);
        set({ visionModels: fallbackVisionModels });
      }
    }
  },

  selectModel: async (model) => {
    console.log('📞 [useChatStore] selectModel called with model:', model);
    try {
      const capabilities = await api.getModelCapabilities(model);
      console.log('✅ [useChatStore] selectModel success - capabilities:', capabilities);
      set({ selectedModel: model, modelCapabilities: capabilities });
    } catch (error) {
      console.warn('⚠️ [useChatStore] selectModel - failed to get capabilities, using fallback:', error);
      // Fallback to basic selection without capabilities
      set({ selectedModel: model, modelCapabilities: null });
    }
  },

  selectVisionModel: (model) => {
    console.log('📝 [useChatStore] selectVisionModel called with model:', model);
    set({ selectedVisionModel: model });
  },

  addMessage: (message) => {
    console.log('➕ [useChatStore] addMessage called:', message);
    set(state => ({ messages: [...state.messages, message] }));
  },

  clearCurrentConversation: () => {
    console.log('🧹 [useChatStore] clearCurrentConversation called');
    set({ currentConversation: null, messages: [] });
  },
}));