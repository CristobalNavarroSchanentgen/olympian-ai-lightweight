import { Router, Request, Response, NextFunction } from 'express';
import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { logger } from '../utils/logger';

export const modelsRouter = Router();
const ollamaStreamliner = new OllamaStreamliner();

// Get all available models
modelsRouter.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('GET /api/models/list - Fetching available models');
    
    const models = await ollamaStreamliner.listModels();
    
    res.json({ models });
  } catch (error) {
    next(error);
  }
});

// Get model capabilities for all models
modelsRouter.get('/capabilities', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('GET /api/models/capabilities - Fetching model capabilities');
    
    const capabilities = await ollamaStreamliner.getModelCapabilities();
    
    res.json({ capabilities });
  } catch (error) {
    next(error);
  }
});

// Get capabilities for a specific model
modelsRouter.get('/capabilities/:modelName', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { modelName } = req.params;
    logger.info(`GET /api/models/capabilities/${modelName} - Fetching capabilities for model`);
    
    const capability = await ollamaStreamliner.detectCapabilities(modelName);
    
    res.json({ capability });
  } catch (error) {
    next(error);
  }
});

// Get vision-capable models
modelsRouter.get('/vision', async (req: Request, res: Response, next: NextFunction) => {
  try {
    logger.info('GET /api/models/vision - Fetching vision-capable models');
    
    const visionModels = await ollamaStreamliner.getAvailableVisionModels();
    
    res.json({ models: visionModels });
  } catch (error) {
    next(error);
  }
});
