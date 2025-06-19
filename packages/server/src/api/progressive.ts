import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { modelProgressiveLoader, ModelProgressiveLoader } from '../services/ModelProgressiveLoader';

export const progressiveRouter = Router();

/**
 * Start progressive model capability loading
 * Returns immediately with initial state, then use SSE endpoint to get updates
 */
progressiveRouter.post('/models/capabilities/start', asyncHandler(async (req, res) => {
  const { forceReload = false } = req.body;
  
  logger.info('POST /api/progressive/models/capabilities/start', { forceReload });
  
  try {
    // Check if we already have cached data and don't need to reload
    if (!forceReload && modelProgressiveLoader.hasCachedData()) {
      const cachedState = modelProgressiveLoader.getCurrentState();
      logger.info('✅ Returning cached model capabilities');
      
      res.json({
        success: true,
        data: cachedState,
        cached: true,
        message: 'Using cached model capabilities'
      });
      return;
    }
    
    // Start progressive loading (non-blocking)
    modelProgressiveLoader.startProgressiveLoading(forceReload)
      .catch(error => {
        logger.error('❌ Progressive loading failed:', error);
      });
    
    // Return initial state immediately
    const initialState = modelProgressiveLoader.getCurrentState();
    
    res.json({
      success: true,
      data: initialState,
      cached: false,
      message: 'Progressive loading started. Use SSE endpoint for real-time updates.'
    });
    
  } catch (error) {
    logger.error('❌ Failed to start progressive loading:', error);
    throw error;
  }
}));

/**
 * Server-Sent Events endpoint for real-time progressive loading updates
 * This allows the frontend to receive models as they are processed
 */
progressiveRouter.get('/models/capabilities/stream', (req, res) => {
  logger.info('GET /api/progressive/models/capabilities/stream - Client connected for SSE');
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Send initial state if available
  const currentState = modelProgressiveLoader.getCurrentState();
  if (currentState) {
    res.write(`data: ${JSON.stringify({
      type: 'initial_state',
      state: currentState
    })}\\n\\n`);
  }

  // Set up event listener for progress updates
  const handleProgress = (update: any) => {
    try {
      res.write(`data: ${JSON.stringify(update)}\\n\\n`);
      
      // Log significant events
      if (update.type === 'vision_model_found') {
        logger.info(`📡 SSE: Vision model found - ${update.model}`);
      } else if (update.type === 'loading_complete') {
        logger.info(`📡 SSE: Loading complete - ${update.progress.total} models processed`);
      }
    } catch (error) {
      logger.warn('⚠️ Failed to send SSE update:', error);
    }
  };

  // Subscribe to progress events
  modelProgressiveLoader.on('progress', handleProgress);

  // Handle client disconnect
  req.on('close', () => {
    logger.info('📡 SSE client disconnected');
    modelProgressiveLoader.off('progress', handleProgress);
  });

  req.on('error', (error) => {
    logger.warn('📡 SSE connection error:', error);
    modelProgressiveLoader.off('progress', handleProgress);
  });

  // Send keepalive ping every 30 seconds
  const keepAlive = setInterval(() => {
    try {
      res.write(': keepalive\\n\\n');
    } catch (error) {
      logger.warn('⚠️ Failed to send keepalive:', error);
      clearInterval(keepAlive);
    }
  }, 30000);

  // Clean up interval when connection closes
  req.on('close', () => {
    clearInterval(keepAlive);
  });
});

/**
 * Get current progressive loading state
 */
progressiveRouter.get('/models/capabilities/state', asyncHandler(async (req, res) => {
  logger.info('GET /api/progressive/models/capabilities/state');
  
  const state = modelProgressiveLoader.getCurrentState();
  const stats = modelProgressiveLoader.getStats();
  
  res.json({
    success: true,
    data: {
      state,
      stats,
      hasCachedData: modelProgressiveLoader.hasCachedData(),
      isLoading: modelProgressiveLoader.isCurrentlyLoading()
    }
  });
}));

/**
 * Get vision models from progressive loader (fast cached access)
 */
progressiveRouter.get('/models/vision', asyncHandler(async (req, res) => {
  logger.info('GET /api/progressive/models/vision');
  
  // Check if we have cached data
  if (modelProgressiveLoader.hasCachedData()) {
    const visionModels = modelProgressiveLoader.getVisionModels();
    logger.info(`✅ Returning ${visionModels.length} cached vision models`);
    
    res.json({
      success: true,
      data: visionModels,
      cached: true,
      message: 'Using cached vision models'
    });
    return;
  }
  
  // If no cached data and not currently loading, start progressive loading
  if (!modelProgressiveLoader.isCurrentlyLoading()) {
    logger.info('🚀 No cached data available, starting progressive loading...');
    modelProgressiveLoader.startProgressiveLoading()
      .catch(error => {
        logger.error('❌ Progressive loading failed:', error);
      });
  }
  
  // Return current vision models (may be empty if loading just started)
  const visionModels = modelProgressiveLoader.getVisionModels();
  const isLoading = modelProgressiveLoader.isCurrentlyLoading();
  
  res.json({
    success: true,
    data: visionModels,
    cached: false,
    isLoading,
    message: isLoading 
      ? 'Vision models are being loaded progressively. Use SSE endpoint for real-time updates.'
      : 'No vision models loaded yet.'
  });
}));

/**
 * Get all model capabilities from progressive loader (fast cached access)
 */
progressiveRouter.get('/models/capabilities', asyncHandler(async (req, res) => {
  logger.info('GET /api/progressive/models/capabilities');
  
  // Check if we have cached data
  if (modelProgressiveLoader.hasCachedData()) {
    const capabilities = modelProgressiveLoader.getCapabilities();
    logger.info(`✅ Returning ${capabilities.length} cached model capabilities`);
    
    res.json({
      success: true,
      data: capabilities,
      cached: true,
      message: 'Using cached model capabilities'
    });
    return;
  }
  
  // If no cached data and not currently loading, start progressive loading
  if (!modelProgressiveLoader.isCurrentlyLoading()) {
    logger.info('🚀 No cached data available, starting progressive loading...');
    modelProgressiveLoader.startProgressiveLoading()
      .catch(error => {
        logger.error('❌ Progressive loading failed:', error);
      });
  }
  
  // Return current capabilities (may be empty if loading just started)
  const capabilities = modelProgressiveLoader.getCapabilities();
  const isLoading = modelProgressiveLoader.isCurrentlyLoading();
  
  res.json({
    success: true,
    data: capabilities,
    cached: false,
    isLoading,
    message: isLoading 
      ? 'Model capabilities are being loaded progressively. Use SSE endpoint for real-time updates.'
      : 'No model capabilities loaded yet.'
  });
}));

/**
 * Clear cached model capabilities and force reload
 */
progressiveRouter.delete('/models/capabilities/cache', asyncHandler(async (req, res) => {
  logger.info('DELETE /api/progressive/models/capabilities/cache');
  
  modelProgressiveLoader.clearCache();
  
  res.json({
    success: true,
    message: 'Model capability cache cleared. Next request will trigger fresh loading.'
  });
}));

/**
 * Get progressive loading statistics
 */
progressiveRouter.get('/models/capabilities/stats', asyncHandler(async (req, res) => {
  logger.info('GET /api/progressive/models/capabilities/stats');
  
  const stats = modelProgressiveLoader.getStats();
  
  res.json({
    success: true,
    data: stats
  });
}));
