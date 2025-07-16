import { Router } from 'express';
import { chatRouter } from './chat';
import { chatEnhancedRouter } from './chat-endpoints-enhanced'; // NEW: Enhanced chat endpoints
import { healthRouter } from './health';
import { connectionsRouter } from './connections';
import { router as configRouter } from "./config";
import { modelsRouter } from './models';
import { progressiveRouter } from './progressive';
import { mcpRouter } from './mcp';
import { artifactsRouter } from './artifacts'; // Existing artifacts router
import { multiHostRouter } from './multihost'; // NEW: Multi-host coordination router

const router = Router();

// Mount all API routes
router.use('/chat', chatRouter);
router.use('/chat-enhanced', chatEnhancedRouter); // NEW: Enhanced chat endpoints
router.use('/health', healthRouter);
router.use('/connections', connectionsRouter);
router.use('/config', configRouter);
router.use('/models', modelsRouter);
router.use('/progressive', progressiveRouter);
router.use('/mcp', mcpRouter);
router.use('/artifacts', artifactsRouter); // Existing artifacts endpoints
router.use('/multihost', multiHostRouter); // NEW: Multi-host coordination endpoints

export default router;
