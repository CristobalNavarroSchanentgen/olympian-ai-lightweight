import { Router } from 'express';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
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

// Get model capabilities for all models
modelsRouter.get('/capabilities', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/capabilities - Fetching model capabilities');
  
  const capabilities = await ollamaStreamliner.getModelCapabilities();
  
  res.json({ capabilities });
}));

// Get capabilities for a specific model
modelsRouter.get('/capabilities/:modelName', asyncHandler(async (req, res) => {
  const { modelName } = req.params;
  logger.info(`GET /api/models/capabilities/${modelName} - Fetching capabilities for model`);
  
  const capability = await ollamaStreamliner.detectCapabilities(modelName);
  
  res.json({ capability });
}));

// Get vision-capable models
modelsRouter.get('/vision', asyncHandler(async (req, res) => {
  logger.info('GET /api/models/vision - Fetching vision-capable models');
  
  const visionModels = await ollamaStreamliner.getAvailableVisionModels();
  
  res.json({ models: visionModels });
}));
