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

// Get deployment configuration
const deploymentConfig = getDeploymentConfig();

// Configure Express trust proxy for multi-host deployments
// This is crucial for rate limiting and client IP detection when behind reverse proxies
// Also handle legacy "docker-multi-host" mode designation
const isMultiHostDeployment = deploymentConfig.mode === 'multi-host' || 
                              process.env.DEPLOYMENT_MODE?.includes('multi-host');

// Configure CORS for Socket.IO based on deployment mode
const getCorsOrigin = () => {
  if (isMultiHostDeployment) {
    // In multi-host deployment behind nginx, accept all origins since nginx handles security
    logger.info('🔧 Multi-host deployment: Configuring Socket.IO CORS to accept all origins (nginx handles security)');
    return true; // Accept all origins
  } else {
    // For same-host deployments, use specific origin
    const origin = process.env.CLIENT_URL || 'http://localhost:3000';
    logger.info(`🔧 Same-host deployment: Configuring Socket.IO CORS for origin: ${origin}`);
    return origin;
  }
};

const io = new Server(httpServer, {
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
    methods: ['GET', 'POST'],
  },
  // Enhanced Socket.IO configuration for better connection stability
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 30000, // 30 seconds
  maxHttpBufferSize: 1e8, // 100 MB for large image uploads
  transports: ['websocket', 'polling'], // Allow both transports
  allowEIO3: true, // Allow Socket.IO v3 clients
});

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

// Track service initialization status
let serviceStatus = {
  httpServer: false,
  database: false,
  websocket: false,
  ollama: false,
};

async function start(): Promise<void> {
  try {
    logger.info('Starting server initialization...');
    logger.info(`Deployment mode: ${deploymentConfig.mode}`);
    logger.info(`MongoDB URI: ${deploymentConfig.mongodb.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    logger.info(`Ollama host: ${deploymentConfig.ollama.host}`);

    // Start HTTP server first - this allows health checks to pass immediately
    httpServer.listen(PORT, () => {
      serviceStatus.httpServer = true;
      logger.info(`✅ HTTP Server running on port ${PORT}`);
      
      if (deploymentConfig.mode === 'multi-host') {
        logger.info('🔧 Multi-host deployment detected');
        logger.info('📋 External service dependencies:');
        logger.info(`   - Ollama: ${deploymentConfig.ollama.host}`);
        logger.info(`   - MongoDB: ${deploymentConfig.mongodb.uri.includes('mongodb://mongodb:') ? 'Containerized' : 'External'}`);
      }
    });

    // Initialize database with enhanced error handling
    try {
      logger.info('🔄 Connecting to MongoDB...');
      await dbService.connect();
      serviceStatus.database = true;
      logger.info('✅ Database connected successfully');
    } catch (error) {
      serviceStatus.database = false;
      logger.error('❌ Database connection failed:', error);
      
      if (deploymentConfig.mode !== 'multi-host') {
        // For same-host deployments, database failure is critical
        throw error;
      } else {
        // For multi-host, log the error but continue startup
        logger.warn('⚠️  Continuing startup without database in multi-host mode');
        logger.warn('   Health checks will reflect database unavailability');
      }
    }

    // Initialize WebSocket service
    try {
      wsService.initialize();
      serviceStatus.websocket = true;
      logger.info('✅ WebSocket service initialized');
      
      // Log Socket.IO configuration
      logger.info('🔌 Socket.IO configuration:');
      logger.info(`   - Ping timeout: ${io.engine.opts.pingTimeout}ms`);
      logger.info(`   - Ping interval: ${io.engine.opts.pingInterval}ms`);
      logger.info(`   - Transports: ${io.engine.opts.transports?.join(', ')}`);
      logger.info(`   - CORS origin: ${isMultiHostDeployment ? 'All origins (multi-host mode)' : io.engine.opts.cors?.origin}`);
    } catch (error) {
      serviceStatus.websocket = false;
      logger.error('❌ WebSocket initialization failed:', error);
      // Continue without WebSocket functionality
    }

    // Check Ollama health asynchronously (non-blocking)
    logger.info('🔄 Checking Ollama connectivity (non-blocking)...');
    
    // Use setImmediate to ensure this runs after the server is fully started
    setImmediate(async () => {
      try {
        await ollamaHealthCheck.ensureVisionModelsAvailable();
        serviceStatus.ollama = true;
        logger.info('✅ Ollama health check completed successfully');
      } catch (error) {
        serviceStatus.ollama = false;
        logger.warn('⚠️  Ollama health check failed (non-blocking):', error);
        logger.info('📋 The server will continue to run. Check /api/health/vision for current status.');
        
        if (deploymentConfig.mode === 'multi-host') {
          logger.warn('🔧 Multi-host deployment troubleshooting:');
          logger.warn(`   - Verify Ollama is running at: ${deploymentConfig.ollama.host}`);
          logger.warn('   - Check network connectivity from container to external host');
          logger.warn('   - Verify firewall settings allow connections on port 11434');
          logger.warn(`   - Test manually: curl -f ${deploymentConfig.ollama.host}/api/version`);
        }
      }
    });

    // Log final startup status
    setTimeout(() => {
      logger.info('🚀 Server initialization completed');
      logger.info('📊 Service Status:');
      logger.info(`   HTTP Server: ${serviceStatus.httpServer ? '✅ Running' : '❌ Failed'}`);
      logger.info(`   Database: ${serviceStatus.database ? '✅ Connected' : '⚠️  Unavailable'}`);
      logger.info(`   WebSocket: ${serviceStatus.websocket ? '✅ Active' : '⚠️  Unavailable'}`);
      logger.info(`   Ollama: ${serviceStatus.ollama ? '✅ Connected' : '⚠️  Checking...'}`);
      logger.info('🔍 Monitor health at: http://localhost:' + PORT + '/api/health');
    }, 2000);

  } catch (error) {
    logger.error('💥 Critical server startup failure:', error);
    
    // If we have a critical error and the HTTP server hasn't started, exit
    if (!serviceStatus.httpServer) {
      logger.error('🛑 Cannot start HTTP server - exiting');
      process.exit(1);
    } else {
      logger.warn('⚠️  Server running with limited functionality due to startup errors');
    }
  }
}

// Expose service status for health checks
export function getServiceStatus() {
  return serviceStatus;
}

start();

// Enhanced graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`📤 ${signal} received, shutting down gracefully...`);
  
  try {
    // Close WebSocket connections gracefully
    io.close(() => {
      logger.info('✅ Socket.IO server closed');
    });

    // Close HTTP server
    await new Promise<void>((resolve) => {
      httpServer.close((err) => {
        if (err) {
          logger.error('Error closing HTTP server:', err);
        } else {
          logger.info('✅ HTTP server closed');
        }
        resolve();
      });
    });

    // Disconnect database
    await dbService.disconnect();
    
    logger.info('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions and rejections
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
