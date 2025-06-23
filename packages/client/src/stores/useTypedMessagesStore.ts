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
  shouldTriggerTypewriter: (conversationId: string, messageId: string, isLatest: boolean, messageCreatedAt?: Date) => boolean;
  clearTypedMessages: (conversationId?: string) => void;
  cleanupOldConversations: (activeConversationIds: string[]) => void;
}

// Track when messages were added to prevent marking new messages as typed
const messageAddedTimes = new Map<string, number>();

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
      
      shouldTriggerTypewriter: (conversationId: string, messageId: string, isLatest: boolean, messageCreatedAt?: Date) => {
        const state = get();
        
        // Only trigger for latest assistant messages
        if (!isLatest) return false;
        
        // Check if this is a new message (created within the last 5 seconds)
        const messageKey = `${conversationId}-${messageId}`;
        const now = Date.now();
        
        if (!messageAddedTimes.has(messageKey)) {
          messageAddedTimes.set(messageKey, now);
          // Clean up old entries to prevent memory leak
          if (messageAddedTimes.size > 100) {
            const entries = Array.from(messageAddedTimes.entries());
            entries.slice(0, 50).forEach(([key]) => messageAddedTimes.delete(key));
          }
        }
        
        const messageAddedTime = messageAddedTimes.get(messageKey) || now;
        const isNewMessage = (now - messageAddedTime) < 5000; // 5 seconds
        
        // If it's a new message, trigger typewriter regardless of typed state
        if (isNewMessage) {
          // Remove from typed messages if it was somehow marked as typed
          if (state.isMessageTyped(conversationId, messageId)) {
            set((state) => {
              const newMap = new Map(state.typedMessagesByConversation);
              const conversationSet = newMap.get(conversationId);
              if (conversationSet) {
                conversationSet.delete(messageId);
                newMap.set(conversationId, new Set(conversationSet));
              }
              return { typedMessagesByConversation: newMap };
            });
          }
          return true;
        }
        
        // For older messages, check if already typed
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
            // Also clear message added times for this conversation
            Array.from(messageAddedTimes.keys())
              .filter(key => key.startsWith(conversationId))
              .forEach(key => messageAddedTimes.delete(key));
            return {
              typedMessagesByConversation: newMap,
              lastTypingMessageId: null
            };
          });
        } else {
          messageAddedTimes.clear();
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
          
          // Clean up message added times
          Array.from(messageAddedTimes.keys())
            .filter(key => {
              const conversationId = key.split('-')[0];
              return !activeIds.has(conversationId);
            })
            .forEach(key => messageAddedTimes.delete(key));
          
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
            const typedMessagesByConversation = new Map<string, Set<string>>();
            if (parsed.state?.typedMessagesByConversation) {
              // Properly type the entries as [string, string[]]
              const entries = Object.entries(parsed.state.typedMessagesByConversation) as [string, string[]][];
              for (const [conversationId, messageIds] of entries) {
                typedMessagesByConversation.set(conversationId, new Set(messageIds));
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
            const serializableMap: Record<string, string[]> = {};
            
            // Properly iterate over the map entries
            value.state.typedMessagesByConversation.forEach((messageIds: Set<string>, conversationId: string) => {
              serializableMap[conversationId] = Array.from(messageIds);
            });
            
            const serializableState = {
              ...value.state,
              typedMessagesByConversation: serializableMap
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
