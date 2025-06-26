import { Message, Artifact } from '@olympian/shared';
import { useArtifactStore } from '@/stores/useArtifactStore';

/**
 * Simplified artifact utility functions for server-first architecture
 * Legacy client-side processing has been deprecated in favor of server-side artifact management
 */

/**
 * @deprecated - Server now handles all artifact processing
 * This function is kept for backward compatibility but should not be used
 * Use server-provided artifacts via loadArtifactsForConversation instead
 */
export async function processMessagesForArtifacts(
  messages: Message[]
): Promise<Message[]> {
  console.warn('⚠️ [artifactUtils] processMessagesForArtifacts is deprecated. Server handles artifact processing.');
  // Simply return messages as-is since server already processed them
  return messages;
}

/**
 * @deprecated - Use server-side artifact creation
 * This function is kept for backward compatibility but should not be used
 */
export function createArtifactFromDetection(
  content: string,
  conversationId: string,
  messageId?: string
): { artifact: Artifact | null; processedContent: string; confidence: number } {
  console.warn('⚠️ [artifactUtils] createArtifactFromDetection is deprecated. Use server-side artifact creation.');
  return { artifact: null, processedContent: content, confidence: 0 };
}

// ====================================
// ACTIVE UTILITY FUNCTIONS
// These work with server-provided data
// ====================================

/**
 * Get the display content for a message
 * Server already provides processed content with code blocks removed
 */
export function getDisplayContentForMessage(message: Message): string {
  // If the server has already processed the content (removed code blocks), use it directly
  if (message.metadata?.hasArtifact && message.metadata?.codeBlocksRemoved) {
    return message.content;
  }
  
  // Otherwise, return the content as-is
  return message.content;
}

/**
 * Check if a message should display an artifact
 * Based on server-provided metadata
 */
export function shouldDisplayArtifact(message: Message): boolean {
  return !!(
    message.metadata?.hasArtifact && 
    message.metadata?.artifactId
  );
}

/**
 * Get the artifact for a message
 * Retrieves the artifact from the store using server-provided metadata
 */
export function getArtifactForMessage(message: Message): Artifact | null {
  if (!shouldDisplayArtifact(message)) {
    return null;
  }
  
  const { getArtifactById } = useArtifactStore.getState();
  const artifact = getArtifactById(message.metadata!.artifactId!);
  
  if (!artifact) {
    console.warn('⚠️ [artifactUtils] Artifact not found for message:', {
      messageId: message._id,
      artifactId: message.metadata!.artifactId,
      hasMetadata: !!message.metadata,
      hasArtifact: !!message.metadata?.hasArtifact
    });
  }
  
  return artifact;
}

/**
 * Verify artifact consistency across the conversation
 * This is a utility function for debugging and doesn't modify artifacts
 */
export function verifyConversationArtifacts(conversationId: string): {
  totalArtifacts: number;
  validArtifacts: number;
  issues: string[];
} {
  const { getArtifactsForConversation } = useArtifactStore.getState();
  const artifacts = getArtifactsForConversation(conversationId);
  
  const issues: string[] = [];
  let validCount = 0;
  
  for (const artifact of artifacts) {
    // Basic validation
    if (artifact.id && artifact.content && artifact.type) {
      validCount++;
    } else {
      const missingFields = [];
      if (!artifact.id) missingFields.push('id');
      if (!artifact.content) missingFields.push('content');
      if (!artifact.type) missingFields.push('type');
      issues.push(`Artifact ${artifact.id || 'unknown'}: Missing fields: ${missingFields.join(', ')}`);
    }
  }
  
  return {
    totalArtifacts: artifacts.length,
    validArtifacts: validCount,
    issues
  };
}
