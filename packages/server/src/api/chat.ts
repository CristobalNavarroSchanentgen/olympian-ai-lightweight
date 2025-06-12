import { Router } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { AppError } from '../middleware/errorHandler';
import { chatRateLimiter } from '../middleware/rateLimiter';
import { z } from 'zod';

const router = Router();
const db = DatabaseService.getInstance();
const streamliner = new OllamaStreamliner();

// Apply rate limiting to chat endpoints
router.use(chatRateLimiter);

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
      data: conversations,
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
      data: conversation,
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
      data: messages,
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

// Delete conversation
router.delete('/conversations/:id', async (req, res, next) => {
  try {
    const conversationId = req.params.id;

    // Delete all messages first
    await db.messages.deleteMany({ conversationId });

    // Delete the conversation
    const result = await db.conversations.deleteOne({ _id: conversationId });

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
        .find({ $text: { $search: q } })
        .sort({ score: { $meta: 'textScore' } })
        .skip(skip)
        .limit(Number(limit))
        .toArray(),
      db.messages.countDocuments({ $text: { $search: q } }),
    ]);

    res.json({
      success: true,
      data: messages,
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