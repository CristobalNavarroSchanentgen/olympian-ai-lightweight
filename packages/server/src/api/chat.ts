import { Router } from 'express';
import { ObjectId, WithId } from 'mongodb';
import { DatabaseService } from '../services/DatabaseService';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { ChatMemoryService } from '../services/ChatMemoryService';
import { AppError } from '../middleware/errorHandler';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';
import { Message, Conversation } from '@olympian/shared';

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

// Send a chat message (HTTP fallback for WebSocket)
router.post('/send', async (req, res, next) => {
  try {
    // Validate input
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, 'Invalid request body');
    }

    const { message, conversationId, model, images } = validation.data;

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

    // Save user message BEFORE processing to ensure it's in history
    const userMessage: MessageDoc = {
      conversationId: convId,
      role: 'user' as const,
      content: message,
      images,
      createdAt: new Date(),
    };
    await db.messages.insertOne(userMessage as any);

    // Process the request with conversation history
    const processedRequest = await streamliner.processRequest({
      content: message,
      model,
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

    // Save assistant message
    const assistantMessage: MessageDoc = {
      conversationId: convId,
      role: 'assistant' as const,
      content: assistantContent,
      metadata: {
        model,
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

// Get available models
router.get('/models', async (_req, res, next) => {
  try {
    const models = await streamliner.listModels();
    res.json({
      success: true,
      data: models,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get model capabilities
router.get('/models/:name/capabilities', async (req, res, next) => {
  try {
    const capabilities = await streamliner.detectCapabilities(req.params.name);
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
