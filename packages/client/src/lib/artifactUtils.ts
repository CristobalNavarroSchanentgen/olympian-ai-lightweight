import { Message, Artifact } from '@olympian/shared';
import { detectArtifact } from './artifactDetection';
import { useArtifactStore } from '@/stores/useArtifactStore';

/**
 * Enhanced utility functions for managing artifacts and their metadata
 * Implements robust recreation logic with verification and graceful degradation for Subproject 3
 */

interface RecreationAttempt {
  strategy: string;
  success: boolean;
  confidence: number;
  artifactId?: string;
  error?: string;
}

interface RecreationReport {
  messageId: string;
  attempts: RecreationAttempt[];
  finalResult: 'success' | 'partial' | 'failed';
  artifactCreated: boolean;
  fallbackUsed: boolean;
}

/**
 * Process messages to recreate artifacts from metadata with robust error handling and verification
 * Enhanced for multi-host deployments with comprehensive fallback strategies
 */
export async function processMessagesForArtifacts(
  messages: Message[]
): Promise<Message[]> {
  console.log('🔧 [artifactUtils] Enhanced artifact processing starting:', {
    messageCount: messages.length,
    timestamp: new Date().toISOString()
  });
  
  const { clearArtifactsForConversation, getArtifactById } = useArtifactStore.getState();
  
  // Get conversation ID from the first message
  const conversationId = messages[0]?.conversationId || 'unknown';
  
  // Clear existing artifacts for this conversation to avoid duplication
  clearArtifactsForConversation(conversationId);
  
  const processedMessages: Message[] = [];
  const recreationReports: RecreationReport[] = [];
  
  for (const message of messages) {
    // Only process assistant messages that have artifact metadata
    if (message.role === 'assistant' && message.metadata?.hasArtifact && message.metadata?.artifactId) {
      console.log('🔧 [artifactUtils] Processing message with artifact metadata:', {
        messageId: message._id,
        artifactId: message.metadata.artifactId,
        artifactType: message.metadata.artifactType,
        hasOriginalContent: !!message.metadata.originalContent
      });
      
      const recreationReport: RecreationReport = {
        messageId: message._id || 'unknown',
        attempts: [],
        finalResult: 'failed',
        artifactCreated: false,
        fallbackUsed: false
      };
      
      try {
        // Check if artifact already exists (from server-side persistence)
        const existingArtifact = getArtifactById(message.metadata.artifactId);
        
        if (!existingArtifact) {
          console.log('🔧 [artifactUtils] Attempting artifact recreation with robust strategies');
          
          // Strategy 1: Use original content with enhanced detection
          const strategy1Result = await attemptRecreationStrategy(
            'enhanced_detection_original',
            message.metadata.originalContent || message.content,
            message.metadata,
            conversationId,
            message
          );
          recreationReport.attempts.push(strategy1Result);
          
          if (strategy1Result.success && strategy1Result.artifactId) {
            recreationReport.finalResult = 'success';
            recreationReport.artifactCreated = true;
          } else {
            // Strategy 2: Use current content as fallback
            const strategy2Result = await attemptRecreationStrategy(
              'enhanced_detection_current',
              message.content,
              message.metadata,
              conversationId,
              message
            );
            recreationReport.attempts.push(strategy2Result);
            
            if (strategy2Result.success && strategy2Result.artifactId) {
              recreationReport.finalResult = 'partial';
              recreationReport.artifactCreated = true;
              recreationReport.fallbackUsed = true;
            } else {
              // Strategy 3: Metadata-based reconstruction
              const strategy3Result = await attemptMetadataReconstruction(
                message.metadata,
                conversationId,
                message
              );
              recreationReport.attempts.push(strategy3Result);
              
              if (strategy3Result.success && strategy3Result.artifactId) {
                recreationReport.finalResult = 'partial';
                recreationReport.artifactCreated = true;
                recreationReport.fallbackUsed = true;
              }
            }
          }
          
          console.log('🔧 [artifactUtils] Recreation complete:', recreationReport);
          
        } else {
          console.log('✓ [artifactUtils] Artifact already exists, verifying integrity:', message.metadata.artifactId);
          
          // Verify existing artifact integrity
          const integrityCheck = verifyArtifactIntegrity(existingArtifact, message);
          if (!integrityCheck.valid) {
            console.warn('⚠️ [artifactUtils] Artifact integrity check failed, attempting repair:', integrityCheck);
            
            const repairResult = await attemptArtifactRepair(existingArtifact, message, conversationId);
            recreationReport.attempts.push(repairResult);
            recreationReport.finalResult = repairResult.success ? 'success' : 'partial';
            recreationReport.fallbackUsed = !repairResult.success;
          } else {
            recreationReport.finalResult = 'success';
            recreationReport.artifactCreated = true;
          }
        }
        
        // Create processed message with proper display content
        const processedMessage = createProcessedMessage(message, recreationReport);
        processedMessages.push(processedMessage);
        
      } catch (error) {
        console.error('❌ [artifactUtils] Critical error during artifact recreation:', error);
        
        // Emergency fallback: create message without artifact
        const emergencyFallback: RecreationAttempt = {
          strategy: 'emergency_fallback',
          success: false,
          confidence: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        recreationReport.attempts.push(emergencyFallback);
        recreationReport.finalResult = 'failed';
        
        const fallbackMessage = createFallbackMessage(message);
        processedMessages.push(fallbackMessage);
      }
      
      recreationReports.push(recreationReport);
      
    } else {
      // Regular message without artifacts - pass through unchanged
      processedMessages.push(message);
    }
  }
  
  // Log comprehensive recreation statistics
  logRecreationStatistics(recreationReports, conversationId);
  
  console.log('✅ [artifactUtils] Enhanced message processing complete:', {
    totalMessages: processedMessages.length,
    conversationId,
    artifactsRecreated: recreationReports.filter(r => r.artifactCreated).length,
    fallbacksUsed: recreationReports.filter(r => r.fallbackUsed).length
  });
  
  return processedMessages;
}

/**
 * Attempt artifact recreation using a specific strategy
 */
async function attemptRecreationStrategy(
  strategyName: string,
  content: string,
  metadata: any,
  conversationId: string,
  message: Message
): Promise<RecreationAttempt> {
  const attempt: RecreationAttempt = {
    strategy: strategyName,
    success: false,
    confidence: 0
  };
  
  try {
    console.log(`🔧 [artifactUtils] Attempting strategy: ${strategyName}`);
    
    if (!content || content.trim().length < 10) {
      attempt.error = 'Content too short or empty';
      return attempt;
    }
    
    // Use enhanced detection with robust recreation logic
    const artifactDetection = detectArtifact(content);
    
    if (artifactDetection.shouldCreateArtifact && artifactDetection.content) {
      const { recreateArtifact } = useArtifactStore.getState();
      
      // Create artifact with preserved original ID
      const artifactToRecreate: Artifact = {
        id: metadata.artifactId, // Preserve original ID
        title: generateEnhancedTitle(artifactDetection, metadata),
        type: metadata.artifactType || artifactDetection.type!,
        content: artifactDetection.content,
        language: artifactDetection.language || metadata.language,
        conversationId: conversationId,
        messageId: message._id,
        version: 1,
        createdAt: message.createdAt,
        updatedAt: message.createdAt,
      };
      
      // Verify artifact before recreation
      const preCreationVerification = verifyArtifactBeforeCreation(artifactToRecreate);
      if (!preCreationVerification.valid) {
        attempt.error = `Pre-creation verification failed: ${preCreationVerification.reason}`;
        attempt.confidence = 0.1;
        return attempt;
      }
      
      // Recreate the artifact
      recreateArtifact(artifactToRecreate);
      
      // Post-creation verification
      const { getArtifactById } = useArtifactStore.getState();
      const createdArtifact = getArtifactById(metadata.artifactId);
      
      if (createdArtifact) {
        const postCreationVerification = verifyArtifactIntegrity(createdArtifact, message);
        
        attempt.success = true;
        attempt.artifactId = createdArtifact.id;
        attempt.confidence = postCreationVerification.valid ? 0.9 : 0.6;
        
        if (!postCreationVerification.valid) {
          console.warn(`⚠️ [artifactUtils] Post-creation verification issues: ${postCreationVerification.reason}`);
        }
        
        console.log(`✅ [artifactUtils] Strategy ${strategyName} succeeded with confidence: ${attempt.confidence}`);
      } else {
        attempt.error = 'Artifact creation succeeded but artifact not found in store';
        attempt.confidence = 0.1;
      }
      
    } else {
      attempt.error = 'Enhanced detection did not identify artifact-worthy content';
      attempt.confidence = 0.2;
    }
    
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : 'Unknown error';
    attempt.confidence = 0;
    console.error(`❌ [artifactUtils] Strategy ${strategyName} failed:`, error);
  }
  
  return attempt;
}

/**
 * Attempt artifact reconstruction from metadata alone
 */
async function attemptMetadataReconstruction(
  metadata: any,
  conversationId: string,
  message: Message
): Promise<RecreationAttempt> {
  const attempt: RecreationAttempt = {
    strategy: 'metadata_reconstruction',
    success: false,
    confidence: 0
  };
  
  try {
    console.log('🔧 [artifactUtils] Attempting metadata-based reconstruction');
    
    if (!metadata.artifactId || !metadata.artifactType) {
      attempt.error = 'Insufficient metadata for reconstruction';
      return attempt;
    }
    
    // Create minimal artifact from metadata
    const { recreateArtifact } = useArtifactStore.getState();
    
    const minimalistArtifact: Artifact = {
      id: metadata.artifactId,
      title: `Recovered ${metadata.artifactType.charAt(0).toUpperCase() + metadata.artifactType.slice(1)}`,
      type: metadata.artifactType,
      content: metadata.originalContent || 'Content recovered from metadata',
      language: metadata.language || 'text',
      conversationId: conversationId,
      messageId: message._id,
      version: 1,
      createdAt: message.createdAt,
      updatedAt: message.createdAt,
    };
    
    recreateArtifact(minimalistArtifact);
    
    const { getArtifactById } = useArtifactStore.getState();
    const createdArtifact = getArtifactById(metadata.artifactId);
    
    if (createdArtifact) {
      attempt.success = true;
      attempt.artifactId = createdArtifact.id;
      attempt.confidence = 0.4; // Lower confidence for metadata-only reconstruction
      
      console.log('✅ [artifactUtils] Metadata reconstruction succeeded (partial recovery)');
    } else {
      attempt.error = 'Metadata reconstruction failed to create artifact';
    }
    
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ [artifactUtils] Metadata reconstruction failed:', error);
  }
  
  return attempt;
}

/**
 * Verify artifact integrity
 */
function verifyArtifactIntegrity(artifact: Artifact, message: Message): { valid: boolean; reason?: string; score: number } {
  try {
    // Basic structural checks
    if (!artifact.id || !artifact.content || !artifact.type) {
      return { valid: false, reason: 'Missing required artifact fields', score: 0 };
    }
    
    // Check if artifact matches message metadata
    if (message.metadata?.artifactId && artifact.id !== message.metadata.artifactId) {
      return { valid: false, reason: 'Artifact ID mismatch with message metadata', score: 0.2 };
    }
    
    if (message.metadata?.artifactType && artifact.type !== message.metadata.artifactType) {
      return { valid: false, reason: 'Artifact type mismatch with message metadata', score: 0.3 };
    }
    
    // Content quality checks
    if (artifact.content.length < 10) {
      return { valid: false, reason: 'Artifact content too short', score: 0.1 };
    }
    
    // Type-specific validation
    switch (artifact.type) {
      case 'json':
        try {
          JSON.parse(artifact.content);
        } catch {
          return { valid: false, reason: 'Invalid JSON content', score: 0.4 };
        }
        break;
        
      case 'html':
      case 'svg':
        if (!artifact.content.includes('<') || !artifact.content.includes('>')) {
          return { valid: false, reason: 'Invalid markup content', score: 0.4 };
        }
        break;
        
      case 'csv':
        const lines = artifact.content.split('\\n').filter(l => l.trim());
        if (lines.length < 2 || !lines[0].includes(',')) {
          return { valid: false, reason: 'Invalid CSV structure', score: 0.4 };
        }
        break;
    }
    
    // Calculate integrity score
    let score = 1.0;
    if (!artifact.title || artifact.title === 'Untitled') score -= 0.1;
    if (!artifact.language && ['code', 'react'].includes(artifact.type)) score -= 0.1;
    if (!artifact.messageId) score -= 0.1;
    
    return { valid: score > 0.5, score };
    
  } catch (error) {
    return { valid: false, reason: `Verification error: ${error}`, score: 0 };
  }
}

/**
 * Verify artifact before creation to catch issues early
 */
function verifyArtifactBeforeCreation(artifact: Artifact): { valid: boolean; reason?: string } {
  if (!artifact.id) return { valid: false, reason: 'Missing artifact ID' };
  if (!artifact.content) return { valid: false, reason: 'Missing artifact content' };
  if (!artifact.type) return { valid: false, reason: 'Missing artifact type' };
  if (!artifact.conversationId) return { valid: false, reason: 'Missing conversation ID' };
  
  // Content size check
  if (artifact.content.length > 1000000) { // 1MB limit
    return { valid: false, reason: 'Artifact content too large' };
  }
  
  return { valid: true };
}

/**
 * Attempt to repair a corrupted artifact
 */
async function attemptArtifactRepair(
  artifact: Artifact,
  message: Message,
  conversationId: string
): Promise<RecreationAttempt> {
  const attempt: RecreationAttempt = {
    strategy: 'artifact_repair',
    success: false,
    confidence: 0
  };
  
  try {
    console.log('🔧 [artifactUtils] Attempting artifact repair:', artifact.id);
    
    // Try to repair using message content
    const contentToRepair = message.metadata?.originalContent || message.content;
    const detectionResult = detectArtifact(contentToRepair);
    
    if (detectionResult.shouldCreateArtifact && detectionResult.content) {
      const { recreateArtifact } = useArtifactStore.getState();
      
      const repairedArtifact: Artifact = {
        ...artifact,
        content: detectionResult.content,
        title: generateEnhancedTitle(detectionResult, message.metadata) || artifact.title,
        language: detectionResult.language || artifact.language,
        updatedAt: new Date(),
        version: artifact.version + 1
      };
      
      recreateArtifact(repairedArtifact);
      
      attempt.success = true;
      attempt.artifactId = artifact.id;
      attempt.confidence = 0.7;
      
      console.log('✅ [artifactUtils] Artifact repair succeeded');
    } else {
      attempt.error = 'Could not extract valid content for repair';
    }
    
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : 'Unknown repair error';
    console.error('❌ [artifactUtils] Artifact repair failed:', error);
  }
  
  return attempt;
}

/**
 * Generate enhanced title with fallbacks
 */
function generateEnhancedTitle(detection: any, metadata: any): string {
  // Try detection title first
  if (detection.title && detection.title !== 'Code' && detection.title !== 'Generated Artifact') {
    return detection.title;
  }
  
  // Try metadata-based title
  if (metadata?.artifactType) {
    const type = metadata.artifactType;
    return `${type.charAt(0).toUpperCase() + type.slice(1)} ${metadata.language ? `(${metadata.language})` : ''}`.trim();
  }
  
  // Fallback to generic title
  return 'Recovered Artifact';
}

/**
 * Create processed message with proper display content
 */
function createProcessedMessage(message: Message, report: RecreationReport): Message {
  const displayContent = report.artifactCreated ? 
    (message.metadata?.codeBlocksRemoved ? message.content : 
     (message.metadata?.originalContent ? 
      detectArtifact(message.metadata.originalContent).processedContent || message.content :
      message.content)) :
    message.content;
    
  return {
    ...message,
    content: displayContent,
    metadata: {
      ...message.metadata,
      hasArtifact: report.artifactCreated,
      codeBlocksRemoved: report.artifactCreated,
      // Add recreation metadata for debugging
      recreationSuccess: report.finalResult === 'success',
      recreationAttempts: report.attempts.length,
      fallbackUsed: report.fallbackUsed
    }
  };
}

/**
 * Create fallback message when all recreation attempts fail
 */
function createFallbackMessage(message: Message): Message {
  return {
    ...message,
    content: message.metadata?.originalContent || message.content,
    metadata: {
      ...message.metadata,
      hasArtifact: false,
      codeBlocksRemoved: false,
      recreationFailed: true
    }
  };
}

/**
 * Log comprehensive recreation statistics
 */
function logRecreationStatistics(reports: RecreationReport[], conversationId: string): void {
  const stats = {
    totalMessages: reports.length,
    successful: reports.filter(r => r.finalResult === 'success').length,
    partial: reports.filter(r => r.finalResult === 'partial').length,
    failed: reports.filter(r => r.finalResult === 'failed').length,
    fallbacksUsed: reports.filter(r => r.fallbackUsed).length,
    averageAttempts: reports.length > 0 ? reports.reduce((sum, r) => sum + r.attempts.length, 0) / reports.length : 0,
    strategiesUsed: [...new Set(reports.flatMap(r => r.attempts.map(a => a.strategy)))],
    confidenceDistribution: reports.flatMap(r => r.attempts.map(a => a.confidence))
  };
  
  console.log('📊 [artifactUtils] Recreation Statistics:', {
    conversationId,
    ...stats,
    successRate: reports.length > 0 ? (stats.successful / reports.length * 100).toFixed(1) + '%' : '0%',
    averageConfidence: stats.confidenceDistribution.length > 0 ? 
      (stats.confidenceDistribution.reduce((sum, c) => sum + c, 0) / stats.confidenceDistribution.length * 100).toFixed(1) + '%' : '0%'
  });
  
  // Log failed attempts for debugging
  const failedReports = reports.filter(r => r.finalResult === 'failed');
  if (failedReports.length > 0) {
    console.warn('⚠️ [artifactUtils] Failed recreation attempts:', failedReports.map(r => ({
      messageId: r.messageId,
      attempts: r.attempts.map(a => ({ strategy: a.strategy, error: a.error }))
    })));
  }
}

/**
 * Enhanced artifact creation during live chat with verification
 */
export function createArtifactFromDetection(
  content: string,
  conversationId: string,
  messageId?: string
): { artifact: Artifact | null; processedContent: string; confidence: number } {
  console.log('🎨 [artifactUtils] Enhanced artifact creation from detection');
  
  try {
    const artifactDetection = detectArtifact(content);
    
    if (!artifactDetection.shouldCreateArtifact || !artifactDetection.content) {
      console.log('🚫 [artifactUtils] No artifact creation needed');
      return { artifact: null, processedContent: content, confidence: 0 };
    }
    
    const { createArtifact } = useArtifactStore.getState();
    
    // Use createArtifact which returns a Promise, but handle it properly
    const artifactDataToCreate = {
      title: artifactDetection.title || 'Generated Artifact',
      type: artifactDetection.type!,
      content: artifactDetection.content,
      language: artifactDetection.language,
      conversationId: conversationId,
      messageId: messageId,
      version: 1,
    };
    
    // Call createArtifact and handle the async result
    createArtifact(artifactDataToCreate).then((artifact) => {
      // Verify created artifact
      const dummyMessage = { metadata: { artifactId: artifact.id, artifactType: artifact.type } } as Message;
      const verification = verifyArtifactIntegrity(artifact, dummyMessage);
      
      console.log('✅ [artifactUtils] Enhanced artifact created:', {
        id: artifact.id,
        confidence: verification.score,
        verified: verification.valid
      });
    }).catch((error) => {
      console.error('❌ [artifactUtils] Enhanced artifact creation failed:', error);
    });
    
    // For now, return a basic response since we can't await the async createArtifact here
    return {
      artifact: null, // We can't return the actual artifact immediately due to async nature
      processedContent: artifactDetection.processedContent || content,
      confidence: 0.8 // Default confidence
    };
    
  } catch (error) {
    console.error('❌ [artifactUtils] Enhanced artifact creation failed:', error);
    return { artifact: null, processedContent: content, confidence: 0 };
  }
}

// Keep existing utility functions for compatibility

export function getDisplayContentForMessage(message: Message): string {
  if (message.metadata?.hasArtifact && message.metadata?.codeBlocksRemoved) {
    return message.content;
  }
  
  if (message.metadata?.originalContent && !message.metadata?.codeBlocksRemoved) {
    const detection = detectArtifact(message.metadata.originalContent);
    if (detection.processedContent && detection.codeBlocksRemoved) {
      return detection.processedContent;
    }
  }
  
  return message.content;
}

export function shouldDisplayArtifact(message: Message): boolean {
  return !!(
    message.metadata?.hasArtifact && 
    message.metadata?.artifactId
  );
}

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
    const dummyMessage = { metadata: { artifactId: artifact.id, artifactType: artifact.type } } as Message;
    const verification = verifyArtifactIntegrity(artifact, dummyMessage);
    
    if (verification.valid) {
      validCount++;
    } else {
      issues.push(`Artifact ${artifact.id}: ${verification.reason}`);
    }
  }
  
  return {
    totalArtifacts: artifacts.length,
    validArtifacts: validCount,
    issues
  };
}
