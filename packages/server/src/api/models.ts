import { Router } from 'express';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { modelProgressiveLoader } from '../services/ModelProgressiveLoader';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const modelsRouter = Router();
const ollamaStreamliner = new OllamaStreamliner();

// Get all available models
modelsRouter.get('/list', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/list - Fetching available models');
  
  const models = await ollamaStreamliner.listModels();
  
  res.json({ models });
}));

// Get model capabilities for all models - WITH INCREASED TIMEOUT AND PROGRESSIVE FALLBACK
modelsRouter.get('/capabilities', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/capabilities - Fetching model capabilities');
  
  // Set a longer timeout for this request (5 minutes)
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); // 5 minutes
  
  try {
    // First, check if we have cached data from progressive loader
    if (modelProgressiveLoader.hasCachedData()) {
      const capabilities = modelProgressiveLoader.getCapabilities();
      logger.info(`✅ Using cached capabilities from progressive loader (${capabilities.length} models)`);
      
      res.json({ 
        capabilities,
        cached: true,
        source: 'progressive_loader',
        message: 'Using cached model capabilities from progressive loader'
      });
      return;
    }
    
    // If currently loading progressively, return current state with loading flag
    if (modelProgressiveLoader.isCurrentlyLoading()) {
      const capabilities = modelProgressiveLoader.getCapabilities();
      logger.info(`⏳ Progressive loading in progress, returning partial results (${capabilities.length} models so far)`);
      
      res.json({ 
        capabilities,
        cached: false,
        isLoading: true,
        source: 'progressive_loader_partial',
        message: 'Progressive loading in progress. Use /api/progressive/models/capabilities/stream for real-time updates.'
      });
      return;
    }
    
    // Fallback to original streamliner method with extended timeout
    logger.info('🔄 No cached data available, falling back to direct OllamaStreamliner method...');
    logger.warn('⚠️ This may take a long time with many models. Consider using progressive loading endpoints.');
    
    const capabilities = await ollamaStreamliner.getModelCapabilities();
    
    res.json({ 
      capabilities,
      cached: false,
      source: 'direct_streamliner',
      message: 'Fetched capabilities directly from OllamaStreamliner (may be slow with many models)'
    });
    
  } catch (error) {
    logger.error('❌ Failed to get model capabilities:', error);
    
    // Try to return any partial data from progressive loader as last resort
    const partialCapabilities = modelProgressiveLoader.getCapabilities();
    if (partialCapabilities.length > 0) {
      logger.info(`🆘 Returning partial capabilities as fallback (${partialCapabilities.length} models)`);
      
      res.json({ 
        capabilities: partialCapabilities,
        cached: true,
        partial: true,
        source: 'progressive_loader_fallback',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Returning partial cached capabilities due to error in full fetch'
      });
      return;
    }
    
    throw error;
  }
}));

// Get capabilities for a specific model
modelsRouter.get('/capabilities/:modelName', asyncHandler(async (req, res) => {
  const { modelName } = req.params;
  logger.info(`GET /api/models/capabilities/${modelName} - Fetching capabilities for model`);
  
  // Set a longer timeout for individual model capability detection (2 minutes)
  req.setTimeout(120000); // 2 minutes
  res.setTimeout(120000); // 2 minutes
  
  try {
    // First check if we have this model in progressive loader cache
    const cachedCapabilities = modelProgressiveLoader.getCapabilities();
    const cachedCapability = cachedCapabilities.find(cap => cap.name === modelName);
    
    if (cachedCapability) {
      logger.info(`✅ Using cached capability for model '${modelName}' from progressive loader`);
      res.json({ 
        capability: cachedCapability,
        cached: true,
        source: 'progressive_loader'
      });
      return;
    }
    
    // Fallback to direct detection with increased timeout
    logger.info(`🔍 No cached data for '${modelName}', detecting capabilities directly...`);
    const capability = await ollamaStreamliner.detectCapabilities(modelName);
    
    res.json({ 
      capability,
      cached: false,
      source: 'direct_detection'
    });
    
  } catch (error) {
    logger.error(`❌ Failed to get capabilities for model '${modelName}':`, error);
    throw error;
  }
}));

// Get vision-capable models - WITH INCREASED TIMEOUT AND PROGRESSIVE FALLBACK
modelsRouter.get('/vision', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/vision - Fetching vision-capable models');
  
  // Set a longer timeout for this request (5 minutes)
  req.setTimeout(300000); // 5 minutes  
  res.setTimeout(300000); // 5 minutes
  
  try {
    // First, check if we have cached data from progressive loader
    if (modelProgressiveLoader.hasCachedData()) {
      const visionModels = modelProgressiveLoader.getVisionModels();
      logger.info(`✅ Using cached vision models from progressive loader (${visionModels.length} models)`);
      
      res.json({ 
        models: visionModels,
        cached: true,
        source: 'progressive_loader',
        message: 'Using cached vision models from progressive loader'
      });
      return;
    }
    
    // If currently loading progressively, return current vision models
    if (modelProgressiveLoader.isCurrentlyLoading()) {
      const visionModels = modelProgressiveLoader.getVisionModels();
      logger.info(`⏳ Progressive loading in progress, returning partial vision models (${visionModels.length} models so far)`);
      
      res.json({ 
        models: visionModels,
        cached: false,
        isLoading: true,
        source: 'progressive_loader_partial',
        message: 'Progressive loading in progress. Use /api/progressive/models/capabilities/stream for real-time updates.'
      });
      return;
    }
    
    // Fallback to original streamliner method with extended timeout
    logger.info('🔄 No cached data available, falling back to direct OllamaStreamliner method...');
    logger.warn('⚠️ This may take a long time with many models. Consider using progressive loading endpoints.');
    
    const visionModels = await ollamaStreamliner.getAvailableVisionModels();
    
    res.json({ 
      models: visionModels,
      cached: false,
      source: 'direct_streamliner',
      message: 'Fetched vision models directly from OllamaStreamliner (may be slow with many models)'
    });
    
  } catch (error) {
    logger.error('❌ Failed to get vision models:', error);
    
    // Try to return any partial vision models from progressive loader as last resort
    const partialVisionModels = modelProgressiveLoader.getVisionModels();
    if (partialVisionModels.length > 0) {
      logger.info(`🆘 Returning partial vision models as fallback (${partialVisionModels.length} models)`);
      
      res.json({ 
        models: partialVisionModels,
        cached: true,
        partial: true,
        source: 'progressive_loader_fallback',
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Returning partial cached vision models due to error in full fetch'
      });
      return;
    }
    
    throw error;
  }
}));
