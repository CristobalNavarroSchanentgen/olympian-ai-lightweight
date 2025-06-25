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
  const { createArtifact, clearArtifactsForConversation, getArtifactById, recreateArtifact } = useArtifactStore.getState();
  
  // Clear existing artifacts for this conversation to avoid duplication
  clearArtifactsForConversation(conversationId);
  
  const processedMessages: Message[] = [];
  
  for (const message of messages) {
    // Only process assistant messages that have artifact metadata
    if (message.role === 'assistant' && message.metadata?.hasArtifact && message.metadata?.originalContent) {
      console.log('🔧 [artifactUtils] Processing message with artifact metadata:', message._id);
      
      try {
        // Recreate the artifact if it doesn't exist and we have the original content
        if (message.metadata.artifactId && message.metadata.originalContent) {
          const existingArtifact = getArtifactById(message.metadata.artifactId);
          
          if (!existingArtifact) {
            console.log('🔧 [artifactUtils] Recreating artifact for message:', message._id);
            
            // Use the detectArtifact function to recreate the artifact
            const artifactDetection = detectArtifact(message.metadata.originalContent);
            
            if (artifactDetection.shouldCreateArtifact && artifactDetection.content) {
              // Create the artifact with a new ID (since we're recreating)
              const recreatedArtifact = createArtifact({
                title: artifactDetection.title || message.metadata.artifactType || 'Recreated Artifact',
                type: message.metadata.artifactType || artifactDetection.type!,
                content: artifactDetection.content,
                language: artifactDetection.language,
                conversationId: conversationId,
                messageId: message._id,
              });
              
              console.log('✅ [artifactUtils] Artifact recreated:', recreatedArtifact.id);
              
              // Update the message metadata with the new artifact ID
              const updatedMessage = {
                ...message,
                metadata: {
                  ...message.metadata,
                  artifactId: recreatedArtifact.id,
                },
                // Ensure we show the processed content (without code blocks) in chat
                content: artifactDetection.processedContent || message.content,
              };
              
              processedMessages.push(updatedMessage);
              continue;
            }
          }
        }
        
        // If artifact already exists or creation failed, just restore the proper display content
        const processedMessage = {
          ...message,
          // Use the current content (which should be the processed content without code blocks)
          // If code blocks were removed during original processing, the content should already be correct
        };
        
        processedMessages.push(processedMessage);
        
      } catch (error) {
        console.error('❌ [artifactUtils] Failed to recreate artifact for message:', message._id, error);
        // Fallback: use the message as-is
        processedMessages.push(message);
      }
    } else {
      // Regular message without artifacts
      processedMessages.push(message);
    }
  }
  
  console.log('✅ [artifactUtils] Message processing complete');
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
    });
    
    console.log('✅ [artifactUtils] Artifact created:', artifact.id);
    
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
  return getArtifactById(message.metadata!.artifactId!);
}