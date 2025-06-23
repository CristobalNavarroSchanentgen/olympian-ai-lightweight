import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface TypedMessagesStore {
  // Map of conversationId -> Set of messageIds that have been typed
  typedMessagesByConversation: Map<string, Set<string>>;
  // Track the most recent message that started typing to prevent re-triggering
  lastTypingMessageId: string | null;
  // Map of conversationId -> streaming content for real-time display
  streamingContentByConversation: Map<string, string>;
  
  markAsTyped: (conversationId: string, messageId: string) => void;
  isMessageTyped: (conversationId: string, messageId: string) => boolean;
  setLastTypingMessage: (messageId: string | null) => void;
  shouldTriggerTypewriter: (conversationId: string, messageId: string, isLatest: boolean) => boolean;
  clearTypedMessages: (conversationId?: string) => void;
  cleanupOldConversations: (activeConversationIds: string[]) => void;
  
  // Streaming content methods
  addTypedContent: (conversationId: string, token: string) => void;
  getTypedContent: (conversationId: string) => string;
}

// Track when messages were added to prevent marking new messages as typed
const messageAddedTimes = new Map<string, number>();

export const useTypedMessagesStore = create<TypedMessagesStore>()(
  persist(
    (set, get) => ({
      typedMessagesByConversation: new Map<string, Set<string>>(),
      lastTypingMessageId: null,
      streamingContentByConversation: new Map<string, string>(),
      
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
            const newStreamingMap = new Map(state.streamingContentByConversation);
            newMap.delete(conversationId);
            newStreamingMap.delete(conversationId);
            
            // Also clear message added times for this conversation
            Array.from(messageAddedTimes.keys())
              .filter(key => key.startsWith(conversationId))
              .forEach(key => messageAddedTimes.delete(key));
            return {
              typedMessagesByConversation: newMap,
              streamingContentByConversation: newStreamingMap,
              lastTypingMessageId: null
            };
          });
        } else {
          messageAddedTimes.clear();
          set({
            typedMessagesByConversation: new Map<string, Set<string>>(),
            streamingContentByConversation: new Map<string, string>(),
            lastTypingMessageId: null
          });
        }
      },
      
      cleanupOldConversations: (activeConversationIds: string[]) => {
        set((state) => {
          const newMap = new Map<string, Set<string>>();
          const newStreamingMap = new Map<string, string>();
          const activeIds = new Set(activeConversationIds);
          
          // Keep only active conversations
          for (const [conversationId, messageIds] of state.typedMessagesByConversation) {
            if (activeIds.has(conversationId)) {
              newMap.set(conversationId, messageIds);
            }
          }
          
          for (const [conversationId, content] of state.streamingContentByConversation) {
            if (activeIds.has(conversationId)) {
              newStreamingMap.set(conversationId, content);
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
            streamingContentByConversation: newStreamingMap,
            // Clear lastTypingMessageId if it doesn't belong to an active conversation
            lastTypingMessageId: state.lastTypingMessageId
          };
        });
      },
      
      // Streaming content methods
      addTypedContent: (conversationId: string, token: string) => {
        set((state) => {
          const newStreamingMap = new Map(state.streamingContentByConversation);
          const currentContent = newStreamingMap.get(conversationId) || '';
          newStreamingMap.set(conversationId, currentContent + token);
          return {
            streamingContentByConversation: newStreamingMap
          };
        });
      },
      
      getTypedContent: (conversationId: string) => {
        const state = get();
        return state.streamingContentByConversation.get(conversationId) || '';
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
            
            // Convert serialized streaming content map back to Map
            const streamingContentByConversation = new Map<string, string>();
            if (parsed.state?.streamingContentByConversation) {
              const entries = Object.entries(parsed.state.streamingContentByConversation) as [string, string][];
              for (const [conversationId, content] of entries) {
                streamingContentByConversation.set(conversationId, content);
              }
            }
            
            return {
              state: {
                ...parsed.state,
                typedMessagesByConversation,
                streamingContentByConversation,
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
            
            // Convert streaming content map to serializable format
            const serializableStreamingMap: Record<string, string> = {};
            value.state.streamingContentByConversation.forEach((content: string, conversationId: string) => {
              serializableStreamingMap[conversationId] = content;
            });
            
            const serializableState = {
              ...value.state,
              typedMessagesByConversation: serializableMap,
              streamingContentByConversation: serializableStreamingMap
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
