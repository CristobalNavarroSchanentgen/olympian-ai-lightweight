// Safe wrapper for WebSocket event handlers to prevent disconnections
export function safeHandler<T extends (...args: any[]) => any>(
  handler: T,
  context: string
): T {
  return ((...args: Parameters<T>) => {
    try {
      return handler(...args);
    } catch (error) {
      console.error(`[SafeHandler] Error in ${context}:`, error);
      // Return undefined instead of throwing to prevent disconnection
      return undefined;
    }
  }) as T;
}

// Helper to safely get conversation ID
export function getConversationId(conversation: any): string {
  if (!conversation) return '';
  if (typeof conversation === 'string') return conversation;
  if (conversation._id) {
    return typeof conversation._id === 'string' 
      ? conversation._id 
      : conversation._id.toString();
  }
  if (conversation.id) {
    return typeof conversation.id === 'string'
      ? conversation.id
      : conversation.id.toString();
  }
  return '';
}
