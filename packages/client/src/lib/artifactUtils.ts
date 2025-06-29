import { Message, Artifact } from '@olympian/shared';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { 
  getArtifactCount, 
  hasMultipleArtifacts, 
  getFirstArtifact,
  isLegacyArtifactFormat 
} from '@olympian/shared';

/**
 * Enhanced artifact utility functions for multi-artifact support
 * Server-first architecture with multi-artifact capabilities (Phase 4)
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
  _conversationId: string,
  _messageId?: string
): { artifact: Artifact | null; processedContent: string; confidence: number } {
  console.warn('⚠️ [artifactUtils] createArtifactFromDetection is deprecated. Use server-side artifact creation.');
  return { artifact: null, processedContent: content, confidence: 0 };
}

// ====================================
// ACTIVE UTILITY FUNCTIONS (Enhanced for multi-artifact support - Phase 4)
// These work with server-provided data
// ====================================

/**
 * Get the display content for a message
 * Server already provides processed content with code blocks removed
 */
export function getDisplayContentForMessage(message: Message): string {
  // If the server has already processed the content (removed code blocks), use it directly
  if (message.metadata?.codeBlocksRemoved) {
    return message.content;
  }
  
  // Handle multi-artifact scenarios
  const artifactCount = getArtifactCount(message.metadata);
  if (artifactCount > 0 && message.metadata?.originalContent) {
    return message.metadata.originalContent;
  }
  
  // Otherwise, return the content as-is
  return message.content;
}

/**
 * Check if a message should display artifacts
 * Enhanced for multi-artifact support (Phase 4)
 */
export function shouldDisplayArtifact(message: Message): boolean {
  const artifactCount = getArtifactCount(message.metadata);
  return artifactCount > 0;
}

/**
 * NEW: Check if a message has multiple artifacts (Phase 4)
 */
export function messageHasMultipleArtifacts(message: Message): boolean {
  return hasMultipleArtifacts(message.metadata);
}

/**
 * Get the first/primary artifact for a message (backward compatibility)
 * Retrieves the artifact from the store using server-provided metadata
 */
export function getArtifactForMessage(message: Message): Artifact | null {
  if (!shouldDisplayArtifact(message)) {
    return null;
  }
  
  const { getArtifactById, getArtifactByMessageId } = useArtifactStore.getState();
  
  // Try new multi-artifact format first
  if (message._id) {
    const artifact = getArtifactByMessageId(message._id);
    if (artifact) {
      return artifact;
    }
  }
  
  // Fallback to legacy format
  const firstArtifact = getFirstArtifact(message.metadata);
  if (firstArtifact?.artifactId) {
    const artifact = getArtifactById(firstArtifact.artifactId);
    if (artifact) {
      return artifact;
    }
  }
  
  // Final fallback to legacy metadata
  if (message.metadata?.artifactId) {
    const artifact = getArtifactById(message.metadata.artifactId);
    if (artifact) {
      return artifact;
    }
  }
  
  console.warn('⚠️ [artifactUtils] Artifact not found for message:', {
    messageId: message._id,
    artifactId: firstArtifact?.artifactId || message.metadata?.artifactId,
    hasMetadata: !!message.metadata,
    artifactCount: getArtifactCount(message.metadata),
    isLegacy: isLegacyArtifactFormat(message.metadata)
  });
  
  return null;
}

/**
 * NEW: Get all artifacts for a message (Phase 4)
 */
export function getArtifactsForMessage(message: Message): Artifact[] {
  if (!shouldDisplayArtifact(message)) {
    return [];
  }
  
  const { getArtifactsByMessageId, getArtifactById } = useArtifactStore.getState();
  
  // Try new multi-artifact format first
  if (message._id) {
    const artifacts = getArtifactsByMessageId(message._id);
    if (artifacts.length > 0) {
      return artifacts;
    }
  }
  
  // Fallback to legacy format - get all artifacts referenced in metadata
  const artifacts: Artifact[] = [];
  
  if (message.metadata?.artifacts) {
    // New format but stored in message metadata
    for (const artifactRef of message.metadata.artifacts) {
      const artifact = getArtifactById(artifactRef.artifactId);
      if (artifact) {
        artifacts.push(artifact);
      }
    }
  } else if (message.metadata?.artifactId) {
    // Legacy single artifact
    const artifact = getArtifactById(message.metadata.artifactId);
    if (artifact) {
      artifacts.push(artifact);
    }
  }
  
  return artifacts;
}

/**
 * NEW: Get artifact summary for a message (Phase 4)
 */
export function getArtifactSummaryForMessage(message: Message): {
  count: number;
  hasMultiple: boolean;
  hasArtifacts: boolean;
  isLegacy: boolean;
  artifacts: Artifact[];
  missing: string[];
} {
  const artifactCount = getArtifactCount(message.metadata);
  const hasMultiple = hasMultipleArtifacts(message.metadata);
  const isLegacy = isLegacyArtifactFormat(message.metadata);
  const artifacts = getArtifactsForMessage(message);
  
  // Find missing artifacts
  const missing: string[] = [];
  
  if (message.metadata?.artifacts) {
    for (const artifactRef of message.metadata.artifacts) {
      const found = artifacts.find(a => a.id === artifactRef.artifactId);
      if (!found) {
        missing.push(artifactRef.artifactId);
      }
    }
  } else if (message.metadata?.artifactId) {
    const found = artifacts.find(a => a.id === message.metadata!.artifactId);
    if (!found) {
      missing.push(message.metadata.artifactId);
    }
  }
  
  return {
    count: artifactCount,
    hasMultiple,
    hasArtifacts: artifactCount > 0,
    isLegacy,
    artifacts,
    missing
  };
}

/**
 * NEW: Get formatted artifact types for display (Phase 4)
 */
export function getArtifactTypesForMessage(message: Message): {
  types: string[];
  languages: string[];
  displayText: string;
} {
  const artifacts = getArtifactsForMessage(message);
  
  const types = [...new Set(artifacts.map(a => a.type))];
  const languages = [...new Set(artifacts.map(a => a.language).filter((lang): lang is string => lang !== undefined))];
  
  let displayText = '';
  if (types.length === 1) {
    displayText = types[0];
    if (languages.length === 1) {
      displayText += ` (${languages[0]})`;
    }
  } else if (types.length > 1) {
    displayText = `${types.length} types`;
    if (languages.length > 0) {
      displayText += ` (${languages.join(', ')})`;
    }
  }
  
  return { types, languages, displayText };
}

/**
 * Verify artifact consistency across the conversation
 * Enhanced for multi-artifact support (Phase 4)
 */
export function verifyConversationArtifacts(conversationId: string): {
  totalArtifacts: number;
  validArtifacts: number;
  multiArtifactMessages: number;
  legacyMessages: number;
  issues: string[];
} {
  const { getArtifactsForConversation } = useArtifactStore.getState();
  const artifacts = getArtifactsForConversation(conversationId);
  
  const issues: string[] = [];
  let validCount = 0;
  let multiArtifactMessages = 0;
  let legacyMessages = 0;
  
  // Group artifacts by message
  const artifactsByMessage = new Map<string, Artifact[]>();
  
  for (const artifact of artifacts) {
    // Basic validation
    if (artifact.id && artifact.content && artifact.type) {
      validCount++;
      
      // Group by message
      if (artifact.messageId) {
        if (!artifactsByMessage.has(artifact.messageId)) {
          artifactsByMessage.set(artifact.messageId, []);
        }
        artifactsByMessage.get(artifact.messageId)!.push(artifact);
      }
    } else {
      const missingFields = [];
      if (!artifact.id) missingFields.push('id');
      if (!artifact.content) missingFields.push('content');
      if (!artifact.type) missingFields.push('type');
      issues.push(`Artifact ${artifact.id || 'unknown'}: Missing fields: ${missingFields.join(', ')}`);
    }
  }
  
  // Analyze message-level patterns
  for (const [messageId, messageArtifacts] of artifactsByMessage) {
    if (messageArtifacts.length > 1) {
      multiArtifactMessages++;
      
      // Check for proper ordering
      const hasOrder = messageArtifacts.every(a => a.order !== undefined);
      if (!hasOrder) {
        issues.push(`Message ${messageId}: Multi-artifact message missing order information`);
      }
    }
    
    // Check for legacy artifacts (no messageId or old format)
    const hasLegacyArtifacts = messageArtifacts.some(a => !a.messageId);
    if (hasLegacyArtifacts) {
      legacyMessages++;
    }
  }
  
  return {
    totalArtifacts: artifacts.length,
    validArtifacts: validCount,
    multiArtifactMessages,
    legacyMessages,
    issues
  };
}

/**
 * NEW: Debug utility for multi-artifact scenarios (Phase 4)
 */
export function debugMessageArtifacts(message: Message): {
  messageInfo: {
    id: string | undefined;
    hasMetadata: boolean;
    artifactCount: number;
    isLegacy: boolean;
    hasMultiple: boolean;
  };
  storeInfo: {
    foundInStore: number;
    storeArtifacts: Artifact[];
    missingIds: string[];
  };
  recommendations: string[];
} {
  const messageInfo = {
    id: message._id,
    hasMetadata: !!message.metadata,
    artifactCount: getArtifactCount(message.metadata),
    isLegacy: isLegacyArtifactFormat(message.metadata),
    hasMultiple: hasMultipleArtifacts(message.metadata)
  };
  
  const storeArtifacts = getArtifactsForMessage(message);
  const expectedIds: string[] = [];
  
  if (message.metadata?.artifacts) {
    expectedIds.push(...message.metadata.artifacts.map(a => a.artifactId));
  } else if (message.metadata?.artifactId) {
    expectedIds.push(message.metadata.artifactId);
  }
  
  const foundIds = storeArtifacts.map(a => a.id);
  const missingIds = expectedIds.filter(id => !foundIds.includes(id));
  
  const recommendations: string[] = [];
  
  if (missingIds.length > 0) {
    recommendations.push(`Load artifacts for conversation: ${message.conversationId}`);
  }
  
  if (messageInfo.isLegacy && messageInfo.artifactCount > 0) {
    recommendations.push('Consider migrating legacy artifact format to new multi-artifact format');
  }
  
  if (messageInfo.hasMultiple && storeArtifacts.length === 1) {
    recommendations.push('Multi-artifact message only shows single artifact - check server synchronization');
  }
  
  return {
    messageInfo,
    storeInfo: {
      foundInStore: storeArtifacts.length,
      storeArtifacts,
      missingIds
    },
    recommendations
  };
}
