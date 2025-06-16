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
    /vision/i,
    /multimodal/i
  ];

  return models.filter(model => 
    visionModelPatterns.some(pattern => pattern.test(model))
  );
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
    set({ isLoadingConversations: true });
    try {
      const { conversations } = await api.getConversations();
      set({ conversations });
    } catch (error) {
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
    try {
      const conversation = await api.getConversation(id);
      set({ currentConversation: conversation });
      await get().fetchMessages(id);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load conversation',
        variant: 'destructive',
      });
    }
  },

  setCurrentConversation: (conversation) => {
    set({ currentConversation: conversation });
    // Also add it to the conversations list if it's not there
    set(state => {
      const exists = state.conversations.some(c => c._id?.toString() === conversation._id?.toString());
      if (!exists) {
        return { conversations: [conversation, ...state.conversations] };
      }
      return state;
    });
  },

  createConversation: () => {
    set({ currentConversation: null, messages: [] });
  },

  deleteConversation: async (id) => {
    try {
      await api.deleteConversation(id);
      set(state => ({
        conversations: state.conversations.filter(c => c._id?.toString() !== id),
        currentConversation: state.currentConversation?._id?.toString() === id ? null : state.currentConversation,
        messages: state.currentConversation?._id?.toString() === id ? [] : state.messages,
      }));
      toast({
        title: 'Success',
        description: 'Conversation deleted',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      });
    }
  },

  fetchMessages: async (conversationId) => {
    set({ isLoadingMessages: true });
    try {
      const { messages } = await api.getMessages(conversationId);
      set({ messages });
    } catch (error) {
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
    set({ isLoadingModels: true });
    try {
      // Fetch all models first
      const allModels = await api.getModels();
      
      // Try to fetch vision models from API, with fallback to name-based detection
      let visionModels: string[] = [];
      try {
        visionModels = await api.getVisionModels();
        console.log('Vision models from API:', visionModels);
      } catch (error) {
        console.warn('Failed to fetch vision models from API, using fallback detection:', error);
        visionModels = detectVisionModelsByName(allModels);
        console.log('Vision models from fallback detection:', visionModels);
      }
      
      // Ensure we have some vision model detection, use both API and fallback
      const fallbackVisionModels = detectVisionModelsByName(allModels);
      const combinedVisionModels = [...new Set([...visionModels, ...fallbackVisionModels])];
      
      // Filter out ALL detected vision models from the regular models list
      const filteredModels = allModels.filter(model => !combinedVisionModels.includes(model));
      
      console.log('All models:', allModels);
      console.log('Combined vision models:', combinedVisionModels);
      console.log('Filtered regular models (vision models excluded):', filteredModels);
      
      set({ models: filteredModels, visionModels: combinedVisionModels });
      
      // Auto-select first model if none selected
      if (filteredModels.length > 0 && !get().selectedModel) {
        await get().selectModel(filteredModels[0]);
      }
    } catch (error) {
      console.error('Error in fetchModels:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch models',
        variant: 'destructive',
      });
    } finally {
      set({ isLoadingModels: false });
    }
  },

  fetchVisionModels: async () => {
    try {
      const visionModels = await api.getVisionModels();
      set({ visionModels });
    } catch (error) {
      console.error('Failed to fetch vision models:', error);
      // Don't show toast for vision models as they are optional
      // Use fallback detection if API fails
      const currentModels = get().models;
      const currentVisionModels = get().visionModels;
      if (currentModels.length > 0 && currentVisionModels.length === 0) {
        const fallbackVisionModels = detectVisionModelsByName(currentModels);
        set({ visionModels: fallbackVisionModels });
      }
    }
  },

  selectModel: async (model) => {
    try {
      const capabilities = await api.getModelCapabilities(model);
      set({ selectedModel: model, modelCapabilities: capabilities });
    } catch (error) {
      // Fallback to basic selection without capabilities
      set({ selectedModel: model, modelCapabilities: null });
    }
  },

  selectVisionModel: (model) => {
    set({ selectedVisionModel: model });
  },

  addMessage: (message) => {
    set(state => ({ messages: [...state.messages, message] }));
  },

  clearCurrentConversation: () => {
    set({ currentConversation: null, messages: [] });
  },
}));
