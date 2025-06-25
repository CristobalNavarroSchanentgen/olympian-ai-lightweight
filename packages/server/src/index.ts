import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

import { DatabaseService } from './services/DatabaseService';
import { WebSocketService } from './services/WebSocketService';
import { ConnectionScanner } from './services/ConnectionScanner';
import { OllamaHealthCheck } from './services/OllamaHealthCheck';
import { modelProgressiveLoader } from './services/ModelProgressiveLoader';
import { ArtifactService } from './services/ArtifactService'; // NEW: Artifact service

import apiRoutes from './api/routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();
const server = createServer(app);

// Environment variables
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// General middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found', 
    message: `Route ${req.originalUrl} not found` 
  });
});

// Initialize services
async function initializeServices() {
  try {
    console.log('🚀 [Server] Initializing services...');

    // Connect to database
    console.log('🔌 [Server] Connecting to MongoDB...');
    const db = DatabaseService.getInstance();
    await db.connect(MONGO_URI);
    
    // NEW: Initialize artifacts collection with schema validation
    console.log('🎨 [Server] Initializing artifacts collection...');
    await db.initializeArtifactsWithSchema();
    
    // NEW: Initialize artifact service
    console.log('🎨 [Server] Initializing artifact service...');
    const artifactService = ArtifactService.getInstance();
    
    // NEW: Check artifacts health on startup
    console.log('🏥 [Server] Checking artifacts health...');
    const artifactHealth = await artifactService.getArtifactsHealthCheck();
    if (!artifactHealth.issues || artifactHealth.issues.length === 0) {
      console.log('✅ [Server] Artifacts collection is healthy');
    } else {
      console.warn(`⚠️ [Server] Artifacts health issues detected:`, artifactHealth.issues);
    }

    // Initialize Socket.IO
    console.log('🔌 [Server] Initializing WebSocket service...');
    const io = new SocketIOServer(server, {
      cors: {
        origin: CLIENT_URL,
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    const wsService = WebSocketService.getInstance();
    wsService.initialize(io);

    // Initialize connection scanner
    console.log('🔍 [Server] Initializing connection scanner...');
    const scanner = ConnectionScanner.getInstance();
    await scanner.initialize();

    // Initialize Ollama health check
    console.log('🏥 [Server] Initializing Ollama health check...');
    const healthCheck = OllamaHealthCheck.getInstance();
    await healthCheck.initialize();

    // Start progressive model loading
    console.log('⚡ [Server] Starting progressive model loading...');
    modelProgressiveLoader.startProgressiveLoading().catch(error => {
      console.warn('⚠️ [Server] Progressive model loading failed to start:', error);
    });

    console.log('✅ [Server] All services initialized successfully');

  } catch (error) {
    console.error('❌ [Server] Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 [Server] Received ${signal}, starting graceful shutdown...`);
  
  try {
    // Stop accepting new connections
    server.close(() => {
      console.log('🔌 [Server] HTTP server closed');
    });

    // Disconnect from database
    const db = DatabaseService.getInstance();
    await db.disconnect();

    // Stop progressive loading
    modelProgressiveLoader.stopProgressiveLoading();

    console.log('✅ [Server] Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ [Server] Error during shutdown:', error);
    process.exit(1);
  }
}

// Signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ [Server] Unhandled Rejection at:', promise, 'reason:', reason);
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('❌ [Server] Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

// Start server
async function startServer() {
  try {
    await initializeServices();
    
    server.listen(PORT, () => {
      console.log(`\n🚀 [Server] Olympian AI Lightweight Server running on port ${PORT}`);
      console.log(`📡 [Server] WebSocket server initialized`);
      console.log(`🗄️ [Server] Database connected: ${MONGO_URI}`);
      console.log(`🎨 [Server] Artifacts collection initialized with schema validation`); // NEW
      console.log(`🌐 [Server] CORS enabled for: ${CLIENT_URL}`);
      console.log(`📊 [Server] API endpoints available at: http://localhost:${PORT}/api`);
      console.log(`🎨 [Server] Artifacts endpoints available at: http://localhost:${PORT}/api/artifacts`); // NEW
      console.log(`🏥 [Server] Health check: http://localhost:${PORT}/health`);
      console.log('\n📋 [Server] Available API endpoints:');
      console.log('   💬 Chat: /api/chat');
      console.log('   🔗 Connections: /api/connections');
      console.log('   ⚙️  Config: /api/config');
      console.log('   🤖 Models: /api/models');
      console.log('   📈 Progressive: /api/progressive');
      console.log('   🔧 MCP: /api/mcp');
      console.log('   🎨 Artifacts: /api/artifacts'); // NEW
      console.log('   🏥 Health: /api/health');
      console.log('\n✨ [Server] Ready to accept connections!');
    });
  } catch (error) {
    console.error('❌ [Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
