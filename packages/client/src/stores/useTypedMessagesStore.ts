import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TypedMessagesStore {
  // Map of conversationId -> Set of messageIds that have been typed
  typedMessagesByConversation: Map<string, Set<string>>;
  // Track the most recent message that started typing to prevent re-triggering
  lastTypingMessageId: string | null;
  
  markAsTyped: (conversationId: string, messageId: string) => void;
  isMessageTyped: (conversationId: string, messageId: string) => boolean;
  setLastTypingMessage: (messageId: string | null) => void;
  shouldTriggerTypewriter: (conversationId: string, messageId: string, isLatest: boolean) => boolean;
  clearTypedMessages: (conversationId?: string) => void;
  cleanupOldConversations: (activeConversationIds: string[]) => void;
}

export const useTypedMessagesStore = create<TypedMessagesStore>()(
  persist(
    (set, get) => ({
      typedMessagesByConversation: new Map<string, Set<string>>(),
      lastTypingMessageId: null,
      
      markAsTyped: (conversationId: string, messageId: string) => {
        set((state) => {
          const newMap = new Map(state.typedMessagesByConversation);
          const conversationSet = newMap.get(conversationId) || new Set<string>();
          newMap.set(conversationId, new Set([...conversationSet, messageId]));
          
          return {
            typedMessagesByConversation: newMap,
            // Clear lastTypingMessageId when typing completes
            lastTypingMessageId: state.lastTypingMessageId === messageId ? null : state.lastTypingMessageId
          };
        });
      },
      
      isMessageTyped: (conversationId: string, messageId: string) => {
        const state = get();
        const conversationSet = state.typedMessagesByConversation.get(conversationId);
        return conversationSet?.has(messageId) || false;
      },
      
      setLastTypingMessage: (messageId: string | null) => {
        set({ lastTypingMessageId: messageId });
      },
      
      shouldTriggerTypewriter: (conversationId: string, messageId: string, isLatest: boolean) => {
        const state = get();
        
        // Only trigger for latest assistant messages
        if (!isLatest) return false;
        
        // Don't trigger if already typed
        if (state.isMessageTyped(conversationId, messageId)) return false;
        
        // Don't trigger if this message is already being typed
        if (state.lastTypingMessageId === messageId) return false;
        
        return true;
      },
      
      clearTypedMessages: (conversationId?: string) => {
        if (conversationId) {
          set((state) => {
            const newMap = new Map(state.typedMessagesByConversation);
            newMap.delete(conversationId);
            return {
              typedMessagesByConversation: newMap,
              lastTypingMessageId: null
            };
          });
        } else {
          set({
            typedMessagesByConversation: new Map<string, Set<string>>(),
            lastTypingMessageId: null
          });
        }
      },
      
      cleanupOldConversations: (activeConversationIds: string[]) => {
        set((state) => {
          const newMap = new Map<string, Set<string>>();
          const activeIds = new Set(activeConversationIds);
          
          // Keep only active conversations
          for (const [conversationId, messageIds] of state.typedMessagesByConversation) {
            if (activeIds.has(conversationId)) {
              newMap.set(conversationId, messageIds);
            }
          }
          
          return {
            typedMessagesByConversation: newMap,
            // Clear lastTypingMessageId if it doesn't belong to an active conversation
            lastTypingMessageId: state.lastTypingMessageId
          };
        });
      }
    }),
    {
      name: 'typed-messages-storage',
      // Custom storage to handle Map and Set serialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          
          try {
            const parsed = JSON.parse(str);
            // Convert serialized map back to Map with Sets
            const typedMessagesByConversation = new Map();
            if (parsed.state?.typedMessagesByConversation) {
              for (const [conversationId, messageIds] of Object.entries(parsed.state.typedMessagesByConversation)) {
                typedMessagesByConversation.set(conversationId, new Set(messageIds as string[]));
              }
            }
            
            return {
              state: {
                ...parsed.state,
                typedMessagesByConversation,
              },
              version: parsed.version
            };
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            // Convert Map with Sets to serializable format
            const serializableState = {
              ...value.state,
              typedMessagesByConversation: Object.fromEntries(
                Array.from(value.state.typedMessagesByConversation.entries()).map(
                  ([conversationId, messageIds]) => [conversationId, Array.from(messageIds)]
                )
              )
            };
            
            localStorage.setItem(name, JSON.stringify({
              state: serializableState,
              version: value.version
            }));
          } catch (error) {
            console.warn('Failed to persist typed messages store:', error);
          }
        },
        removeItem: (name) => localStorage.removeItem(name)
      }
    }
  )
);
