import { Router } from 'express';
import { MCPService } from '../services/MCPService';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

// Deployment detection
const SUBPROJECT = process.env.SUBPROJECT || '1';
const DEPLOYMENT_MODE = process.env.DEPLOYMENT_MODE || 'development';
const IS_SUBPROJECT_3 = SUBPROJECT === '3' || DEPLOYMENT_MODE === 'docker-multi-host';

// Modern MCP service instance (subproject 3 only)
let mcpService: MCPService | null = null;

// Validation schemas
const invokeToolSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown())
});

// Middleware to ensure modern MCP service is available
const requireModernMCP = (req: any, res: any, next: any) => {
  if (!IS_SUBPROJECT_3) {
    return res.status(501).json({
      success: false,
      error: 'Modern MCP API only available in subproject 3',
      message: 'This endpoint uses the modern npx-based MCP service which is only available in subproject 3 (multi-host deployment)',
      currentSubproject: SUBPROJECT,
      deploymentMode: DEPLOYMENT_MODE,
      recommendation: 'Use legacy MCP endpoints for subprojects 1 & 2',
      timestamp: new Date()
    });
  }

  if (!mcpService) {
    return res.status(503).json({
      success: false,
      error: 'Modern MCP service not available',
      message: 'MCP service is not initialized. This may happen if MCP_ENABLED=false or if initialization failed.',
      deploymentMode: DEPLOYMENT_MODE,
      timestamp: new Date()
    });
  }

  next();
};

// Middleware for legacy systems
const requireLegacyMCP = async (req: any, res: any, next: any) => {
  if (IS_SUBPROJECT_3) {
    return res.status(501).json({
      success: false,
      error: 'Legacy MCP API not supported in subproject 3',
      message: 'Subproject 3 uses modern npx-based MCP service. Legacy HTTP/SSE endpoints are not available.',
      currentSubproject: SUBPROJECT,
      deploymentMode: DEPLOYMENT_MODE,
      modernEndpoints: [
        'GET /api/mcp/status',
        'GET /api/mcp/servers',
        'GET /api/mcp/tools',
        'GET /api/mcp/prompts',
        'POST /api/mcp/tools/call'
      ],
      timestamp: new Date()
    });
  }

  // For legacy subprojects, dynamically import legacy services
  try {
    const { MCPClient } = await import('../services/MCPClient');
    req.legacyMcpClient = MCPClient.getInstance();
    next();
  } catch (error) {
    return res.status(503).json({
      success: false,
      error: 'Legacy MCP client not available',
      message: 'Failed to load legacy MCP client services',
      timestamp: new Date()
    });
  }
};

// Initialize modern MCP service reference
const initializeMCPServiceReference = () => {
  if (IS_SUBPROJECT_3) {
    // Get reference to the service initialized in index.ts
    // This is set by the main server initialization
    const serverModule = require('../index');
    mcpService = serverModule.mcpService || null;
    
    if (!mcpService) {
      logger.warn('⚠️ [MCP API] Modern MCP service reference not found, will try to get from global state');
    }
  }
};

// ====================
// Modern MCP API (Subproject 3)
// ====================

/**
 * Get MCP service status
 */
router.get('/status', (req, res) => {
  if (IS_SUBPROJECT_3) {
    if (!mcpService) {
      return res.status(503).json({
        success: false,
        error: 'Modern MCP service not initialized',
        subproject: SUBPROJECT,
        deploymentMode: DEPLOYMENT_MODE,
        timestamp: new Date()
      });
    }

    const serverStatus = mcpService.getServerStatus();
    const runningServers = serverStatus.filter(s => s.status === 'running').length;

    return res.json({
      success: true,
      data: {
        service: 'modern-mcp',
        subproject: SUBPROJECT,
        deploymentMode: DEPLOYMENT_MODE,
        transport: 'stdio-npx',
        architecture: 'npx-subprocess',
        servers: {
          total: serverStatus.length,
          running: runningServers,
          stopped: serverStatus.filter(s => s.status === 'stopped').length,
          error: serverStatus.filter(s => s.status === 'error').length
        },
        features: [
          'NPX-based server launching',
          'Stdio transport communication',
          'Modern simplified architecture',
          'No legacy HTTP/SSE dependencies'
        ]
      },
      timestamp: new Date()
    });
  } else {
    return res.json({
      success: true,
      data: {
        service: 'legacy-mcp',
        subproject: SUBPROJECT,
        deploymentMode: DEPLOYMENT_MODE,
        transport: 'http-sse',
        architecture: 'legacy-complex',
        message: 'Use legacy MCP endpoints for this subproject'
      },
      timestamp: new Date()
    });
  }
});

/**
 * Get all MCP servers (modern)
 */
router.get('/servers', requireModernMCP, (req, res) => {
  const serverStatus = mcpService!.getServerStatus();
  
  res.json({
    success: true,
    data: serverStatus.map(server => ({
      name: server.name,
      status: server.status,
      startTime: server.startTime,
      transport: 'stdio-npx',
      architecture: 'modern'
    })),
    timestamp: new Date()
  });
});

/**
 * Get all available tools from all servers (modern)
 */
router.get('/tools', requireModernMCP, async (req, res, next) => {
  try {
    const tools = await mcpService!.listTools();
    
    res.json({
      success: true,
      data: {
        tools,
        totalCount: tools.length,
        servers: [...new Set(tools.map(t => t.serverId))]
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all available prompts from all servers (modern)
 */
router.get('/prompts', requireModernMCP, async (req, res, next) => {
  try {
    const prompts = await mcpService!.listPrompts();
    
    res.json({
      success: true,
      data: {
        prompts,
        totalCount: prompts.length,
        servers: [...new Set(prompts.map(p => p.serverId))]
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Call a tool (modern)
 */
router.post('/tools/call', requireModernMCP, async (req, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    
    const result = await mcpService!.callTool(
      validated.serverId,
      validated.toolName,
      validated.arguments
    );
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid tool call request'));
    } else {
      next(error);
    }
  }
});

/**
 * Get tools for a specific server (modern)
 */
router.get('/servers/:serverId/tools', requireModernMCP, async (req, res, next) => {
  try {
    const allTools = await mcpService!.listTools();
    const serverTools = allTools.filter(tool => tool.serverId === req.params.serverId);
    
    if (serverTools.length === 0) {
      const serverStatus = mcpService!.getServerStatus();
      const serverExists = serverStatus.some(s => s.name === req.params.serverId);
      
      if (!serverExists) {
        throw new AppError(404, `Server '${req.params.serverId}' not found`);
      }
    }
    
    res.json({
      success: true,
      data: serverTools,
      serverId: req.params.serverId,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Legacy MCP API (Subprojects 1 & 2)
// ====================

/**
 * Legacy server list endpoint
 */
router.get('/legacy/servers', requireLegacyMCP, (req: any, res, next) => {
  try {
    const servers = req.legacyMcpClient.getServers();
    res.json({
      success: true,
      data: servers,
      architecture: 'legacy',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Legacy tool invocation endpoint
 */
router.post('/legacy/invoke', requireLegacyMCP, async (req: any, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    const result = await req.legacyMcpClient.invokeTool(validated);
    
    res.json({
      success: true,
      data: result,
      architecture: 'legacy',
      timestamp: new Date()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid invoke request'));
    } else {
      next(error);
    }
  }
});

// ====================
// Information Endpoints
// ====================

/**
 * Get deployment information
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      subproject: SUBPROJECT,
      deploymentMode: DEPLOYMENT_MODE,
      isModern: IS_SUBPROJECT_3,
      mcpArchitecture: IS_SUBPROJECT_3 ? 'modern-stdio-npx' : 'legacy-http-sse',
      availableEndpoints: IS_SUBPROJECT_3 ? {
        modern: [
          'GET /api/mcp/status',
          'GET /api/mcp/servers', 
          'GET /api/mcp/tools',
          'GET /api/mcp/prompts',
          'POST /api/mcp/tools/call',
          'GET /api/mcp/servers/:serverId/tools'
        ]
      } : {
        legacy: [
          'GET /api/mcp/legacy/servers',
          'POST /api/mcp/legacy/invoke'
        ]
      },
      features: IS_SUBPROJECT_3 ? [
        'NPX-based MCP server launching',
        'Stdio transport communication',
        'Simplified architecture',
        'No HTTP/SSE complexity',
        'Modern error handling'
      ] : [
        'HTTP/SSE transport',
        'Legacy service architecture',
        'Container-based servers'
      ]
    },
    timestamp: new Date()
  });
});

// ====================
// Health Check
// ====================

/**
 * Simple health check
 */
router.get('/health', (req, res) => {
  const isHealthy = IS_SUBPROJECT_3 ? (mcpService !== null) : true;
  
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'healthy' : 'unhealthy',
    service: IS_SUBPROJECT_3 ? 'modern-mcp' : 'legacy-mcp',
    subproject: SUBPROJECT,
    deploymentMode: DEPLOYMENT_MODE,
    timestamp: new Date()
  });
});

// ====================
// Error Handling
// ====================

/**
 * Catch-all for unsupported endpoints
 */
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'MCP endpoint not found',
    subproject: SUBPROJECT,
    deploymentMode: DEPLOYMENT_MODE,
    availableEndpoints: IS_SUBPROJECT_3 ? [
      'GET /api/mcp/status',
      'GET /api/mcp/info',
      'GET /api/mcp/health',
      'GET /api/mcp/servers',
      'GET /api/mcp/tools',
      'GET /api/mcp/prompts',
      'POST /api/mcp/tools/call'
    ] : [
      'GET /api/mcp/legacy/servers',
      'POST /api/mcp/legacy/invoke',
      'GET /api/mcp/info',
      'GET /api/mcp/health'
    ],
    timestamp: new Date()
  });
});

// Initialize on module load
initializeMCPServiceReference();

// Export function to set MCP service reference
export const setMCPServiceReference = (service: MCPService) => {
  mcpService = service;
  logger.info('✅ [MCP API] Modern MCP service reference set');
};

export { router as mcpRouter };
