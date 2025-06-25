import { Router } from 'express';
import { chatRouter } from './chat';
import { healthRouter } from './health';
import { connectionsRouter } from './connections';
import { configRouter } from './config';
import { modelsRouter } from './models';
import { progressiveRouter } from './progressive';
import { mcpRouter } from './mcp';
import { artifactsRouter } from './artifacts'; // NEW: Artifacts router

const router = Router();

// Mount all API routes
router.use('/chat', chatRouter);
router.use('/health', healthRouter);
router.use('/connections', connectionsRouter);
router.use('/config', configRouter);
router.use('/models', modelsRouter);
router.use('/progressive', progressiveRouter);
router.use('/mcp', mcpRouter);
router.use('/artifacts', artifactsRouter); // NEW: Mount artifacts endpoints

export default router;
