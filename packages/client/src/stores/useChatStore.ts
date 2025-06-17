import { create } from 'zustand';
import { Conversation, Message, ModelCapability } from '@olympian/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/useToast';

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
      set({ messages });
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
    console.log('🚀 [useChatStore] fetchModels called - starting fetch process');
    set({ isLoadingModels: true });
    
    try {
      console.log('📞 [useChatStore] Calling api.getModels()...');
      // Fetch all models first
      const allModels = await api.getModels();
      console.log('✅ [useChatStore] api.getModels() response:', allModels);
      console.log('📊 [useChatStore] Number of models received:', allModels.length);
      console.log('📋 [useChatStore] Models list:', allModels);
      
      // Try to fetch vision models from API
      let visionModels: string[] = [];
      try {
        console.log('📞 [useChatStore] Calling api.getVisionModels()...');
        visionModels = await api.getVisionModels();
        console.log('✅ [useChatStore] api.getVisionModels() response:', visionModels);
        console.log('📊 [useChatStore] Number of vision models received:', visionModels.length);
      } catch (error) {
        console.warn('⚠️ [useChatStore] Failed to fetch vision models from API, using fallback detection:', error);
        visionModels = detectVisionModelsByName(allModels);
        console.log('🔄 [useChatStore] Fallback vision models result:', visionModels);
      }
      
      // Don't filter out vision models from the regular models list
      // Let users choose any model they want
      console.log('📝 [useChatStore] Setting models and visionModels in store...');
      console.log('📝 [useChatStore] Setting models:', allModels);
      console.log('📝 [useChatStore] Setting visionModels:', visionModels);
      
      set({ models: allModels, visionModels });
      console.log('✅ [useChatStore] Store updated with models');
      
      // Auto-select first model if none selected
      const currentSelectedModel = get().selectedModel;
      console.log('🔍 [useChatStore] Current selected model:', currentSelectedModel);
      
      if (allModels.length > 0 && !currentSelectedModel) {
        console.log('🎯 [useChatStore] Auto-selecting first model:', allModels[0]);
        await get().selectModel(allModels[0]);
      } else {
        console.log('ℹ️ [useChatStore] Not auto-selecting model (already selected or no models available)');
      }
      
      console.log('🎉 [useChatStore] fetchModels completed successfully');
    } catch (error) {
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
      console.log('🏁 [useChatStore] fetchModels finally block - setting isLoadingModels to false');
      set({ isLoadingModels: false });
      
      // Log final state
      const finalState = get();
      console.log('📊 [useChatStore] Final state after fetchModels:', {
        modelsCount: finalState.models.length,
        visionModelsCount: finalState.visionModels.length,
        selectedModel: finalState.selectedModel,
        isLoadingModels: finalState.isLoadingModels
      });
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
