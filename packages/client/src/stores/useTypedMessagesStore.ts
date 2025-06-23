import { create } from 'zustand';

interface TypedMessagesStore {
  typedMessageIds: Set<string>;
  markAsTyped: (messageId: string) => void;
  isMessageTyped: (messageId: string) => boolean;
  clearTypedMessages: () => void;
}

export const useTypedMessagesStore = create<TypedMessagesStore>((set, get) => ({
  typedMessageIds: new Set<string>(),
  
  markAsTyped: (messageId: string) => {
    set((state) => ({
      typedMessageIds: new Set([...state.typedMessageIds, messageId])
    }));
  },
  
  isMessageTyped: (messageId: string) => {
    return get().typedMessageIds.has(messageId);
  },
  
  clearTypedMessages: () => {
    set({ typedMessageIds: new Set<string>() });
  }
}));
