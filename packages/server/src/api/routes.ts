import { Router } from 'express';
import { chatRouter } from './chat';
import { configRouter } from './config';
import { connectionsRouter } from './connections';
import { mcpRouter } from './mcp';
import { modelsRouter } from './models';
import { healthRouter } from './health';
import { progressiveRouter } from './progressive';

const router = Router();

// Register all API routes
router.use('/chat', chatRouter);
router.use('/config', configRouter);
router.use('/connections', connectionsRouter);
router.use('/mcp', mcpRouter);
router.use('/models', modelsRouter);
router.use('/health', healthRouter);
router.use('/progressive', progressiveRouter); // New progressive loading endpoints

export { router };
