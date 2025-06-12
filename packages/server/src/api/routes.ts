import { Application } from 'express';
import { connectionsRouter } from './connections';
import { mcpRouter } from './mcp';
import { chatRouter } from './chat';
import { configRouter } from './config';

export function setupRoutes(app: Application): void {
  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
  });

  // API routes
  app.use('/api/connections', connectionsRouter);
  app.use('/api/mcp', mcpRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/config', configRouter);
}