import { Application } from 'express';
import { connectionsRouter } from './connections';
import { mcpRouter } from './mcp';
import { chatRouter } from './chat';
import { configRouter } from './config';
import { healthRouter } from './health';
import { modelsRouter } from './models';

export function setupRoutes(app: Application): void {
  // Health and monitoring
  app.use('/api/health', healthRouter);

  // API routes
  app.use('/api/connections', connectionsRouter);
  app.use('/api/mcp', mcpRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/config', configRouter);
  app.use('/api/models', modelsRouter);
}