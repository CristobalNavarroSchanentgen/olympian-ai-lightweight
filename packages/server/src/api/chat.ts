import { Router } from 'express';
import { ObjectId, WithId } from 'mongodb';
import { DatabaseService } from '../services/DatabaseService';
import { StreamlinerFactory } from "./StreamlinerFactory";
import { ChatMemoryService } from '../services/ChatMemoryService';
import { ArtifactService } from '../services/ArtifactService'; // NEW: Artifact service integration
import { modelProgressiveLoader } from '../services/ModelProgressiveLoader';
import { AppError } from '../middleware/errorHandler';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';
import { 
  Message, 
  Conversation, 
  ModelCapability, 
  CreateArtifactRequest, 
  ArtifactType, 
  Artifact,
  MultiArtifactCreationRequest,
  MultiArtifactCreationResponse,
  ArtifactDetectionResult,
  MULTI_ARTIFACT_CONFIG,
  detectSeparationMarkers,
  shouldGroupArtifacts,
  generateArtifactTitle,
  ArtifactReference,
  validateArtifactCreationRules,
  detectDuplicateArtifacts,
  calculateContentHash,
  parseThinkingFromContent,
  ThinkingData
} from '@olympian/shared';

const router = Router();
const db = DatabaseService.getInstance();
// Streamliner created per request based on model
const memoryService = ChatMemoryService.getInstance();
const artifactService = ArtifactService.getInstance(); // NEW: Artifact service instance

// Apply rate limiting to chat endpoints
router.use(chatRateLimiter);

// Input validation schemas
const sendMessageSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().optional(),
  model: z.string().min(1),
  visionModel: z.string().optional(),
  images: z.array(z.string()).optional(),
});

const memoryConfigSchema = z.object({
  maxMessages: z.number().min(1).max(100).optional(),
  maxTokens: z.number().min(100).max(10000).optional(),
  includeSystemPrompt: z.boolean().optional(),
  systemPrompt: z.string().max(500).optional(),
});

// Database document types (with ObjectId)
type ConversationDoc = Omit<Conversation, '_id'> & { _id?: ObjectId };
type MessageDoc = Omit<Message, '_id'> & { _id?: ObjectId };

// Helper function to convert MongoDB document to proper format
function formatConversation(doc: any): Conversation {
  return {
    ...doc,
    _id: doc._id?.toString ? doc._id.toString() : doc._id,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
  };
}

function formatMessage(doc: any): Message {
  return {
    ...doc,
    _id: doc._id?.toString ? doc._id.toString() : doc._id,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
  };
}

// Helper function to convert string ID to ObjectId if needed
function toObjectId(id: string | ObjectId): ObjectId {
  if (typeof id === 'string') {
    return new ObjectId(id);
  }
  return id;
}

// Helper function to check if a model is basic (no capabilities)
function isBasicModel(capabilities: ModelCapability | null): boolean {
  if (!capabilities) return false;
  return !capabilities.vision && !capabilities.tools && !capabilities.reasoning;
}

// Helper function to get model capabilities with fallback
async function getModelCapabilitiesWithFallback(modelName: string): Promise<ModelCapability | null> {
  try {
    // First check if we have this model in progressive loader cache
    const cachedCapabilities = modelProgressiveLoader.getCapabilities();
    const cachedCapability = cachedCapabilities.find(cap => cap.name === modelName);
    
    if (cachedCapability) {
      console.log(`✅ Using cached capability for model '${modelName}' from progressive loader`);
      return cachedCapability;
    }
    
    // Fallback to direct detection
    console.log(`🔍 No cached data for '${modelName}', detecting capabilities directly...`);
    return { vision: false, tools: false }; // Capability detection removed
  } catch (error) {
    console.warn(`⚠️ Failed to get capabilities for model '${modelName}':`, error);
    return null;
  }
}

// =====================================================
// PHASE 2: ENHANCED MULTI-ARTIFACT DETECTION LOGIC
// =====================================================

/**
 * Phase 2: Enhanced multi-artifact detection for assistant responses
 * Detects multiple code blocks, HTML, SVG, JSON, and other artifact-worthy content
 * Implements smart grouping rules and separation detection
 */
function detectMultiArtifactContent(content: string): ArtifactDetectionResult {
  const detectedArtifacts: Array<{
    type: ArtifactType;
    title: string;
    language?: string;
    content: string;
    startIndex: number;
    endIndex: number;
    confidence: number;
  }> = [];

  let processedContent = content;
  
  // Enhanced regex patterns for different artifact types
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const htmlRegex = /<!DOCTYPE html|<html|<div|<p>|<span>|<h[1-6]>/i;
  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  const jsonRegex = /```json\n([\s\S]*?)```/g;
  const csvRegex = /```csv\n([\s\S]*?)```/g;
  const reactRegex = /```(jsx?|tsx?)\n([\s\S]*?)```/g;
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;

  // Phase 2: Detect separation markers for explicit artifact separation
  const separationMarkerCount = detectSeparationMarkers(content);
  const hasExplicitSeparation = separationMarkerCount > 1;

  console.log(`🔍 [MultiArtifactDetection] Analyzing content... Separation markers: ${separationMarkerCount}`);

  // 1. Detect all code blocks first
  const codeMatches = Array.from(content.matchAll(codeBlockRegex));
  console.log(`📦 [MultiArtifactDetection] Found ${codeMatches.length} code blocks`);

  for (let i = 0; i < codeMatches.length; i++) {
    const match = codeMatches[i];
    const language = match[1] || 'text';
    const code = match[2].trim();
    const startIndex = match.index || 0;
    const endIndex = startIndex + match[0].length;

    // Phase 6: Skip if content is too small (using correct constant)
    if (code.length < MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE) {
      console.log(`⏭️ [MultiArtifactDetection] Skipping small code block (${code.length} chars)`);
      continue;
    }

    // Determine artifact type and confidence based on language and content
    let artifactType: ArtifactType = 'code';
    let confidence = 0.8;
    let title = generateArtifactTitle(`${language.charAt(0).toUpperCase() + language.slice(1)} Code`, i, codeMatches.length, language);

    // Enhanced type detection
    if (language.toLowerCase() === 'html' || htmlRegex.test(code)) {
      artifactType = 'html';
      title = generateArtifactTitle('HTML Document', i, codeMatches.length);
      confidence = 0.9;
    } else if (language.toLowerCase() === 'json') {
      artifactType = 'json';
      title = generateArtifactTitle('JSON Data', i, codeMatches.length);
      confidence = 0.95;
    } else if (language.toLowerCase() === 'csv') {
      artifactType = 'csv';
      title = generateArtifactTitle('CSV Data', i, codeMatches.length);
      confidence = 0.95;
    } else if (language.toLowerCase() === 'mermaid') {
      artifactType = 'mermaid';
      title = generateArtifactTitle('Mermaid Diagram', i, codeMatches.length);
      confidence = 0.9;
    } else if (['jsx', 'tsx', 'javascript', 'js', 'typescript', 'ts'].includes(language.toLowerCase()) && 
               (code.includes('React') || code.includes('useState') || code.includes('useEffect') || code.includes('Component'))) {
      artifactType = 'react';
      title = generateArtifactTitle('React Component', i, codeMatches.length);
      confidence = 0.85;
    }

    detectedArtifacts.push({
      type: artifactType,
      title,
      language: language || undefined,
      content: code,
      startIndex,
      endIndex,
      confidence
    });
  }

  // 2. Detect standalone SVG content (not in code blocks)
  const svgMatches = Array.from(content.matchAll(svgRegex));
  for (let i = 0; i < svgMatches.length; i++) {
    const match = svgMatches[i];
    const svgContent = match[0];
    const startIndex = match.index || 0;
    const endIndex = startIndex + svgContent.length;

    // Check if this SVG is already part of a code block
    const isInCodeBlock = detectedArtifacts.some(artifact => 
      startIndex >= artifact.startIndex && endIndex <= artifact.endIndex
    );

    if (!isInCodeBlock) {
      detectedArtifacts.push({
        type: 'svg',
        title: generateArtifactTitle('SVG Diagram', i, svgMatches.length),
        content: svgContent,
        startIndex,
        endIndex,
        confidence: 0.9
      });
    }
  }

  // Phase 6: Validate artifact creation rules before processing
  const validation = validateArtifactCreationRules(detectedArtifacts);
  if (!validation.valid) {
    console.warn(`⚠️ [MultiArtifactDetection] Validation errors: ${validation.errors.join(', ')}`);
    // Filter out artifacts that are too small
    const validArtifacts = detectedArtifacts.filter(artifact => 
      artifact.content.length >= MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE
    );
    // Limit to maximum allowed
    const limitedArtifacts = validArtifacts.slice(0, MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE);
    
    if (limitedArtifacts.length < detectedArtifacts.length) {
      console.warn(`⚠️ [MultiArtifactDetection] Filtered ${detectedArtifacts.length - limitedArtifacts.length} artifacts due to validation rules`);
    }
    
    // Update detectedArtifacts with filtered results
    detectedArtifacts.length = 0;
    detectedArtifacts.push(...limitedArtifacts);
  }

  // Phase 6: Enhanced duplicate detection
  const duplicates = detectDuplicateArtifacts(detectedArtifacts);
  if (duplicates.length > 0) {
    console.warn(`⚠️ [MultiArtifactDetection] Found ${duplicates.length} potential duplicates`);
    // Remove duplicates (keep originals)
    const duplicateIndices = new Set(duplicates.map(d => d.index));
    const uniqueArtifacts = detectedArtifacts.filter((_, index) => !duplicateIndices.has(index));
    
    console.log(`🎯 [MultiArtifactDetection] Removed ${duplicates.length} duplicates, ${uniqueArtifacts.length} unique artifacts remain`);
    detectedArtifacts.length = 0;
    detectedArtifacts.push(...uniqueArtifacts);
  }

  // 3. Phase 2: Apply smart grouping rules
  const groupedArtifacts = applySmartGrouping(detectedArtifacts, hasExplicitSeparation);
  console.log(`🎯 [MultiArtifactDetection] After grouping: ${groupedArtifacts.length} artifacts (was ${detectedArtifacts.length})`);

  // 4. Remove all detected artifacts from content for prose display
  processedContent = removeArtifactsFromContent(content, groupedArtifacts);

  // 5. Phase 6: Final limit to maximum allowed artifacts (using correct constant)
  const finalArtifacts = groupedArtifacts.slice(0, MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE);
  if (groupedArtifacts.length > MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE) {
    console.warn(`⚠️ [MultiArtifactDetection] Limited to ${MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE} artifacts (found ${groupedArtifacts.length})`);
  }

  const shouldCreateArtifacts = finalArtifacts.length > 0;
  const detectionStrategy = determineDetectionStrategy(finalArtifacts, hasExplicitSeparation, separationMarkerCount);

  return {
    shouldCreateArtifact: shouldCreateArtifacts,
    artifacts: finalArtifacts,
    totalArtifacts: finalArtifacts.length,
    processedContent: processedContent.trim() || 'Generated artifact content',
    codeBlocksRemoved: shouldCreateArtifacts,
    detectionStrategy,
    smartGrouping: {
      groupedByLanguage: detectionStrategy.includes('language'),
      groupedByType: detectionStrategy.includes('type'),
      explicitSeparation: hasExplicitSeparation
    }
  };
}

/**
 * Phase 2: Apply smart grouping rules to detected artifacts
 */
function applySmartGrouping(
  artifacts: Array<{
    type: ArtifactType;
    title: string;
    language?: string;
    content: string;
    startIndex: number;
    endIndex: number;
    confidence: number;
  }>,
  hasExplicitSeparation: boolean
): Array<{
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
}> {
  if (artifacts.length <= 1) return artifacts;

  // If explicit separation markers are present, don't group
  if (hasExplicitSeparation) {
    console.log(`🎯 [SmartGrouping] Explicit separation detected, keeping all artifacts separate`);
    return artifacts;
  }

  const grouped: typeof artifacts = [];
  const processed = new Set<number>();

  for (let i = 0; i < artifacts.length; i++) {
    if (processed.has(i)) continue;

    const current = artifacts[i];
    const candidates = [current];
    processed.add(i);

    // Look for artifacts that should be grouped with current
    for (let j = i + 1; j < artifacts.length; j++) {
      if (processed.has(j)) continue;

      const candidate = artifacts[j];
      
      // Apply grouping rules
      if (shouldGroupArtifacts(current, candidate)) {
        console.log(`🔗 [SmartGrouping] Grouping ${current.type}(${current.language}) with ${candidate.type}(${candidate.language})`);
        candidates.push(candidate);
        processed.add(j);
      }
    }

    if (candidates.length === 1) {
      // Single artifact, keep as is
      grouped.push(current);
    } else {
      // Multiple artifacts to group
      const combinedContent = candidates.map(c => c.content).join('\n\n');
      const groupedArtifact = {
        ...current,
        title: generateArtifactTitle(`${current.language || current.type} Collection`, 0, 1, current.language),
        content: combinedContent,
        startIndex: Math.min(...candidates.map(c => c.startIndex)),
        endIndex: Math.max(...candidates.map(c => c.endIndex)),
        confidence: Math.max(...candidates.map(c => c.confidence))
      };
      grouped.push(groupedArtifact);
    }
  }

  return grouped;
}

/**
 * Phase 2: Remove detected artifacts from content for prose display
 */
function removeArtifactsFromContent(
  content: string,
  artifacts: Array<{ startIndex: number; endIndex: number; title: string }>
): string {
  if (artifacts.length === 0) return content;

  // Sort artifacts by startIndex in reverse order to maintain indices
  const sortedArtifacts = [...artifacts].sort((a, b) => b.startIndex - a.startIndex);
  
  let result = content;
  
  for (const artifact of sortedArtifacts) {
    const beforeArtifact = result.slice(0, artifact.startIndex).trim();
    const afterArtifact = result.slice(artifact.endIndex).trim();
    
    // Create a placeholder for the artifact
    const placeholder = `[Created ${artifact.title} artifact]`;
    
    // Combine with proper spacing
    const parts = [beforeArtifact, placeholder, afterArtifact].filter(part => part.length > 0);
    result = parts.join(' ');
  }
  
  return result;
}

/**
 * Phase 2: Determine the detection strategy used
 */
function determineDetectionStrategy(
  artifacts: Array<{ type: ArtifactType; language?: string }>,
  hasExplicitSeparation: boolean,
  separationMarkerCount: number
): string {
  const strategies: string[] = [];
  
  if (hasExplicitSeparation) {
    strategies.push('explicit-separation');
  }
  
  const types = new Set(artifacts.map(a => a.type));
  const languages = new Set(artifacts.map(a => a.language).filter(Boolean));
  
  if (types.size > 1) {
    strategies.push('type-based-grouping');
  }
  
  if (languages.size > 1) {
    strategies.push('language-based-grouping');
  }
  
  if (artifacts.length > 1 && !hasExplicitSeparation) {
    strategies.push('sequence-based-detection');
  }
  
  strategies.push('regex-pattern-matching');
  
  return strategies.join('+');
}

// =====================================================
// PHASE 3: ENHANCED ARTIFACT CREATION FLOW
// =====================================================

/**
 * Phase 3: Create multiple artifacts from detected content and update message metadata
 * FIXED: Now properly handles artifacts within thinking tags
 */
async function createMultiArtifactsFromResponse(
  content: string,
  conversationId: string,
  messageId: string,
  originalContentWithThinking?: string
): Promise<{
  processedContent: string;
  artifacts: ArtifactReference[];
  hasArtifact: boolean;
  artifactCount: number;
  creationStrategy: string;
}> {
  try {
    // FIXED: Use original content (with thinking tags) for artifact detection if available
    const contentForArtifactDetection = originalContentWithThinking || content;
    console.log(`🎨 [ChatAPI] Using ${originalContentWithThinking ? 'original content with thinking' : 'processed content'} for artifact detection`);
    
    const detection = detectMultiArtifactContent(contentForArtifactDetection);
    
    if (!detection.shouldCreateArtifact || !detection.artifacts || detection.artifacts.length === 0) {
      return {
        processedContent: content,
        artifacts: [],
        hasArtifact: false,
        artifactCount: 0,
        creationStrategy: 'none'
      };
    }
    
    console.log(`🎨 [ChatAPI] Creating ${detection.artifacts.length} artifacts for message ${messageId}`);
    
    // Phase 3: Create multiple artifacts sequentially
    const createdArtifacts: ArtifactReference[] = [];
    const creationErrors: Array<{ index: number; title: string; error: string }> = [];
    
    for (let i = 0; i < detection.artifacts.length; i++) {
      const detectedArtifact = detection.artifacts[i];
      
      try {
        // Phase 6: Enhanced metadata with content hash for duplicate detection
        const contentHash = calculateContentHash(detectedArtifact.content);
        
        // Create artifact request
        const createRequest: CreateArtifactRequest = {
          conversationId,
          messageId,
          title: detectedArtifact.title,
          type: detectedArtifact.type,
          content: detectedArtifact.content,
          language: detectedArtifact.language,
          order: i,
          metadata: {
            detectionStrategy: detection.detectionStrategy || 'multi-artifact-analysis',
            originalContent: originalContentWithThinking || content,
            processedContent: detection.processedContent,
            codeBlocksRemoved: true,
            reconstructionHash: '', // Will be calculated in service
            syncStatus: 'synced',
            contentSize: Buffer.from(detectedArtifact.content, 'utf8').length,
            partOfMultiArtifact: detection.artifacts!.length > 1,
            artifactIndex: i,
            totalArtifactsInMessage: detection.artifacts!.length,
            groupingStrategy: detection.detectionStrategy,
            // Phase 6: Enhanced metadata for duplicate detection
            contentHash,
            isDuplicate: false,
            fallbackData: {
              detectionMethod: 'multi-artifact-regex-pattern-matching',
              originalLength: contentForArtifactDetection.length,
              extractedLength: detectedArtifact.content.length,
              confidence: detectedArtifact.confidence
            }
          }
        };
        
        // Create individual artifact
        const result = await artifactService.createArtifact(createRequest, originalContentWithThinking || content);
        
        if (result.success && result.artifact) {
          console.log(`✅ [ChatAPI] Artifact ${i + 1}/${detection.artifacts.length} created: ${result.artifact.id}`);
          
          createdArtifacts.push({
            artifactId: result.artifact.id,
            artifactType: detectedArtifact.type,
            title: detectedArtifact.title,
            language: detectedArtifact.language,
            order: i
          });
        } else {
          console.warn(`⚠️ [ChatAPI] Failed to create artifact ${i + 1}: ${result.error}`);
          creationErrors.push({
            index: i,
            title: detectedArtifact.title,
            error: result.error || 'Unknown error'
          });
        }
        
      } catch (error) {
        console.error(`❌ [ChatAPI] Error creating artifact ${i + 1}:`, error);
        creationErrors.push({
          index: i,
          title: detectedArtifact.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    // Log creation results
    if (creationErrors.length > 0) {
      console.warn(`⚠️ [ChatAPI] ${creationErrors.length}/${detection.artifacts.length} artifacts failed to create`);
    }
    
    // FIXED: If we used original content for detection, apply artifact removal to the processed content
    let finalProcessedContent = content;
    if (originalContentWithThinking && createdArtifacts.length > 0) {
      // Map artifact positions from original content to processed content
      finalProcessedContent = removeArtifactsFromProcessedContent(content, createdArtifacts);
    } else {
      finalProcessedContent = detection.processedContent || content;
    }
    
    return {
      processedContent: finalProcessedContent,
      artifacts: createdArtifacts,
      hasArtifact: createdArtifacts.length > 0,
      artifactCount: createdArtifacts.length,
      creationStrategy: `multi-artifact-${detection.detectionStrategy}`
    };
    
  } catch (error) {
    console.error(`❌ [ChatAPI] Error in multi-artifact creation:`, error);
    return {
      processedContent: content,
      artifacts: [],
      hasArtifact: false,
      artifactCount: 0,
      creationStrategy: 'error'
    };
  }
}

/**
 * FIXED: Helper function to remove artifacts from processed content after thinking removal
 */
function removeArtifactsFromProcessedContent(
  processedContent: string,
  artifacts: ArtifactReference[]
): string {
  let result = processedContent;
  
  // Create placeholders for each artifact
  for (const artifact of artifacts) {
    const placeholder = `[Created ${artifact.title || artifact.artifactType} artifact]`;
    
    // Try to find and remove any remaining code blocks in the processed content
    const codeBlockPattern = new RegExp(`\`\`\`[\\s\\S]*?\`\`\``, 'g');
    let hasReplaced = false;
    
    result = result.replace(codeBlockPattern, (match) => {
      if (!hasReplaced) {
        hasReplaced = true;
        return placeholder;
      }
      return match;
    });
    
    // If no code block was found, append the placeholder at the end
    if (!hasReplaced && result.trim()) {
      result = result.trim() + '\n\n' + placeholder;
    }
  }
  
  return result.trim() || 'Generated artifact content';
}

/**
 * Legacy wrapper for backward compatibility
 */
async function createArtifactFromResponse(
  content: string,
  conversationId: string,
  messageId: string
): Promise<{
  processedContent: string;
  artifactId?: string;
  artifactType?: ArtifactType;
  hasArtifact: boolean;
}> {
  const result = await createMultiArtifactsFromResponse(content, conversationId, messageId);
  
  // Return legacy format for backward compatibility
  const firstArtifact = result.artifacts[0];
  return {
    processedContent: result.processedContent,
    artifactId: firstArtifact?.artifactId,
    artifactType: firstArtifact?.artifactType,
    hasArtifact: result.hasArtifact
  };
}

// =====================================
// ENHANCED STREAMING ENDPOINT WITH THINKING
// =====================================

// ENHANCED: Streaming endpoint for basic models with typewriter effect + multi-artifact creation + thinking processing
router.post('/stream', async (req, res, next) => {
  try {
    // Validate input
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, 'Invalid request body');
    }

    const { message, conversationId, model, visionModel, images } = validation.data;

    // Check if model is basic (no capabilities)
    const capabilities = await getModelCapabilitiesWithFallback(model);
    if (!isBasicModel(capabilities)) {
      throw new AppError(400, 'Streaming is only available for basic models (models without vision, tools, or reasoning capabilities)');
    }

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Send initial event to confirm connection
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    try {
      // Get or create conversation
      let convId: string;
      let conversation: Conversation;
      
      if (conversationId) {
        // Validate existing conversation using proper ObjectId conversion
        const existingConv = await db.conversations.findOne({ 
          _id: toObjectId(conversationId) as any
        });
        if (!existingConv) {
          throw new AppError(404, 'Conversation not found');
        }
        convId = conversationId;
        conversation = formatConversation(existingConv);
      } else {
        // Create new conversation
        const newConversation: ConversationDoc = {
          title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
          model,
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 0,
        };
        const result = await db.conversations.insertOne(newConversation as any);
        convId = result.insertedId.toString();
        conversation = formatConversation({
          ...newConversation,
          _id: result.insertedId,
        });
      }

      // Send conversation info
      res.write(`data: ${JSON.stringify({ 
        type: 'conversation', 
        conversation,
        conversationId: convId 
      })}\n\n`);

      // Create streamliner based on model
      const streamliner = StreamlinerFactory.getStreamliner(model);
      await streamliner.initialize();
      // Process the request WITHOUT saving the user message first
      // This prevents duplicate messages in the conversation history
      const processedRequest = await streamliner.processRequest({
        content: message,
        model,
        visionModel,
        images,
        conversationId: convId,
      });

      // Send thinking state
      res.write(`data: ${JSON.stringify({ type: 'thinking', isThinking: true })}\n\n`);

      // Start streaming response
      let assistantContent = '';
      const startTime = Date.now();
      let tokenCount = 0;

      res.write(`data: ${JSON.stringify({ type: 'streaming_start' })}\n\n`);

      // ENHANCED: Enhanced streamChat with thinking processing
      await streamliner.streamChat(
        processedRequest, 
        (token: string) => {
          assistantContent += token;
          tokenCount++;
          
          // Send each token as it comes
          res.write(`data: ${JSON.stringify({ 
            type: 'token', 
            token,
            content: assistantContent 
          })}\n\n`);
        },
        // ENHANCED: onComplete callback for thinking processing
        (result: any) => {
          console.log('🧠 [ChatAPI] Stream completed, processing thinking content...');
          
          // FIXED: Process thinking if present and send event to frontend
          if (result.thinking?.hasThinking) {
            console.log(`✅ [ChatAPI] Thinking content detected (${result.thinking.thinkingContent.length} chars)`);
            
            // FIXED: Send thinking_detected event to frontend
            res.write(`data: ${JSON.stringify({ 
              type: 'thinking_detected',
              thinking: result.thinking.thinkingData
            })}\n\n`);
          }
        }
      );

      // Send streaming end
      res.write(`data: ${JSON.stringify({ type: 'streaming_end' })}\n\n`);

      // NOW save both messages AFTER the response is generated
      // This ensures the conversation history is correct for the next request
      const userMessage: MessageDoc = {
        conversationId: convId,
        role: 'user' as const,
        content: message,
        images,
        createdAt: new Date(),
      };
      const userResult = await db.messages.insertOne(userMessage as any);
      const userMessageId = userResult.insertedId.toString();

      // ENHANCED: Process thinking content before saving assistant message
      const thinkingResult = parseThinkingFromContent(assistantContent);
      let finalAssistantContent = assistantContent;
      let thinkingData: ThinkingData | undefined = undefined;
      
      if (thinkingResult.hasThinking) {
        console.log(`🧠 [ChatAPI] Processing thinking content for database storage`);
        finalAssistantContent = thinkingResult.processedContent;
        thinkingData = thinkingResult.thinkingData;
      }

      // Save assistant message and create artifacts
      const assistantMessageDoc: MessageDoc = {
        conversationId: convId,
        role: 'assistant' as const,
        content: finalAssistantContent, // Will be updated after artifact processing
        metadata: {
          model,
          visionModel,
          tokens: tokenCount,
          generationTime: Date.now() - startTime,
          // ENHANCED: Add thinking metadata
          thinking: thinkingData,
          originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined,
        },
        createdAt: new Date(),
      };
      
      const assistantResult = await db.messages.insertOne(assistantMessageDoc as any);
      const assistantMessageId = assistantResult.insertedId.toString();

      // FIXED: Process artifacts with original content (including thinking tags)
      console.log(`🎨 [ChatAPI] Processing assistant response for multi-artifacts...`);
      const artifactResult = await createMultiArtifactsFromResponse(
        finalAssistantContent, // Processed content without thinking tags
        convId,
        assistantMessageId,
        thinkingResult.hasThinking ? assistantContent : undefined // Original content with thinking tags
      );

      // Update assistant message with multi-artifact metadata and processed content
      if (artifactResult.hasArtifact) {
        await db.messages.updateOne(
          { _id: toObjectId(assistantMessageId) as any },
          {
            $set: {
              content: artifactResult.processedContent,
              'metadata.artifacts': artifactResult.artifacts,
              'metadata.hasArtifact': true,
              'metadata.artifactCount': artifactResult.artifactCount,
              'metadata.artifactCreationStrategy': artifactResult.creationStrategy,
              'metadata.multipleCodeBlocks': artifactResult.artifactCount > 1,
              'metadata.originalContent': finalAssistantContent,
              'metadata.codeBlocksRemoved': true,
              // Legacy compatibility
              'metadata.artifactId': artifactResult.artifacts[0]?.artifactId,
              'metadata.artifactType': artifactResult.artifacts[0]?.artifactType,
              updatedAt: new Date()
            }
          }
        );

        console.log(`✅ [ChatAPI] Assistant message updated with ${artifactResult.artifactCount} artifacts`);
        
        // Send artifact creation notifications
        for (const artifact of artifactResult.artifacts) {
          res.write(`data: ${JSON.stringify({ 
            type: 'artifact_created',
            artifactId: artifact.artifactId,
            artifactType: artifact.artifactType,
            title: artifact.title,
            order: artifact.order
          })}\n\n`);
        }
      }

      // Update conversation
      await db.conversations.updateOne(
        { _id: toObjectId(convId) as any },
        {
          $set: { updatedAt: new Date() },
          $inc: { messageCount: 2 },
        }
      );

      // ENHANCED: Send final completion event with thinking data
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        message: artifactResult.processedContent || finalAssistantContent,
        metadata: {
          ...assistantMessageDoc.metadata,
          artifacts: artifactResult.artifacts,
          hasArtifact: artifactResult.hasArtifact,
          artifactCount: artifactResult.artifactCount,
          artifactCreationStrategy: artifactResult.creationStrategy,
          multipleCodeBlocks: artifactResult.artifactCount > 1,
          originalContent: artifactResult.hasArtifact ? finalAssistantContent : undefined,
          codeBlocksRemoved: artifactResult.hasArtifact,
          // Legacy compatibility
          artifactId: artifactResult.artifacts[0]?.artifactId,
          artifactType: artifactResult.artifacts[0]?.artifactType,
          // ENHANCED: Include thinking data in response
          thinking: thinkingData,
          originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined
        },
        conversationId: convId 
      })}\n\n`);

    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: streamError instanceof Error ? streamError.message : 'Unknown error' 
      })}\n\n`);
    }

    res.end();
  } catch (error) {
    next(error);
  }
});

// =====================================
// ENHANCED SEND MESSAGE ENDPOINT WITH THINKING
// =====================================

// ENHANCED: Send a chat message (HTTP fallback for WebSocket) + multi-artifact creation + thinking processing
router.post('/send', async (req, res, next) => {
  try {
    // Validate input
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, 'Invalid request body');
    }

    const { message, conversationId, model, visionModel, images } = validation.data;

    // Get or create conversation
    let convId: string;
    let conversation: Conversation;
    
    if (conversationId) {
      // Validate existing conversation using proper ObjectId conversion
      const existingConv = await db.conversations.findOne({ 
        _id: toObjectId(conversationId) as any
      });
      if (!existingConv) {
        throw new AppError(404, 'Conversation not found');
      }
      convId = conversationId;
      conversation = formatConversation(existingConv);
    } else {
      // Create new conversation
      const newConversation: ConversationDoc = {
        title: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
        model,
        createdAt: new Date(),
        updatedAt: new Date(),
        messageCount: 0,
      };
      const result = await db.conversations.insertOne(newConversation as any);
      convId = result.insertedId.toString();
      conversation = formatConversation({
        ...newConversation,
        _id: result.insertedId,
      });
    }

    // Create streamliner based on model
    const streamliner = StreamlinerFactory.getStreamliner(model);
    await streamliner.initialize();
    // Process the request WITHOUT saving the user message first
    const processedRequest = await streamliner.processRequest({
      content: message,
      model,
      visionModel,
      images,
      conversationId: convId,
    });

    // Get response from Ollama (non-streaming for HTTP)
    let assistantContent = '';
    const startTime = Date.now();
    let tokenCount = 0;
    let thinkingData: ThinkingData | undefined = undefined;

    // ENHANCED: Enhanced streamChat with thinking processing for non-streaming endpoint
    await streamliner.streamChat(
      processedRequest, 
      (token: string) => {
        assistantContent += token;
        tokenCount++;
      },
      // ENHANCED: onComplete callback for thinking processing
      (result) => {
        console.log('🧠 [ChatAPI] Non-streaming request completed, processing thinking content...');
        
        if (result.thinking?.hasThinking) {
          console.log(`✅ [ChatAPI] Thinking content detected (${result.thinking.thinkingContent.length} chars)`);
          thinkingData = result.thinking.thinkingData;
        }
      }
    );

    // ENHANCED: Process thinking content
    const thinkingResult = parseThinkingFromContent(assistantContent);
    let finalAssistantContent = assistantContent;
    
    if (thinkingResult.hasThinking) {
      console.log(`🧠 [ChatAPI] Processing thinking content for database storage`);
      finalAssistantContent = thinkingResult.processedContent;
      thinkingData = thinkingResult.thinkingData;
    }

    // Save both messages AFTER generating the response
    const userMessage: MessageDoc = {
      conversationId: convId,
      role: 'user' as const,
      content: message,
      images,
      createdAt: new Date(),
    };
    await db.messages.insertOne(userMessage as any);

    // Save assistant message
    const assistantMessageDoc: MessageDoc = {
      conversationId: convId,
      role: 'assistant' as const,
      content: finalAssistantContent,
      metadata: {
        model,
        visionModel,
        tokens: tokenCount,
        generationTime: Date.now() - startTime,
        // ENHANCED: Add thinking metadata
        thinking: thinkingData,
        originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined,
      },
      createdAt: new Date(),
    };
    
    const assistantResult = await db.messages.insertOne(assistantMessageDoc as any);
    const assistantMessageId = assistantResult.insertedId.toString();

    // FIXED: Process artifacts with original content (including thinking tags)
    console.log(`🎨 [ChatAPI] Processing assistant response for multi-artifacts...`);
    const artifactResult = await createMultiArtifactsFromResponse(
      finalAssistantContent, // Processed content without thinking tags
      convId,
      assistantMessageId,
      thinkingResult.hasThinking ? assistantContent : undefined // Original content with thinking tags
    );

    // Update assistant message with multi-artifact metadata if artifacts were created
    let finalContent = finalAssistantContent;
    let finalMetadata = assistantMessageDoc.metadata;
    
    if (artifactResult.hasArtifact) {
      finalContent = artifactResult.processedContent;
      finalMetadata = {
        ...assistantMessageDoc.metadata,
        artifacts: artifactResult.artifacts,
        hasArtifact: true,
        artifactCount: artifactResult.artifactCount,
        artifactCreationStrategy: artifactResult.creationStrategy,
        multipleCodeBlocks: artifactResult.artifactCount > 1,
        originalContent: finalAssistantContent,
        codeBlocksRemoved: true,
        // Legacy compatibility
        artifactId: artifactResult.artifacts[0]?.artifactId,
        artifactType: artifactResult.artifacts[0]?.artifactType
      };

      await db.messages.updateOne(
        { _id: toObjectId(assistantMessageId) as any },
        {
          $set: {
            content: finalContent,
            metadata: finalMetadata,
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ [ChatAPI] Assistant message updated with ${artifactResult.artifactCount} artifacts`);
    }

    // Update conversation
    await db.conversations.updateOne(
      { _id: toObjectId(convId) as any },
      {
        $set: { updatedAt: new Date() },
        $inc: { messageCount: 2 },
      }
    );

    // ENHANCED: Return response with proper conversation object and thinking data
    res.json({
      success: true,
      data: {
        conversation,
        conversationId: convId,
        message: finalContent,
        metadata: finalMetadata,
        // NEW: Include multi-artifact information in response
        artifacts: artifactResult.hasArtifact ? artifactResult.artifacts : undefined,
        artifactCount: artifactResult.artifactCount,
        // Legacy artifact information for backward compatibility
        artifact: artifactResult.hasArtifact ? {
          id: artifactResult.artifacts[0]?.artifactId,
          type: artifactResult.artifacts[0]?.artifactType
        } : undefined,
        // ENHANCED: Include thinking data in response
        thinking: thinkingData,
        originalContentWithThinking: thinkingResult.hasThinking ? assistantContent : undefined
      },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// =====================================
// EXISTING ENDPOINTS (updated with proper ObjectId handling)
// =====================================

// Get conversations
router.get('/conversations', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [conversations, total] = await Promise.all([
      db.conversations
        .find({})
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray(),
      db.conversations.countDocuments({}),
    ]);

    res.json({
      success: true,
      data: conversations.map(formatConversation),
      page: Number(page),
      pageSize: Number(limit),
      total,
      hasMore: skip + conversations.length < total,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get conversation by ID
router.get('/conversations/:id', async (req, res, next) => {
  try {
    const conversation = await db.conversations.findOne({
      _id: toObjectId(req.params.id) as any,
    });

    if (!conversation) {
      throw new AppError(404, 'Conversation not found');
    }

    res.json({
      success: true,
      data: formatConversation(conversation),
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// ENHANCED: Get messages for a conversation WITH artifacts
router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const conversationId = req.params.id;

    const [messages, total] = await Promise.all([
      db.messages
        .find({ conversationId })
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray(),
      db.messages.countDocuments({ conversationId }),
    ]);

    // NEW: Fetch artifacts for this conversation
    console.log(`📋 [ChatAPI] Fetching artifacts for conversation: ${conversationId}`);
    let artifacts: Artifact[] = [];
    try {
      artifacts = await artifactService.getArtifactsForConversation(conversationId);
      console.log(`✅ [ChatAPI] Found ${artifacts.length} artifacts for conversation`);
    } catch (error) {
      console.warn(`⚠️ [ChatAPI] Failed to fetch artifacts for conversation:`, error);
      // Continue without artifacts rather than failing the entire request
    }

    res.json({
      success: true,
      data: {
        messages: messages.map(formatMessage),
        artifacts: artifacts // NEW: Include artifacts in response
      },
      page: Number(page),
      pageSize: Number(limit),
      total,
      hasMore: skip + messages.length < total,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get conversation memory stats
router.get('/conversations/:id/memory-stats', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    
    // Verify conversation exists
    const conversation = await db.conversations.findOne({
      _id: toObjectId(conversationId) as any,
    });
    
    if (!conversation) {
      throw new AppError(404, 'Conversation not found');
    }

    const stats = await memoryService.getMemoryStats(conversationId);
    
    res.json({
      success: true,
      data: stats,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Update conversation memory configuration
router.put('/conversations/:id/memory-config', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    
    // Validate input
    const validation = memoryConfigSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, 'Invalid memory configuration');
    }

    await memoryService.updateConversationMemoryConfig(conversationId, validation.data);
    
    res.json({
      success: true,
      message: 'Memory configuration updated',
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Clear old messages from a conversation
router.post('/conversations/:id/clear-old-messages', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const { keepLast = 100 } = req.body;
    
    if (typeof keepLast !== 'number' || keepLast < 1 || keepLast > 1000) {
      throw new AppError(400, 'keepLast must be a number between 1 and 1000');
    }

    await memoryService.clearOldMessages(conversationId, keepLast);
    
    res.json({
      success: true,
      message: `Old messages cleared, keeping last ${keepLast} messages`,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Delete conversation
router.delete('/conversations/:id', async (req, res, next) => {
  try {
    const conversationId = req.params.id;

    // NEW: Delete all artifacts for this conversation first
    console.log(`🗑️ [ChatAPI] Deleting artifacts for conversation: ${conversationId}`);
    const artifactsToDelete = await artifactService.getArtifactsForConversation(conversationId);
    for (const artifact of artifactsToDelete) {
      await artifactService.deleteArtifact(artifact.id);
    }
    console.log(`✅ [ChatAPI] Deleted ${artifactsToDelete.length} artifacts`);

    // Delete all messages
    await db.messages.deleteMany({ conversationId });

    // Delete the conversation
    const result = await db.conversations.deleteOne({ 
      _id: toObjectId(conversationId) as any
    });

    if (result.deletedCount === 0) {
      throw new AppError(404, 'Conversation not found');
    }

    res.json({
      success: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Search messages
router.get('/search', async (req, res, next) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q || typeof q !== 'string') {
      throw new AppError(400, 'Search query is required');
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [messages, total] = await Promise.all([
      db.messages
        .find({ $text: { $search: q } } as any)
        .sort({ score: { $meta: 'textScore' } } as any)
        .skip(skip)
        .limit(Number(limit))
        .toArray(),
      db.messages.countDocuments({ $text: { $search: q } } as any),
    ]);

    res.json({
      success: true,
      data: messages.map(formatMessage),
      page: Number(page),
      pageSize: Number(limit),
      total,
      hasMore: skip + messages.length < total,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

export { router as chatRouter };
