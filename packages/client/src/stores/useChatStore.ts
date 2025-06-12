import { create } from 'zustand';
import { Conversation, Message, ModelCapability } from '@olympian/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/useToast';

interface ChatStore {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  models: string[];
  selectedModel: string | null;
  modelCapabilities: ModelCapability | null;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isLoadingModels: boolean;
  
  fetchConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  fetchModels: () => Promise<void>;
  selectModel: (model: string) => Promise<void>;
  addMessage: (message: Message) => void;
  clearCurrentConversation: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  currentConversation: null,
  messages: [],
  models: [],
  selectedModel: null,
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
      const models = await api.getModels();
      set({ models });
      
      // Auto-select first model if none selected
      if (models.length > 0 && !get().selectedModel) {
        await get().selectModel(models[0]);
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch models',
        variant: 'destructive',
      });
    } finally {
      set({ isLoadingModels: false });
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

  addMessage: (message) => {
    set(state => ({ messages: [...state.messages, message] }));
  },

  clearCurrentConversation: () => {
    set({ currentConversation: null, messages: [] });
  },
}));