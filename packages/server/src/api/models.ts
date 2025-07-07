import { Router } from 'express';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { modelProgressiveLoader } from '../services/ModelProgressiveLoader';
import { getDeploymentConfig } from '../config/deployment';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export const modelsRouter = Router();
const ollamaStreamliner = new OllamaStreamliner();

// Get all available models - FIXED RESPONSE FORMAT
modelsRouter.get('/list', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/list - Fetching available models');
  
  try {
    const models = await ollamaStreamliner.listModels();
    const deploymentConfig = getDeploymentConfig();
    
    // Return the expected format: { success: boolean; data: string[]; timestamp: string }
    res.json({ 
      success: true,
      data: models,
      timestamp: new Date().toISOString(),
      // Additional metadata for debugging
      _metadata: {
        deploymentMode: deploymentConfig.mode,
        modelCapabilityMode: deploymentConfig.modelCapability.mode
      }
    });
  } catch (error) {
    logger.error('❌ Failed to list models:', error);
    res.status(500).json({
      success: false,
      data: [],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Failed to fetch models'
    });
  }
}));

// Get model capabilities for all models - WITH INCREASED TIMEOUT AND PROGRESSIVE FALLBACK
modelsRouter.get('/capabilities', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/capabilities - Fetching model capabilities');
  
  const deploymentConfig = getDeploymentConfig();
  
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
        deploymentMode: deploymentConfig.mode,
        modelCapabilityMode: deploymentConfig.modelCapability.mode,
        message: `Using cached model capabilities from progressive loader (${deploymentConfig.modelCapability.mode} mode)`
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
        deploymentMode: deploymentConfig.mode,
        modelCapabilityMode: deploymentConfig.modelCapability.mode,
        message: `Progressive loading in progress (${deploymentConfig.modelCapability.mode} mode). Use /api/progressive/models/capabilities/stream for real-time updates.`
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
      deploymentMode: deploymentConfig.mode,
      modelCapabilityMode: deploymentConfig.modelCapability.mode,
      message: `Fetched capabilities directly from OllamaStreamliner (${deploymentConfig.modelCapability.mode} mode - may be slow with many models)`
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
        deploymentMode: deploymentConfig.mode,
        modelCapabilityMode: deploymentConfig.modelCapability.mode,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: `Returning partial cached capabilities due to error in full fetch (${deploymentConfig.modelCapability.mode} mode)`
      });
      return;
    }
    
    throw error;
  }
}));

// Get capabilities for a specific model - FIXED RESPONSE FORMAT
modelsRouter.get('/capabilities/:modelName', asyncHandler(async (req, res) => {
  const { modelName } = req.params;
  logger.info(`GET /api/models/capabilities/${modelName} - Fetching capabilities for model`);
  
  const deploymentConfig = getDeploymentConfig();
  
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
        success: true,
        data: cachedCapability,
        timestamp: new Date().toISOString(),
        cached: true,
        source: 'progressive_loader',
        deploymentMode: deploymentConfig.mode,
        modelCapabilityMode: deploymentConfig.modelCapability.mode,
        detectionMethod: deploymentConfig.modelCapability.mode
      });
      return;
    }
    
    // Fallback to direct detection with increased timeout
    logger.info(`🔍 No cached data for '${modelName}', detecting capabilities directly...`);
    const capability = await ollamaStreamliner.detectCapabilities(modelName);
    
    res.json({ 
      success: true,
      data: capability,
      timestamp: new Date().toISOString(),
      cached: false,
      source: 'direct_detection',
      deploymentMode: deploymentConfig.mode,
      modelCapabilityMode: deploymentConfig.modelCapability.mode,
      detectionMethod: deploymentConfig.modelCapability.mode
    });
    
  } catch (error) {
    logger.error(`❌ Failed to get capabilities for model '${modelName}':`, error);
    res.status(500).json({
      success: false,
      data: null,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Failed to detect model capabilities'
    });
  }
}));

// Get vision-capable models - FIXED RESPONSE FORMAT
modelsRouter.get('/vision', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/vision - Fetching vision-capable models');
  
  const deploymentConfig = getDeploymentConfig();
  
  // Set a longer timeout for this request (5 minutes)
  req.setTimeout(300000); // 5 minutes  
  res.setTimeout(300000); // 5 minutes
  
  try {
    // First, check if we have cached data from progressive loader
    if (modelProgressiveLoader.hasCachedData()) {
      const visionModels = modelProgressiveLoader.getVisionModels();
      logger.info(`✅ Using cached vision models from progressive loader (${visionModels.length} models)`);
      
      res.json({ 
        success: true,
        data: visionModels,
        timestamp: new Date().toISOString(),
        cached: true,
        source: 'progressive_loader',
        _metadata: {
          deploymentMode: deploymentConfig.mode,
          modelCapabilityMode: deploymentConfig.modelCapability.mode,
          message: `Using cached vision models from progressive loader (${deploymentConfig.modelCapability.mode} mode)`
        }
      });
      return;
    }
    
    // If currently loading progressively, return current vision models
    if (modelProgressiveLoader.isCurrentlyLoading()) {
      const visionModels = modelProgressiveLoader.getVisionModels();
      logger.info(`⏳ Progressive loading in progress, returning partial vision models (${visionModels.length} models so far)`);
      
      res.json({ 
        success: true,
        data: visionModels,
        timestamp: new Date().toISOString(),
        cached: false,
        isLoading: true,
        source: 'progressive_loader_partial',
        _metadata: {
          deploymentMode: deploymentConfig.mode,
          modelCapabilityMode: deploymentConfig.modelCapability.mode,
          message: `Progressive loading in progress (${deploymentConfig.modelCapability.mode} mode). Use /api/progressive/models/capabilities/stream for real-time updates.`
        }
      });
      return;
    }
    
    // Fallback to original streamliner method with extended timeout
    logger.info('🔄 No cached data available, falling back to direct OllamaStreamliner method...');
    logger.warn('⚠️ This may take a long time with many models. Consider using progressive loading endpoints.');
    
    const visionModels = await ollamaStreamliner.getAvailableVisionModels();
    
    res.json({ 
      success: true,
      data: visionModels,
      timestamp: new Date().toISOString(),
      cached: false,
      source: 'direct_streamliner',
      _metadata: {
        deploymentMode: deploymentConfig.mode,
        modelCapabilityMode: deploymentConfig.modelCapability.mode,
        message: `Fetched vision models directly from OllamaStreamliner (${deploymentConfig.modelCapability.mode} mode - may be slow with many models)`
      }
    });
    
  } catch (error) {
    logger.error('❌ Failed to get vision models:', error);
    
    // Try to return any partial vision models from progressive loader as last resort
    const partialVisionModels = modelProgressiveLoader.getVisionModels();
    if (partialVisionModels.length > 0) {
      logger.info(`🆘 Returning partial vision models as fallback (${partialVisionModels.length} models)`);
      
      res.json({ 
        success: true,
        data: partialVisionModels,
        timestamp: new Date().toISOString(),
        cached: true,
        partial: true,
        source: 'progressive_loader_fallback',
        _metadata: {
          deploymentMode: deploymentConfig.mode,
          modelCapabilityMode: deploymentConfig.modelCapability.mode,
          error: error instanceof Error ? error.message : 'Unknown error',
          message: `Returning partial cached vision models due to error in full fetch (${deploymentConfig.modelCapability.mode} mode)`
        }
      });
      return;
    }
    
    // If no partial data available, return error response
    res.status(500).json({
      success: false,
      data: [],
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Failed to fetch vision models'
    });
  }
}));

// Get model capability mode configuration info
modelsRouter.get('/capability-mode', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/capability-mode - Fetching capability mode configuration');
  
  const deploymentConfig = getDeploymentConfig();
  
  res.json({
    mode: deploymentConfig.modelCapability.mode,
    deploymentMode: deploymentConfig.mode,
    description: deploymentConfig.modelCapability.mode === 'custom' 
      ? 'Using predefined model capabilities for faster performance'
      : 'Using automatic capability detection for better accuracy',
    characteristics: {
      custom: {
        speed: 'Fast - No API testing required',
        accuracy: 'High for predefined models',
        performance: 'Predictable and lightweight',
        maintenance: 'Requires manual updates for new models',
        benefits: ['Instant startup', 'No server load from testing', 'Consistent results', 'Reduced network usage']
      },
      automatic: {
        speed: 'Slower - Requires API testing',
        accuracy: 'High for all models',
        performance: 'Variable depending on model count',
        maintenance: 'No configuration needed',
        benefits: ['Supports any model', 'Dynamic detection', 'Always up-to-date', 'No manual configuration']
      }
    },
    currentMode: deploymentConfig.modelCapability.mode,
    timestamp: new Date()
  });
}));
