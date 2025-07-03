import { Router } from 'express';
import { MCPClientService } from '../services/MCPClient';
import { MCPClientStdio } from '../services/MCPClientStdio';
import { getDeploymentConfig } from '../config/deployment';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

// Detect deployment mode to determine MCP client strategy
const deploymentConfig = getDeploymentConfig();
const isSubproject3 = deploymentConfig.mode === 'docker-multi-host' || deploymentConfig.mode === 'multi-host';

// MCP client instance (deployment-aware)
let mcpClient: any = null;

if (isSubproject3) {
  // Subproject 3: Use stdio-based MCP client with npx subprocess execution
  logger.info('🔧 [MCP API] Subproject 3 detected - using MCPClientStdio with npx subprocess execution');
  mcpClient = MCPClientStdio.getInstance();
  
  // Initialize the stdio client
  mcpClient.initialize().catch((error: Error) => {
    logger.error('❌ [MCP API] Failed to initialize stdio MCP client:', error);
  });
} else {
  // Subprojects 1 & 2: Use legacy HTTP-based MCP client (deprecated)
  logger.warn('⚠️ [MCP API] Using legacy HTTP MCP client for subproject ' + deploymentConfig.mode);
  logger.warn('⚠️ [MCP API] Consider migrating to stdio transport for better performance');
  
  try {
    mcpClient = MCPClientService.getInstance();
    
    // Initialize the enhanced client
    mcpClient.initialize().catch((error: Error) => {
      logger.error('❌ [MCP API] Failed to initialize legacy MCP client:', error);
    });
  } catch (error) {
    logger.error('❌ [MCP API] Failed to create legacy MCP client:', error);
    mcpClient = null;
  }
}

// Middleware to check deployment compatibility for HTTP-oriented endpoints
const requireHttpCompatibility = (req: any, res: any, next: any) => {
  if (isSubproject3) {
    // HTTP-based MCP API is not compatible with stdio transport
    return res.status(501).json({
      success: false,
      error: 'HTTP-based MCP API is not supported in subproject 3',
      message: 'Subproject 3 uses stdio transport with npx subprocess execution. HTTP/SSE transport endpoints are not available.',
      deploymentMode: deploymentConfig.mode,
      transport: 'stdio',
      timestamp: new Date()
    });
  }
  next();
};

// Middleware to ensure MCP client is available
const requireMCPClient = (req: any, res: any, next: any) => {
  if (!mcpClient) {
    return res.status(503).json({
      success: false,
      error: 'MCP client not available',
      message: 'MCP client service is not initialized or not compatible with current deployment mode',
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  }
  next();
};

// Enhanced validation schemas for HTTP-only endpoints (disabled in subproject 3)
const createServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(), // Optional for HTTP servers, required for stdio
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(['http', 'streamable_http', 'sse', 'stdio']), // Include stdio for subproject 3
  endpoint: z.string().url().optional(), // Required for HTTP transports, not for stdio
  healthCheckInterval: z.number().optional(),
  maxRetries: z.number().optional(),
  timeout: z.number().optional(),
  priority: z.number().optional()
}).refine(
  (data) => {
    // For HTTP transports, endpoint is required
    if (['http', 'streamable_http', 'sse'].includes(data.transport)) {
      return !!data.endpoint;
    }
    // For stdio transport, command is required
    if (data.transport === 'stdio') {
      return !!data.command;
    }
    return true;
  },
  {
    message: "Endpoint URL is required for HTTP transports, command is required for stdio transport",
    path: ["endpoint", "command"]
  }
);

const invokeToolSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional() // Support for _meta field
});

const toolSelectionSchema = z.object({
  query: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  preferredServerId: z.string().optional()
});

// ====================
// Core Status Endpoints (Compatible with all subprojects)
// ====================

/**
 * Get deployment info and MCP status
 */
router.get('/status', requireMCPClient, (_req, res, next) => {
  try {
    const status = mcpClient.getStatus();
    res.json({
      success: true,
      data: {
        ...status,
        deploymentMode: deploymentConfig.mode,
        subproject: isSubproject3 ? '3' : deploymentConfig.mode,
        transport: isSubproject3 ? 'stdio' : 'http',
        architecture: isSubproject3 ? 'npx-subprocess' : 'http-based'
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Health check endpoint for load balancers
 */
router.get('/ping', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'MCP Client Service',
    deploymentMode: deploymentConfig.mode,
    subproject: isSubproject3 ? '3' : deploymentConfig.mode,
    transport: isSubproject3 ? 'stdio' : 'http',
    timestamp: new Date()
  });
});

// ====================
// Stdio-Compatible Endpoints (All subprojects)
// ====================

/**
 * Get all MCP servers with deployment-aware filtering
 */
router.get('/servers', requireMCPClient, (_req, res, next) => {
  try {
    const servers = mcpClient.getServers();
    
    // Filter servers based on deployment mode
    const compatibleServers = isSubproject3 
      ? servers.filter((server: any) => server.transport === 'stdio')
      : servers.filter((server: any) => 
          server.transport === 'http' || 
          server.transport === 'streamable_http' || 
          server.transport === 'sse'
        );
    
    res.json({
      success: true,
      data: compatibleServers,
      deploymentMode: deploymentConfig.mode,
      compatibleTransport: isSubproject3 ? 'stdio' : 'http',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get specific MCP server with detailed status
 */
router.get('/servers/:id', requireMCPClient, (req, res, next) => {
  try {
    const server = mcpClient.getServer(req.params.id);
    if (!server) {
      throw new AppError(404, 'MCP server not found');
    }

    // Validate transport compatibility
    if (isSubproject3 && server.transport !== 'stdio') {
      throw new AppError(400, `Server ${req.params.id} uses ${server.transport} transport, which is not supported in subproject 3`);
    }

    if (!isSubproject3 && server.transport === 'stdio') {
      throw new AppError(400, `Server ${req.params.id} uses stdio transport, which requires subproject 3`);
    }

    // Enhanced server information (stdio-compatible services)
    const enhancedServer = {
      ...server,
      healthStatus: server.status,
      isHealthy: server.status === 'running',
      deploymentCompatible: true
    };

    res.json({
      success: true,
      data: enhancedServer,
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * List tools for a server with caching (stdio-compatible)
 */
router.get('/servers/:id/tools', requireMCPClient, async (req, res, next) => {
  try {
    const tools = await mcpClient.listTools(req.params.id);
    res.json({
      success: true,
      data: tools,
      cached: tools.some((t: any) => t.cachedAt),
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Invoke MCP tool with enhanced error handling (stdio-compatible)
 */
router.post('/invoke', requireMCPClient, async (req, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    const result = await mcpClient.invokeTool(validated);
    
    res.json({
      success: true,
      data: result,
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid invoke request', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

/**
 * Start MCP server (stdio-compatible)
 */
router.post('/servers/:id/start', requireMCPClient, async (req, res, next) => {
  try {
    await mcpClient.startServer(req.params.id);
    res.json({
      success: true,
      message: 'MCP server started successfully',
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Stop MCP server (stdio-compatible)
 */
router.post('/servers/:id/stop', requireMCPClient, async (req, res, next) => {
  try {
    await mcpClient.stopServer(req.params.id);
    res.json({
      success: true,
      message: 'MCP server stopped successfully',
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// HTTP-Only Endpoints (Subprojects 1 & 2 only)
// ====================

/**
 * Add MCP server with transport validation
 */
router.post('/servers', requireMCPClient, requireHttpCompatibility, async (req, res, next) => {
  try {
    const validated = createServerSchema.parse(req.body);
    
    // Ensure HTTP-only transport for non-subproject-3
    if (!isSubproject3 && !['http', 'streamable_http', 'sse'].includes(validated.transport)) {
      throw new AppError(400, 'Only HTTP transports are supported in this deployment mode');
    }
    
    // For HTTP servers, provide default command since it's not needed
    const serverConfig = {
      ...validated,
      command: validated.command || '' // Provide default empty command for HTTP servers
    };
    
    const server = await mcpClient.addServer(serverConfig);
    
    res.status(201).json({
      success: true,
      data: server,
      message: 'MCP server added successfully',
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid server configuration', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

/**
 * Remove MCP server
 */
router.delete('/servers/:id', requireMCPClient, requireHttpCompatibility, async (req, res, next) => {
  try {
    await mcpClient.removeServer(req.params.id);
    res.json({
      success: true,
      message: 'MCP server removed successfully',
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Additional HTTP-Only Endpoints (Disabled for Subproject 3)
// ====================

// Health and monitoring endpoints - HTTP concepts don't apply to stdio
router.get('/health', requireHttpCompatibility, (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'legacy_http_mode',
      deploymentMode: deploymentConfig.mode,
      transportMode: 'http-only'
    },
    timestamp: new Date()
  });
});

// Cache management endpoints - handled differently in stdio mode
router.get('/cache/status', requireHttpCompatibility, (req, res) => {
  res.json({
    success: true,
    data: { status: 'http_cache_not_applicable' },
    timestamp: new Date()
  });
});

// Configuration endpoints - HTTP discovery not applicable in stdio mode
router.get('/config/discovery', requireHttpCompatibility, (req, res) => {
  res.json({
    success: true,
    data: { discoveryConfig: null, message: 'HTTP discovery not applicable in stdio mode' },
    timestamp: new Date()
  });
});

// Metrics endpoints - different metrics collection in stdio mode
router.get('/metrics', requireMCPClient, (req, res, next) => {
  try {
    const status = mcpClient.getStatus();
    
    res.json({
      success: true,
      data: {
        ...status.metrics,
        deploymentMode: deploymentConfig.mode,
        transport: isSubproject3 ? 'stdio' : 'http'
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Subproject 3 Information Endpoints
// ====================

/**
 * Get information about stdio transport and npx usage
 */
router.get('/stdio-info', (req, res) => {
  if (!isSubproject3) {
    return res.status(404).json({
      success: false,
      error: 'Stdio information only available in subproject 3',
      currentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  }

  res.json({
    success: true,
    data: {
      subproject: 3,
      transport: 'stdio',
      architecture: 'npx-subprocess-execution',
      deployment: deploymentConfig.mode,
      features: [
        'NPX-based MCP server launching',
        'Stdio transport communication',  
        'Child process management',
        'No HTTP/SSE endpoints required',
        'Self-contained execution within container'
      ],
      compatibility: {
        httpEndpoints: false,
        sseTransport: false,
        containerBasedServers: false,
        npxSubprocesses: true,
        stdioTransport: true
      }
    },
    timestamp: new Date()
  });
});

// ====================
// Error Handling & Fallbacks
// ====================

/**
 * Catch-all for unsupported endpoints in subproject 3
 */
router.use('*', (req, res) => {
  if (isSubproject3) {
    res.status(501).json({
      success: false,
      error: 'HTTP-based MCP endpoint not supported in subproject 3',
      message: 'Subproject 3 uses stdio transport with npx subprocess execution. Use stdio-compatible endpoints instead.',
      deploymentMode: deploymentConfig.mode,
      availableEndpoints: [
        'GET /mcp/status',
        'GET /mcp/ping', 
        'GET /mcp/servers',
        'GET /mcp/servers/:id',
        'GET /mcp/servers/:id/tools',
        'POST /mcp/invoke',
        'POST /mcp/servers/:id/start',
        'POST /mcp/servers/:id/stop',
        'GET /mcp/stdio-info',
        'GET /mcp/metrics'
      ],
      timestamp: new Date()
    });
  } else {
    res.status(404).json({
      success: false,
      error: 'MCP endpoint not found',
      deploymentMode: deploymentConfig.mode,
      timestamp: new Date()
    });
  }
});

export { router as mcpRouter };
