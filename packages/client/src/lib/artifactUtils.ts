import { Message, Artifact } from '@olympian/shared';
import { detectArtifact } from './artifactDetection';
import { useArtifactStore } from '@/stores/useArtifactStore';

/**
 * Utility functions for managing artifacts and their metadata
 */

/**
 * Process messages to recreate artifacts from metadata and restore proper display content
 * This is called when loading conversations to ensure artifacts are properly restored
 */
export async function processMessagesForArtifacts(
  messages: Message[], 
  conversationId: string
): Promise<Message[]> {
  console.log('🔧 [artifactUtils] Processing messages for artifact recreation:', messages.length, 'messages');
  
  // Get the artifact store instance
  const { recreateArtifact, clearArtifactsForConversation, getArtifactById } = useArtifactStore.getState();
  
  // Clear existing artifacts for this conversation to avoid duplication
  clearArtifactsForConversation(conversationId);
  
  const processedMessages: Message[] = [];
  
  for (const message of messages) {
    // Only process assistant messages that have artifact metadata
    if (message.role === 'assistant' && message.metadata?.hasArtifact && message.metadata?.artifactId) {
      console.log('🔧 [artifactUtils] Processing message with artifact metadata:', {
        messageId: message._id,
        artifactId: message.metadata.artifactId,
        hasOriginalContent: !!message.metadata.originalContent
      });
      
      try {
        // Check if artifact already exists
        const existingArtifact = getArtifactById(message.metadata.artifactId);
        
        if (!existingArtifact) {
          console.log('🔧 [artifactUtils] Recreating artifact with original ID:', message.metadata.artifactId);
          
          // Use originalContent if available, otherwise fall back to current content
          const contentToAnalyze = message.metadata.originalContent || message.content;
          
          // Detect artifact from the original content
          const artifactDetection = detectArtifact(contentToAnalyze);
          
          if (artifactDetection.shouldCreateArtifact && artifactDetection.content) {
            // Recreate the artifact with the ORIGINAL ID from metadata
            const artifactToRecreate: Artifact = {
              id: message.metadata.artifactId, // Preserve original ID
              title: message.metadata.artifactType ? 
                `${message.metadata.artifactType.charAt(0).toUpperCase()}${message.metadata.artifactType.slice(1)} Artifact` : 
                (artifactDetection.title || 'Recreated Artifact'),
              type: message.metadata.artifactType || artifactDetection.type!,
              content: artifactDetection.content,
              language: artifactDetection.language,
              conversationId: conversationId,
              messageId: message._id,
              version: 1,
              createdAt: message.createdAt,
              updatedAt: message.createdAt,
            };
            
            // Use recreateArtifact to preserve the original ID and structure
            recreateArtifact(artifactToRecreate);
            
            console.log('✅ [artifactUtils] Artifact recreated with original ID:', artifactToRecreate.id);
            
            // Create the processed message with proper display content
            const processedMessage = {
              ...message,
              // Use processed content for display (content without code blocks)
              content: artifactDetection.processedContent || 
                       (message.metadata.codeBlocksRemoved ? message.content : contentToAnalyze),
              metadata: {
                ...message.metadata,
                // Ensure all artifact metadata is properly set
                hasArtifact: true,
                artifactId: message.metadata.artifactId,
                artifactType: message.metadata.artifactType || artifactDetection.type,
                originalContent: message.metadata.originalContent || contentToAnalyze,
                codeBlocksRemoved: true,
              }
            };
            
            processedMessages.push(processedMessage);
            continue;
          } else {
            console.warn('⚠️ [artifactUtils] Failed to detect artifact content from message:', message._id);
          }
        } else {
          console.log('✓ [artifactUtils] Artifact already exists, skipping recreation:', message.metadata.artifactId);
        }
        
        // If artifact already exists or creation failed, ensure proper display content
        const displayContent = message.metadata.codeBlocksRemoved ? 
          message.content : 
          (message.metadata.originalContent ? 
            detectArtifact(message.metadata.originalContent).processedContent || message.content :
            message.content);
            
        const processedMessage = {
          ...message,
          content: displayContent,
          metadata: {
            ...message.metadata,
            hasArtifact: true,
            codeBlocksRemoved: true,
          }
        };
        
        processedMessages.push(processedMessage);
        
      } catch (error) {
        console.error('❌ [artifactUtils] Failed to recreate artifact for message:', message._id, error);
        // Fallback: use the message as-is but ensure proper display
        const fallbackMessage = {
          ...message,
          content: message.metadata?.originalContent ? 
            detectArtifact(message.metadata.originalContent).processedContent || message.content :
            message.content
        };
        processedMessages.push(fallbackMessage);
      }
    } else {
      // Regular message without artifacts - pass through unchanged
      processedMessages.push(message);
    }
  }
  
  console.log('✅ [artifactUtils] Message processing complete. Processed', processedMessages.length, 'messages');
  
  // Log final artifact state for debugging
  const { artifacts } = useArtifactStore.getState();
  const conversationArtifacts = artifacts[conversationId] || [];
  console.log('📊 [artifactUtils] Final artifact state for conversation:', {
    conversationId,
    artifactCount: conversationArtifacts.length,
    artifactIds: conversationArtifacts.map(a => a.id)
  });
  
  return processedMessages;
}

/**
 * Create an artifact from detected content during live chat
 * This is called when new messages are generated with artifact-worthy content
 */
export function createArtifactFromDetection(
  content: string,
  conversationId: string,
  messageId?: string
): { artifact: Artifact | null; processedContent: string } {
  console.log('🎨 [artifactUtils] Creating artifact from detected content');
  
  const artifactDetection = detectArtifact(content);
  
  if (!artifactDetection.shouldCreateArtifact || !artifactDetection.content) {
    console.log('🚫 [artifactUtils] No artifact creation needed');
    return { artifact: null, processedContent: content };
  }
  
  const { createArtifact } = useArtifactStore.getState();
  
  try {
    const artifact = createArtifact({
      title: artifactDetection.title || 'Generated Artifact',
      type: artifactDetection.type!,
      content: artifactDetection.content,
      language: artifactDetection.language,
      conversationId: conversationId,
      messageId: messageId,
      version: 1,
    });
    
    console.log('✅ [artifactUtils] New artifact created during live chat:', artifact.id);
    
    return {
      artifact,
      processedContent: artifactDetection.processedContent || content,
    };
  } catch (error) {
    console.error('❌ [artifactUtils] Failed to create artifact:', error);
    return { artifact: null, processedContent: content };
  }
}

/**
 * Update message content to display processed content when artifacts are present
 * This ensures that code blocks are hidden in chat when they're shown as artifacts
 */
export function getDisplayContentForMessage(message: Message): string {
  // If the message has artifact metadata and code blocks were removed,
  // use the current content (which should be the processed content)
  if (message.metadata?.hasArtifact && message.metadata?.codeBlocksRemoved) {
    return message.content;
  }
  
  // If we have original content but no processed content, 
  // we might need to process it again
  if (message.metadata?.originalContent && !message.metadata?.codeBlocksRemoved) {
    const detection = detectArtifact(message.metadata.originalContent);
    if (detection.processedContent && detection.codeBlocksRemoved) {
      return detection.processedContent;
    }
  }
  
  // Default to the message content as-is
  return message.content;
}

/**
 * Check if a message should display an artifact
 */
export function shouldDisplayArtifact(message: Message): boolean {
  return !!(
    message.metadata?.hasArtifact && 
    message.metadata?.artifactId
  );
}

/**
 * Get artifact for a specific message
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