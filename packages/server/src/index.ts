import express from 'express';
console.log("[STARTUP] Backend starting at:", new Date().toISOString());
console.log("[STARTUP] Process PID:", process.pid);
import { processWatchdog } from "./utils/processWatchdog";
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
import { multiHostInit } from './services/MultiHostInitializationService';
import { MCPManager } from './services/MCPManager';
import { ToolNamespaceManager } from "./services/ToolNamespaceManager";
import { EnhancedOllamaStreamliner } from "./services/EnhancedOllamaStreamliner";
import { HILManager } from "./services/HILManager";
import { ToolSelectionService } from "./services/ToolSelectionService";

import apiRoutes from './api/routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

const app = express();
const server = createServer(app);

// Environment variables
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Multi-host environment variables
const ENABLE_MULTI_HOST = process.env.ENABLE_MULTI_HOST === 'true';
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'development';
const REDIS_URL = process.env.REDIS_URL;
const INSTANCE_ID = process.env.INSTANCE_ID || `server-${Date.now()}`;
const HOSTNAME = process.env.HOSTNAME || 'localhost';

// MCP Configuration
const MCP_ENABLED = process.env.MCP_ENABLED !== 'false';
const HIL_ENABLED = process.env.HIL_ENABLED !== "false";
const COMPATIBLE_MODELS = process.env.COMPATIBLE_MODELS || "qwen2.5,qwen3,llama3.1,llama3.2,mistral,deepseek-r1";

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
app.get('/health', async (req, res) => {
  const mcpStats = MCPManager.getInstance().getStats();
  
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    instanceId: INSTANCE_ID,
    hostname: HOSTNAME,
    multiHost: ENABLE_MULTI_HOST,
    deploymentMode: DEPLOYMENT_MODE,
    mcp: {
      enabled: MCP_ENABLED,
      ...mcpStats
    }
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
    console.log('🚀 [Server] Initializing Olympian AI with MCP Integration...');
    console.log('📍 [Server] Instance: ' + INSTANCE_ID + ' on ' + HOSTNAME);
    console.log('🌐 [Server] Multi-host mode: ' + (ENABLE_MULTI_HOST ? 'ENABLED' : 'DISABLED'));
    console.log('🚀 [Server] Deployment mode: ' + DEPLOYMENT_MODE);

    // Connect to database
    console.log('🔌 [Server] Connecting to MongoDB...');
    const db = DatabaseService.getInstance();
    await db.connect(MONGODB_URI);
    
    // Initialize artifacts
    console.log('🎨 [Server] Initializing artifacts...');
    await db.initializeArtifactsWithSchema();
    const artifactService = ArtifactService.getInstance();
    
    // Initialize connection scanner
    console.log('🔍 [Server] Initializing connection scanner...');
    const scanner = ConnectionScanner.getInstance();
    await scanner.initialize();

    // Initialize Ollama health check
    console.log('🏥 [Server] Initializing Ollama health check...');
    const healthCheck = OllamaHealthCheck.getInstance();
    await healthCheck.initialize();

    // Initialize multi-host services if enabled
    if (ENABLE_MULTI_HOST) {
      console.log('🚀 [Server] Initializing multi-host services...');
      console.log("[MULTI-HOST] Starting initialization at:", new Date().toISOString());
      await multiHostInit.initialize();
      console.log("[MULTI-HOST] Initialization complete at:", new Date().toISOString());
    }

    // Initialize MCP Architecture
    if (MCP_ENABLED) {
      console.log("🔧 [Server] Initializing MCP Architecture...");
      try {
        // 1. Initialize MCP Manager with servers
        const mcpManager = MCPManager.getInstance();
        await mcpManager.initialize();
        
        // 2. Initialize Tool Namespace Manager
        const namespaceManager = ToolNamespaceManager.getInstance();
        const tools = await mcpManager.listTools();
        
        // Register tools with namespacing
        for (const [serverId, serverData] of mcpManager.getServers()) {
          namespaceManager.registerTools(serverId, serverData.tools);
        }
        
        // 3. Initialize Tool Selection Service
        const toolSelection = ToolSelectionService.getInstance();
        const allTools = namespaceManager.getAllTools();
        toolSelection.initialize(allTools);
        
        // 4. Initialize HIL Manager
        const hilManager = HILManager.getInstance();
        hilManager.setEnabled(process.env.HIL_ENABLED === "true");
        
        // 5. Initialize Enhanced Ollama Streamliner
        const streamliner = new EnhancedOllamaStreamliner();
        
        const mcpStats = mcpManager.getStats();
        console.log("✅ [MCP] Initialized with " + mcpStats.totalTools + " tools from " + mcpStats.totalServers + " servers");
        console.log("🛡️ [HIL] Human-in-the-Loop: " + (hilManager.isEnabled() ? "ENABLED" : "DISABLED"));
      } catch (error) {
        console.error("❌ [Server] MCP initialization failed:", error);
        console.log("⚠️ [Server] Continuing without MCP");
      }
    }

    // Initialize WebSocket
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

    // Start progressive model loading
    console.log('⚡ [Server] Starting progressive model loading...');
    await modelProgressiveLoader.startProgressiveLoading();

    console.log('✅ [Server] All services initialized successfully');
    
    // Log initialization summary
    if (MCP_ENABLED) {
      const toolStats = ToolSelectionService.getInstance().getStats();
      console.log('📊 [Server] Initialization Summary:');
      console.log('   - MCP Servers: 3 (GitHub, AppleScript, Context7)');
      console.log('   - Total Tools: ' + toolStats.totalTools);
      console.log('   - Enabled Tools: ' + toolStats.enabledTools);
      console.log('   - HIL Protection: ' + (HILManager.getInstance().isEnabled() ? 'Active' : 'Disabled'));
      console.log('   - Compatible Models: ' + (process.env.COMPATIBLE_MODELS || 'qwen2.5,qwen3,llama3.1,llama3.2,mistral,deepseek-r1'));
    }
    
  } catch (error) {
    console.error('❌ [Server] Failed to initialize services:', error);
    await gracefulCleanup();
    process.exit(1);
  }
}


// Graceful cleanup
async function gracefulCleanup() {
  console.log('🧹 [Server] Starting cleanup...');
  
  try {
    // Cleanup MCP
    if (MCP_ENABLED) {
      const mcp = MCPManager.getInstance();
      console.log("[CLEANUP] Shutting down MCP from gracefulCleanup");
      await mcp.shutdown();
    }

    // Cleanup multi-host
    if (ENABLE_MULTI_HOST) {
      await multiHostInit.cleanup();
    }

    // Disconnect from database
    const db = DatabaseService.getInstance();
    await db.disconnect();

    // Stop progressive loading
    modelProgressiveLoader.stopProgressiveLoading();

    console.log('✅ [Server] Cleanup completed');
  } catch (error) {
    console.error('❌ [Server] Error during cleanup:', error);
  }
}

// Graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log("[SHUTDOWN DEBUG] Received signal:", signal);
  console.log("[SHUTDOWN DEBUG] Stack trace:", new Error().stack);
  const { mcpLogger } = await import("./utils/mcpLogger");
  mcpLogger.logEvent({
    eventType: "shutdown",
    message: `Graceful shutdown initiated by: ${signal}`,
    details: { 
      signal,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    }
  });
  console.log(`\n🛑 [Server] Received ${signal}, starting graceful shutdown...`);
  
  try {
    server.close(() => {
      console.log('🔌 [Server] HTTP server closed');
    });

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
      console.log(`🎨 [Server] Artifacts collection initialized`);
      
      if (ENABLE_MULTI_HOST) {
        console.log(`🌐 [Server] Multi-host coordination: ENABLED`);
      }
      
      if (MCP_ENABLED) {
        const mcpStats = MCPManager.getInstance().getStats();
        console.log(`🔧 [Server] MCP services: ${mcpStats.runningServers}/${mcpStats.totalServers} servers running`);
      }
      
      console.log(`🌐 [Server] CORS enabled for: ${CLIENT_URL}`);
      console.log(`📊 [Server] API endpoints available at: http://localhost:${PORT}/api`);
      console.log(`🏥 [Server] Health check: http://localhost:${PORT}/health`);
      
      console.log('\n✨ [Server] Ready to accept connections!');
    });
  } catch (error) {
    console.error('❌ [Server] Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
