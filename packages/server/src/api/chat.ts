import { Router } from 'express';
import { ObjectId, WithId } from 'mongodb';
import { DatabaseService } from '../services/DatabaseService';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { ChatMemoryService } from '../services/ChatMemoryService';
import { modelProgressiveLoader } from '../services/ModelProgressiveLoader';
import { AppError } from '../middleware/errorHandler';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';
import { Message, Conversation, ModelCapability } from '@olympian/shared';

const router = Router();
const db = DatabaseService.getInstance();
const streamliner = new OllamaStreamliner();
const memoryService = ChatMemoryService.getInstance();

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

// NEW: Streaming endpoint for basic models with typewriter effect
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
        // Validate existing conversation
        const existingConv = await db.conversations.findOne({ 
          _id: new ObjectId(conversationId) 
        } as any);
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

      await streamliner.streamChat(processedRequest, (token: string) => {
        assistantContent += token;
        tokenCount++;
        
        // Send each token as it comes
        res.write(`data: ${JSON.stringify({ 
          type: 'token', 
          token,
          content: assistantContent 
        })}\n\n`);
      });

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
      await db.messages.insertOne(userMessage as any);

      // Save assistant message
      const assistantMessage: MessageDoc = {
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
      await db.messages.insertOne(assistantMessage as any);

      // Update conversation
      await db.conversations.updateOne(
        { _id: new ObjectId(convId) } as any,
        {
          $set: { updatedAt: new Date() },
          $inc: { messageCount: 2 },
        }
      );

      // Send final completion event
      res.write(`data: ${JSON.stringify({ 
        type: 'complete',
        message: assistantContent,
        metadata: assistantMessage.metadata,
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

// Send a chat message (HTTP fallback for WebSocket)
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
      // Validate existing conversation
      const existingConv = await db.conversations.findOne({ 
        _id: new ObjectId(conversationId) 
      } as any);
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
    const assistantMessage: MessageDoc = {
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
    await db.messages.insertOne(assistantMessage as any);

    // Update conversation
    await db.conversations.updateOne(
      { _id: new ObjectId(convId) } as any,
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
        message: assistantContent,
        metadata: assistantMessage.metadata,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

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
      _id: new ObjectId(req.params.id),
    } as any);

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
        .find({ conversationId } as any)
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(Number(limit))
        .toArray(),
      db.messages.countDocuments({ conversationId } as any),
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
      _id: new ObjectId(conversationId),
    } as any);
    
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

    // Delete all messages first
    await db.messages.deleteMany({ conversationId } as any);

    // Delete the conversation
    const result = await db.conversations.deleteOne({ 
      _id: new ObjectId(conversationId) 
    } as any);

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
