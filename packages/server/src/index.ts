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
import { ArtifactService } from './services/ArtifactService';
// NEW: Phase 3 Multi-host Services
import { multiHostInit } from './services/MultiHostInitializationService';
// NEW: MCP Services (Optional)
import { MCPConfigParser } from './services/MCPConfigParser';
import { MCPClient } from './services/MCPClient';

import apiRoutes from './api/routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();
const server = createServer(app);

// Environment variables
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// NEW: Multi-host environment variables
const ENABLE_MULTI_HOST = process.env.ENABLE_MULTI_HOST === 'true';
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'development';
const REDIS_URL = process.env.REDIS_URL;
const INSTANCE_ID = process.env.INSTANCE_ID || `server-${Date.now()}`;
const HOSTNAME = process.env.HOSTNAME || 'localhost';

// NEW: MCP Configuration - Default to optional in production
const MCP_OPTIONAL = process.env.MCP_OPTIONAL !== 'false'; // Default to true
const MCP_ENABLED = process.env.MCP_ENABLED !== 'false'; // Default to true

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
    version: process.env.npm_package_version || '1.0.0',
    instanceId: INSTANCE_ID,
    hostname: HOSTNAME,
    multiHost: ENABLE_MULTI_HOST,
    deploymentMode: DEPLOYMENT_MODE,
    mcpEnabled: MCP_ENABLED,
    mcpOptional: MCP_OPTIONAL
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

// NEW: Optional MCP services initialization with proper error handling
async function initializeMCPServices(): Promise<{ success: boolean; error?: string; serverCount?: number }> {
  if (!MCP_ENABLED) {
    console.log('ℹ️ [Server] MCP services disabled via configuration');
    return { success: true, serverCount: 0 };
  }

  try {
    console.log('🔧 [Server] Initializing MCP services (optional)...');
    
    // Parse MCP configuration
    const mcpParser = MCPConfigParser.getInstance();
    const mcpConfig = await mcpParser.parseConfiguration();
    
    const stats = mcpParser.getConfigurationStats();
    console.log(`📊 [Server] MCP configuration loaded:`, {
      totalEndpoints: stats.totalEndpoints,
      serverEndpoints: stats.serverEndpoints,
      discoveryChannels: stats.discoveryChannels,
      registries: stats.registries
    });
    
    // Initialize MCP client if we have servers configured
    if (stats.serverEndpoints > 0) {
      console.log('🚀 [Server] Initializing MCP clients...');
      
      const mcpServers = await mcpParser.createServersFromConfig();
      const mcpClient = MCPClient.getInstance();
      
      // Initialize the MCP client with the parsed servers
      await mcpClient.initialize(mcpServers);
      
      console.log(`✅ [Server] MCP services initialized with ${mcpServers.length} servers`);
      
      // Perform initial health check
      const healthStats = await mcpClient.getHealthStats();
      console.log(`📊 [Server] MCP Health: ${healthStats.healthy}/${healthStats.total} servers healthy`);
      
      if (healthStats.total > healthStats.healthy) {
        console.warn(`⚠️ [Server] Some MCP servers are unhealthy. Check logs for details.`);
      }

      return { success: true, serverCount: healthStats.total };
    } else {
      console.log('ℹ️ [Server] No MCP servers configured, skipping MCP client initialization');
      return { success: true, serverCount: 0 };
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown MCP initialization error';
    console.error('❌ [Server] MCP initialization failed:', errorMessage);
    
    if (MCP_OPTIONAL) {
      console.warn('⚠️ [Server] Continuing without MCP services (MCP_OPTIONAL=true)');
      return { success: false, error: errorMessage, serverCount: 0 };
    } else {
      // Re-throw if MCP is not optional
      throw error;
    }
  }
}

// Core services initialization - separated from MCP
async function initializeCoreServices(): Promise<void> {
  console.log('🚀 [Server] Initializing core services...');

  // Connect to database first - this is essential
  console.log('🔌 [Server] Connecting to MongoDB...');
  const db = DatabaseService.getInstance();
  await db.connect(MONGODB_URI);
  
  // Initialize artifacts collection with schema validation
  console.log('🎨 [Server] Initializing artifacts collection...');
  await db.initializeArtifactsWithSchema();
  
  // Initialize artifact service
  console.log('🎨 [Server] Initializing artifact service...');
  const artifactService = ArtifactService.getInstance();
  
  // Check artifacts health on startup
  console.log('🏥 [Server] Checking artifacts health...');
  const artifactHealth = await artifactService.getArtifactsHealthCheck();
  if (!artifactHealth.issues || artifactHealth.issues.length === 0) {
    console.log('✅ [Server] Artifacts collection is healthy');
  } else {
    console.warn(`⚠️ [Server] Artifacts health issues detected:`, artifactHealth.issues);
  }

  // Initialize connection scanner
  console.log('🔍 [Server] Initializing connection scanner...');
  const scanner = ConnectionScanner.getInstance();
  await scanner.initialize();

  // Initialize Ollama health check - this is essential for model access
  console.log('🏥 [Server] Initializing Ollama health check...');
  const healthCheck = OllamaHealthCheck.getInstance();
  await healthCheck.initialize();

  console.log('✅ [Server] Core services initialized successfully');
}

// Multi-host services initialization
async function initializeMultiHostServices(): Promise<{ success: boolean; error?: string }> {
  if (!ENABLE_MULTI_HOST) {
    console.log('ℹ️ [Server] Single-host mode - multi-host services disabled');
    return { success: true };
  }

  try {
    console.log('🚀 [Server] Initializing Phase 3 multi-host services...');
    
    if (!REDIS_URL) {
      console.warn('⚠️ [Server] REDIS_URL not configured, multi-host features may be limited');
    }
    
    await multiHostInit.initialize();
    
    const status = multiHostInit.getStatus();
    console.log('✅ [Server] Multi-host services status:', {
      coordination: status.services.coordination ? '✅' : '❌',
      performance: status.services.performance ? '✅' : '❌',
      monitoring: status.services.monitoring ? '✅' : '❌',
      database: status.services.database ? '✅' : '❌'
    });
    
    // Perform initial health check
    const healthStatus = await multiHostInit.getHealthStatus();
    console.log(`📊 [Server] Initial health score: ${healthStatus.overall.score}/100`);
    
    if (!healthStatus.overall.healthy) {
      console.warn('⚠️ [Server] Health issues detected on startup:', 
        healthStatus.monitoring?.issues?.slice(0, 3)?.map((i: any) => i.type) || 'Unknown');
    }

    return { success: true };
    
  } catch (multiHostError) {
    const errorMessage = multiHostError instanceof Error ? multiHostError.message : 'Unknown multi-host error';
    console.error('❌ [Server] Multi-host initialization failed:', errorMessage);
    
    // Check if Redis is optional
    const redisOptional = process.env.REDIS_OPTIONAL !== 'false'; // Default to optional
    if (redisOptional) {
      console.warn('⚠️ [Server] Continuing without multi-host features (REDIS_OPTIONAL=true)');
      return { success: false, error: errorMessage };
    } else {
      throw multiHostError;
    }
  }
}

// Initialize services with proper error handling and separation of concerns
async function initializeServices() {
  try {
    console.log('🚀 [Server] Initializing Olympian AI Lightweight Server...');
    console.log(`📍 [Server] Instance: ${INSTANCE_ID} on ${HOSTNAME}`);
    console.log(`🌐 [Server] Multi-host mode: ${ENABLE_MULTI_HOST ? 'ENABLED' : 'DISABLED'}`);
    console.log(`🚀 [Server] Deployment mode: ${DEPLOYMENT_MODE}`);
    console.log(`🔧 [Server] MCP services: ${MCP_ENABLED ? 'ENABLED' : 'DISABLED'} (optional: ${MCP_OPTIONAL})`);

    // Step 1: Initialize core services (database, artifacts, Ollama health)
    await initializeCoreServices();

    // Step 2: Initialize multi-host services (optional but important for subproject 3)
    const multiHostResult = await initializeMultiHostServices();
    
    // Step 3: Initialize MCP services (completely optional)
    const mcpResult = await initializeMCPServices();

    // Step 4: Initialize WebSocket and model loading (dependent on core services)
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

    // Step 5: Start progressive model loading (essential for AI functionality)
    console.log('⚡ [Server] Starting progressive model loading...');
    modelProgressiveLoader.startProgressiveLoading().catch(error => {
      console.warn('⚠️ [Server] Progressive model loading failed to start:', error);
    });

    console.log('✅ [Server] All services initialized successfully');
    
    // Log summary of service states
    console.log('\n📊 [Server] Service initialization summary:');
    console.log(`   ✅ Core services: Ready`);
    console.log(`   ${multiHostResult.success ? '✅' : '⚠️ '} Multi-host: ${multiHostResult.success ? 'Ready' : 'Limited (' + (multiHostResult.error || 'Unknown') + ')'}`);
    console.log(`   ${mcpResult.success ? '✅' : '⚠️ '} MCP services: ${mcpResult.success ? 'Ready (' + (mcpResult.serverCount || 0) + ' servers)' : 'Disabled (' + (mcpResult.error || 'Unknown') + ')'}`);

  } catch (error) {
    console.error('❌ [Server] Failed to initialize core services:', error);
    
    // Cleanup on failure
    try {
      await gracefulCleanup();
    } catch (cleanupError) {
      console.error('❌ [Server] Cleanup failed:', cleanupError);
    }
    
    process.exit(1);
  }
}

// NEW: Enhanced graceful cleanup with multi-host and MCP support
async function gracefulCleanup() {
  console.log('🧹 [Server] Starting cleanup...');
  
  try {
    // Cleanup MCP services first (optional service)
    if (MCP_ENABLED) {
      try {
        const mcpClient = MCPClient.getInstance();
        await mcpClient.cleanup();
        console.log('✅ [Server] MCP services cleaned up');
      } catch (mcpError) {
        console.warn('⚠️ [Server] MCP cleanup failed:', mcpError);
      }
    }

    // Cleanup multi-host services (important for subproject 3)
    if (ENABLE_MULTI_HOST) {
      console.log('🧹 [Server] Cleaning up multi-host services...');
      await multiHostInit.cleanup();
    }

    // Disconnect from database (essential)
    const db = DatabaseService.getInstance();
    await db.disconnect();

    // Stop progressive loading (essential)
    modelProgressiveLoader.stopProgressiveLoading();

    console.log('✅ [Server] Cleanup completed');
  } catch (error) {
    console.error('❌ [Server] Error during cleanup:', error);
    throw error;
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

    // Perform cleanup
    await gracefulCleanup();

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
      console.log(`🗄️ [Server] Database connected: ${MONGODB_URI}`);
      console.log(`🎨 [Server] Artifacts collection initialized with schema validation`);
      
      // NEW: Multi-host status
      if (ENABLE_MULTI_HOST) {
        console.log(`🌐 [Server] Multi-host coordination: ${REDIS_URL ? 'ENABLED' : 'LIMITED (no Redis)'}`);
      }
      
      // NEW: MCP status
      if (MCP_ENABLED) {
        try {
          const mcpClient = MCPClient.getInstance();
          const mcpStats = mcpClient.getHealthStats();
          console.log(`🔧 [Server] MCP services: ${mcpStats.healthy}/${mcpStats.total} servers healthy`);
        } catch (mcpError) {
          console.log('🔧 [Server] MCP services: Not initialized');
        }
      } else {
        console.log('🔧 [Server] MCP services: Disabled');
      }
      
      console.log(`🌐 [Server] CORS enabled for: ${CLIENT_URL}`);
      console.log(`📊 [Server] API endpoints available at: http://localhost:${PORT}/api`);
      console.log(`🏥 [Server] Health check: http://localhost:${PORT}/health`);
      
      console.log('\n📋 [Server] Available API endpoints:');
      console.log('   💬 Chat: /api/chat');
      console.log('   🔗 Connections: /api/connections');
      console.log('   ⚙️  Config: /api/config');
      console.log('   🤖 Models: /api/models');
      console.log('   📈 Progressive: /api/progressive');
      console.log('   🎨 Artifacts: /api/artifacts');
      console.log('   🏥 Health: /api/health');
      
      if (MCP_ENABLED) {
        console.log('   🔧 MCP: /api/mcp');
      }
      
      // NEW: Multi-host endpoints
      if (ENABLE_MULTI_HOST) {
        console.log('   🌐 Multi-host: /api/multihost');
        console.log('     - 🏥 /api/multihost/health (comprehensive health)');
        console.log('     - 📊 /api/multihost/monitoring/dashboard');
        console.log('     - ⚡ /api/multihost/performance/metrics');
        console.log('     - 🔗 /api/multihost/instances');
      }
      
      console.log('\n✨ [Server] Ready to accept connections!');
      
      // NEW: Log multi-host status for monitoring
      if (ENABLE_MULTI_HOST) {
        console.log(`\n📍 [Server] Multi-host instance ready:`)
        console.log(`   Instance ID: ${INSTANCE_ID}`);
        console.log(`   Hostname: ${HOSTNAME}`);
        console.log(`   Deployment Mode: ${DEPLOYMENT_MODE}`);
        console.log(`   Redis: ${REDIS_URL ? '✅ Connected' : '❌ Not configured'}`);
        console.log(`   Coordination: ${multiHostInit.getStatus().services.coordination ? '✅' : '❌'}`);
        console.log(`   Monitoring: ${multiHostInit.getStatus().services.monitoring ? '✅' : '❌'}`);
      }
    });
  } catch (error) {
    console.error('❌ [Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
