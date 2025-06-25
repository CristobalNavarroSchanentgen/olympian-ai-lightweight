import { Router } from 'express';
import { ObjectId, WithId } from 'mongodb';
import { DatabaseService } from '../services/DatabaseService';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { ChatMemoryService } from '../services/ChatMemoryService';
import { ArtifactService } from '../services/ArtifactService'; // NEW: Artifact service integration
import { modelProgressiveLoader } from '../services/ModelProgressiveLoader';
import { AppError } from '../middleware/errorHandler';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';
import { Message, Conversation, ModelCapability, CreateArtifactRequest, ArtifactType } from '@olympian/shared';

const router = Router();
const db = DatabaseService.getInstance();
const streamliner = new OllamaStreamliner();
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
    return await streamliner.detectCapabilities(modelName);
  } catch (error) {
    console.warn(`⚠️ Failed to get capabilities for model '${modelName}':`, error);
    return null;
  }
}

// =====================================
// NEW: ARTIFACT DETECTION AND CREATION
// =====================================

/**
 * Enhanced artifact detection for assistant responses
 * Detects code blocks, HTML, SVG, JSON, and other artifact-worthy content
 */
function detectArtifactContent(content: string): {
  shouldCreateArtifact: boolean;
  type?: ArtifactType;
  title?: string;
  language?: string;
  extractedContent?: string;
  processedContent?: string;
} {
  // Enhanced regex patterns for different artifact types
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const htmlRegex = /<!DOCTYPE html|<html|<div|<p>|<span>|<h[1-6]>/i;
  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  const jsonRegex = /```json\n([\s\S]*?)```/g;
  const csvRegex = /```csv\n([\s\S]*?)```/g;
  const reactRegex = /```(jsx?|tsx?)\n([\s\S]*?)```/g;
  
  // Check for code blocks first
  const codeMatches = Array.from(content.matchAll(codeBlockRegex));
  if (codeMatches.length > 0) {
    const firstMatch = codeMatches[0];
    const language = firstMatch[1] || 'text';
    const code = firstMatch[2].trim();
    
    // Determine artifact type based on language
    let artifactType: ArtifactType = 'code';
    let title = `${language.charAt(0).toUpperCase() + language.slice(1)} Code`;
    
    if (language.toLowerCase() === 'html' || htmlRegex.test(code)) {
      artifactType = 'html';
      title = 'HTML Document';
    } else if (language.toLowerCase() === 'json') {
      artifactType = 'json';
      title = 'JSON Data';
    } else if (language.toLowerCase() === 'csv') {
      artifactType = 'csv';
      title = 'CSV Data';
    } else if (['jsx', 'tsx', 'javascript', 'js', 'typescript', 'ts'].includes(language.toLowerCase()) && 
               (code.includes('React') || code.includes('useState') || code.includes('useEffect') || code.includes('Component'))) {
      artifactType = 'react';
      title = 'React Component';
    }
    
    // Remove code blocks from content for prose display
    const processedContent = content.replace(codeBlockRegex, '').trim();
    
    return {
      shouldCreateArtifact: code.length > 20, // Only create for substantial content
      type: artifactType,
      title,
      language: language || undefined,
      extractedContent: code,
      processedContent: processedContent || 'Generated artifact content'
    };
  }
  
  // Check for SVG content
  const svgMatches = content.match(svgRegex);
  if (svgMatches && svgMatches.length > 0) {
    const svgContent = svgMatches[0];
    const processedContent = content.replace(svgRegex, '').trim();
    
    return {
      shouldCreateArtifact: true,
      type: 'svg',
      title: 'SVG Diagram',
      extractedContent: svgContent,
      processedContent: processedContent || 'Generated SVG diagram'
    };
  }
  
  // Check for mermaid diagrams
  const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
  const mermaidMatches = Array.from(content.matchAll(mermaidRegex));
  if (mermaidMatches.length > 0) {
    const mermaidContent = mermaidMatches[0][2].trim();
    const processedContent = content.replace(mermaidRegex, '').trim();
    
    return {
      shouldCreateArtifact: true,
      type: 'mermaid',
      title: 'Mermaid Diagram',
      extractedContent: mermaidContent,
      processedContent: processedContent || 'Generated Mermaid diagram'
    };
  }
  
  // Check for standalone HTML content (not in code blocks)
  if (htmlRegex.test(content) && !content.includes('```')) {
    return {
      shouldCreateArtifact: true,
      type: 'html',
      title: 'HTML Content',
      extractedContent: content,
      processedContent: 'Generated HTML content'
    };
  }
  
  return { shouldCreateArtifact: false };
}

/**
 * Create artifact from detected content and update message metadata
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
  try {
    const detection = detectArtifactContent(content);
    
    if (!detection.shouldCreateArtifact || !detection.extractedContent) {
      return {
        processedContent: content,
        hasArtifact: false
      };
    }
    
    console.log(`🎨 [ChatAPI] Creating artifact of type '${detection.type}' for message ${messageId}`);
    
    // Create artifact request
    const createRequest: CreateArtifactRequest = {
      conversationId,
      messageId,
      title: detection.title || 'Generated Artifact',
      type: detection.type!,
      content: detection.extractedContent,
      language: detection.language,
      metadata: {
        detectionStrategy: 'chat_response_analysis',
        originalContent: content,
        processedContent: detection.processedContent,
        codeBlocksRemoved: true,
        reconstructionHash: '', // Will be calculated in service
        syncStatus: 'synced',
        contentSize: Buffer.from(detection.extractedContent, 'utf8').length,
        fallbackData: {
          detectionMethod: 'regex_pattern_matching',
          originalLength: content.length,
          extractedLength: detection.extractedContent.length
        }
      }
    };
    
    // Create artifact
    const result = await artifactService.createArtifact(createRequest, content);
    
    if (result.success && result.artifact) {
      console.log(`✅ [ChatAPI] Artifact created successfully: ${result.artifact.id}`);
      
      return {
        processedContent: detection.processedContent || content,
        artifactId: result.artifact.id,
        artifactType: detection.type,
        hasArtifact: true
      };
    } else {
      console.warn(`⚠️ [ChatAPI] Failed to create artifact: ${result.error}`);
      return {
        processedContent: content,
        hasArtifact: false
      };
    }
    
  } catch (error) {
    console.error(`❌ [ChatAPI] Error creating artifact:`, error);
    return {
      processedContent: content,
      hasArtifact: false
    };
  }
}

// =====================================
// ENHANCED STREAMING ENDPOINT
// =====================================

// NEW: Streaming endpoint for basic models with typewriter effect + artifact creation
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
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\\n\\n`);

    try {
      // Get or create conversation
      let convId: string;
      let conversation: Conversation;
      
      if (conversationId) {
        // Validate existing conversation using string ID
        const existingConv = await db.conversations.findOne({ 
          _id: conversationId 
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
      })}\\n\\n`);

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
      res.write(`data: ${JSON.stringify({ type: 'thinking', isThinking: true })}\\n\\n`);

      // Start streaming response
      let assistantContent = '';
      const startTime = Date.now();
      let tokenCount = 0;

      res.write(`data: ${JSON.stringify({ type: 'streaming_start' })}\\n\\n`);

      await streamliner.streamChat(processedRequest, (token: string) => {
        assistantContent += token;
        tokenCount++;
        
        // Send each token as it comes
        res.write(`data: ${JSON.stringify({ 
          type: 'token', 
          token,
          content: assistantContent 
        })}\\n\\n`);
      });

      // Send streaming end
      res.write(`data: ${JSON.stringify({ type: 'streaming_end' })}\\n\\n`);

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

      // Save assistant message and create artifacts
      const assistantMessageDoc: MessageDoc = {
        conversationId: convId,
        role: 'assistant' as const,
        content: assistantContent, // Will be updated after artifact processing
        metadata: {
          model,
          visionModel,
          tokens: tokenCount,
          generationTime: Date.now() - startTime,
        },
        createdAt: new Date(),
      };
      
      const assistantResult = await db.messages.insertOne(assistantMessageDoc as any);
      const assistantMessageId = assistantResult.insertedId.toString();

      // NEW: Create artifacts and update message content
      console.log(`🎨 [ChatAPI] Processing assistant response for artifacts...`);
      const artifactResult = await createArtifactFromResponse(
        assistantContent,
        convId,
        assistantMessageId
      );

      // Update assistant message with artifact metadata and processed content
      if (artifactResult.hasArtifact) {
        await db.messages.updateOne(
          { _id: assistantMessageId },
          {
            $set: {
              content: artifactResult.processedContent,
              'metadata.artifactId': artifactResult.artifactId,
              'metadata.artifactType': artifactResult.artifactType,
              'metadata.hasArtifact': true,
              'metadata.originalContent': assistantContent,
              'metadata.codeBlocksRemoved': true,
              updatedAt: new Date()
            }
          }
        );

        console.log(`✅ [ChatAPI] Assistant message updated with artifact metadata`);
        
        // Send artifact creation notification
        res.write(`data: ${JSON.stringify({ 
          type: 'artifact_created',
          artifactId: artifactResult.artifactId,
          artifactType: artifactResult.artifactType
        })}\\n\\n`);
      }

      // Update conversation
      await db.conversations.updateOne(
        { _id: convId },
        {
          $set: { updatedAt: new Date() },
          $inc: { messageCount: 2 },
        }
      );

      // Send final completion event
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        message: artifactResult.processedContent,
        metadata: {
          ...assistantMessageDoc.metadata,
          artifactId: artifactResult.artifactId,
          artifactType: artifactResult.artifactType,
          hasArtifact: artifactResult.hasArtifact,
          originalContent: artifactResult.hasArtifact ? assistantContent : undefined,
          codeBlocksRemoved: artifactResult.hasArtifact
        },
        conversationId: convId 
      })}\\n\\n`);

    } catch (streamError) {
      console.error('Streaming error:', streamError);
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: streamError instanceof Error ? streamError.message : 'Unknown error' 
      })}\\n\\n`);
    }

    res.end();
  } catch (error) {
    next(error);
  }
});

// =====================================
// ENHANCED SEND MESSAGE ENDPOINT
// =====================================

// Send a chat message (HTTP fallback for WebSocket) + artifact creation
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
      // Validate existing conversation using string ID
      const existingConv = await db.conversations.findOne({ 
        _id: conversationId 
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

    await streamliner.streamChat(processedRequest, (token: string) => {
      assistantContent += token;
      tokenCount++;
    });

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
      content: assistantContent,
      metadata: {
        model,
        visionModel,
        tokens: tokenCount,
        generationTime: Date.now() - startTime,
      },
      createdAt: new Date(),
    };
    
    const assistantResult = await db.messages.insertOne(assistantMessageDoc as any);
    const assistantMessageId = assistantResult.insertedId.toString();

    // NEW: Create artifacts and update message content
    console.log(`🎨 [ChatAPI] Processing assistant response for artifacts...`);
    const artifactResult = await createArtifactFromResponse(
      assistantContent,
      convId,
      assistantMessageId
    );

    // Update assistant message with artifact metadata if artifacts were created
    let finalContent = assistantContent;
    let finalMetadata = assistantMessageDoc.metadata;
    
    if (artifactResult.hasArtifact) {
      finalContent = artifactResult.processedContent;
      finalMetadata = {
        ...assistantMessageDoc.metadata,
        artifactId: artifactResult.artifactId,
        artifactType: artifactResult.artifactType,
        hasArtifact: true,
        originalContent: assistantContent,
        codeBlocksRemoved: true
      };

      await db.messages.updateOne(
        { _id: assistantMessageId },
        {
          $set: {
            content: finalContent,
            metadata: finalMetadata,
            updatedAt: new Date()
          }
        }
      );

      console.log(`✅ [ChatAPI] Assistant message updated with artifact metadata`);
    }

    // Update conversation
    await db.conversations.updateOne(
      { _id: convId },
      {
        $set: { updatedAt: new Date() },
        $inc: { messageCount: 2 },
      }
    );

    // Return response with proper conversation object
    res.json({
      success: true,
      data: {
        conversation,
        conversationId: convId,
        message: finalContent,
        metadata: finalMetadata,
        // NEW: Include artifact information in response
        artifact: artifactResult.hasArtifact ? {
          id: artifactResult.artifactId,
          type: artifactResult.artifactType
        } : undefined
      },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// =====================================
// EXISTING ENDPOINTS (unchanged)
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
      _id: req.params.id,
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

// Get messages for a conversation
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

// Get conversation memory stats
router.get('/conversations/:id/memory-stats', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    
    // Verify conversation exists
    const conversation = await db.conversations.findOne({
      _id: conversationId,
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
      _id: conversationId 
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

// Get available models (excluding vision models) - WITH INCREASED TIMEOUT AND PROGRESSIVE FALLBACK
router.get('/models', async (req, res, next) => {
  try {
    // Set increased timeout for model loading
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    
    // Get all models and vision models with progressive fallback
    const [allModels, visionModels] = await Promise.all([
      streamliner.listModels(),
      getVisionModelsWithFallback()
    ]);
    
    // Filter out vision models from the regular models list
    const nonVisionModels = allModels.filter(model => !visionModels.includes(model));
    
    res.json({
      success: true,
      data: nonVisionModels,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get available vision models - WITH INCREASED TIMEOUT AND PROGRESSIVE FALLBACK
router.get('/vision-models', async (req, res, next) => {
  try {
    // Set increased timeout for vision model loading
    req.setTimeout(300000); // 5 minutes
    res.setTimeout(300000); // 5 minutes
    
    const visionModels = await getVisionModelsWithFallback();
    
    res.json({
      success: true,
      data: visionModels,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to get vision models with progressive fallback
async function getVisionModelsWithFallback(): Promise<string[]> {
  try {
    // First, check if we have cached data from progressive loader
    if (modelProgressiveLoader.hasCachedData()) {
      const visionModels = modelProgressiveLoader.getVisionModels();
      console.log(`✅ Using cached vision models from progressive loader (${visionModels.length} models)`);
      return visionModels;
    }
    
    // If currently loading progressively, return current vision models
    if (modelProgressiveLoader.isCurrentlyLoading()) {
      const visionModels = modelProgressiveLoader.getVisionModels();
      console.log(`⏳ Progressive loading in progress, returning partial vision models (${visionModels.length} models so far)`);
      return visionModels;
    }
    
    // Fallback to original streamliner method
    console.log('🔄 No cached data available, falling back to direct OllamaStreamliner method...');
    console.warn('⚠️ This may take a long time with many models. Consider using progressive loading endpoints.');
    
    return await streamliner.getAvailableVisionModels();
    
  } catch (error) {
    console.error('❌ Failed to get vision models:', error);
    
    // Try to return any partial vision models from progressive loader as last resort
    const partialVisionModels = modelProgressiveLoader.getVisionModels();
    if (partialVisionModels.length > 0) {
      console.log(`🆘 Returning partial vision models as fallback (${partialVisionModels.length} models)`);
      return partialVisionModels;
    }
    
    throw error;
  }
}

// Get model capabilities - WITH INCREASED TIMEOUT AND PROGRESSIVE FALLBACK
router.get('/models/:name/capabilities', async (req, res, next) => {
  try {
    // Set increased timeout for capability detection
    req.setTimeout(120000); // 2 minutes
    res.setTimeout(120000); // 2 minutes
    
    const modelName = req.params.name;
    
    // First check if we have this model in progressive loader cache
    const cachedCapabilities = modelProgressiveLoader.getCapabilities();
    const cachedCapability = cachedCapabilities.find(cap => cap.name === modelName);
    
    if (cachedCapability) {
      console.log(`✅ Using cached capability for model '${modelName}' from progressive loader`);
      res.json({
        success: true,
        data: cachedCapability,
        timestamp: new Date(),
      });
      return;
    }
    
    // Fallback to direct detection
    console.log(`🔍 No cached data for '${modelName}', detecting capabilities directly...`);
    const capabilities = await streamliner.detectCapabilities(modelName);
    
    res.json({
      success: true,
      data: capabilities,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

export { router as chatRouter };
