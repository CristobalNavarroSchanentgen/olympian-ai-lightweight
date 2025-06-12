import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { logger } from './utils/logger';
import { DatabaseService } from './services/DatabaseService';
import { WebSocketService } from './services/WebSocketService';
import { setupRoutes } from './api/routes';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  },
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for image uploads
app.use(rateLimiter);

// Initialize services
const dbService = DatabaseService.getInstance();
const wsService = new WebSocketService(io);

// Setup routes
setupRoutes(app);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;

async function start(): Promise<void> {
  try {
    // Connect to MongoDB
    await dbService.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/olympian_ai_lite');
    logger.info('Connected to MongoDB');

    // Start WebSocket service
    wsService.initialize();
    logger.info('WebSocket service initialized');

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await dbService.disconnect();
  httpServer.close();
  process.exit(0);
});