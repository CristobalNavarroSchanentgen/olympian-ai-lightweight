import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { logger } from './utils/logger';
import { DatabaseService } from './services/DatabaseService';
import { WebSocketService } from './services/WebSocketService';
import { OllamaHealthCheck } from './services/OllamaHealthCheck';
import { setupRoutes } from './api/routes';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { getDeploymentConfig } from './config/deployment';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  },
});

// Get deployment configuration
const deploymentConfig = getDeploymentConfig();

// Configure Express trust proxy for multi-host deployments
// This is crucial for rate limiting and client IP detection when behind reverse proxies
// Also handle legacy "docker-multi-host" mode designation
const isMultiHostDeployment = deploymentConfig.mode === 'multi-host' || 
                              process.env.DEPLOYMENT_MODE?.includes('multi-host');

if (isMultiHostDeployment) {
  logger.info('Configuring Express to trust proxy headers for multi-host deployment');
  app.set('trust proxy', true);
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased for image uploads
app.use(rateLimiter);

// Initialize services
const dbService = DatabaseService.getInstance();
const wsService = new WebSocketService(io);
const ollamaHealthCheck = new OllamaHealthCheck();

// Setup routes
setupRoutes(app);

// Error handling
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 4000;

async function start(): Promise<void> {
  try {
    // Connect to MongoDB using deployment configuration
    await dbService.connect();
    logger.info('Connected to MongoDB');

    // Start WebSocket service
    wsService.initialize();
    logger.info('WebSocket service initialized');

    // Check Ollama health and vision models availability
    logger.info('Checking Ollama connectivity and vision models...');
    await ollamaHealthCheck.ensureVisionModelsAvailable();

    // Start HTTP server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`Deployment mode: ${deploymentConfig.mode}`);
      logger.info(`Ollama host: ${deploymentConfig.ollama.host}`);
      
      if (deploymentConfig.mode === 'multi-host') {
        logger.info('=== MULTI-HOST VISION TROUBLESHOOTING ===');
        logger.info('If vision models are not appearing:');
        logger.info('1. Check Ollama connectivity: curl http://localhost:4000/api/health/vision');
        logger.info('2. Install vision models on Ollama host: ollama pull llava:13b');
        logger.info('3. Verify models: curl http://your-ollama-host:11434/api/tags');
        logger.info('4. Restart this backend container after installing models');
        logger.info('=========================================');
      }
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
