import { Router } from 'express';
import { MCPClientService } from '../services/MCPClient';
import { MCPConfigParser } from '../services/MCPConfigParser';
import { MCPHealthChecker } from '../services/MCPHealthChecker';
import { MCPToolCache } from '../services/MCPToolCache';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// Initialize enhanced MCP client service using singleton pattern
const mcpClient = MCPClientService.getInstance();

// Initialize the enhanced client
mcpClient.initialize().catch((error: Error) => {
  console.error('❌ [MCP API] Failed to initialize enhanced MCP client:', error);
});

// Enhanced validation schemas for HTTP-only multihost deployment
const createServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().optional(), // Optional for HTTP servers
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(['http', 'streamable_http', 'sse']), // HTTP-only transports
  endpoint: z.string().url(), // Required for HTTP transports
  healthCheckInterval: z.number().optional(),
  maxRetries: z.number().optional(),
  timeout: z.number().optional(),
  priority: z.number().optional()
}).refine(
  (data) => {
    // Ensure endpoint is provided for HTTP transports
    return !!data.endpoint;
  },
  {
    message: "Endpoint URL is required for HTTP transports",
    path: ["endpoint"]
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
// Core MCP Endpoints
// ====================

/**
 * Get comprehensive MCP status
 * Following guideline: "get comprehensive status including health, cache, metrics"
 */
router.get('/status', (_req, res, next) => {
  try {
    const status = mcpClient.getStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all MCP servers with enhanced status
 */
router.get('/servers', (_req, res, next) => {
  try {
    const servers = mcpClient.getServers();
    
    // Filter to show only HTTP servers in multihost mode
    const httpServers = servers.filter(server => 
      server.transport === 'http' || 
      server.transport === 'streamable_http' || 
      server.transport === 'sse'
    );
    
    res.json({
      success: true,
      data: httpServers,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get specific MCP server with detailed status
 */
router.get('/servers/:id', (req, res, next) => {
  try {
    const server = mcpClient.getServer(req.params.id);
    if (!server) {
      throw new AppError(404, 'MCP server not found');
    }

    // Get additional status information
    const healthChecker = MCPHealthChecker.getInstance();
    const toolCache = MCPToolCache.getInstance();
    
    const healthStatus = healthChecker.getServerHealth(req.params.id);
    const serverTools = toolCache.getCachedTools(req.params.id) || [];

    const enhancedServer = {
      ...server,
      healthStatus,
      toolCount: serverTools.length,
      lastHealthCheck: healthStatus?.timestamp,
      isHealthy: healthStatus?.status === 'healthy'
    };

    res.json({
      success: true,
      data: enhancedServer,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Add MCP server with HTTP-only validation
 */
router.post('/servers', async (req, res, next) => {
  try {
    const validated = createServerSchema.parse(req.body);
    
    // Ensure HTTP-only transport
    if (!['http', 'streamable_http', 'sse'].includes(validated.transport)) {
      throw new AppError(400, 'Only HTTP transports are supported in multihost deployment');
    }
    
    // For HTTP servers in multihost deployment, provide default command since it's not needed
    const serverConfig = {
      ...validated,
      command: validated.command || '' // Provide default empty command for HTTP servers
    };
    
    const server = await mcpClient.addServer(serverConfig);
    
    res.status(201).json({
      success: true,
      data: server,
      message: 'MCP server added successfully',
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
router.delete('/servers/:id', async (req, res, next) => {
  try {
    await mcpClient.removeServer(req.params.id);
    res.json({
      success: true,
      message: 'MCP server removed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Start MCP server
 */
router.post('/servers/:id/start', async (req, res, next) => {
  try {
    await mcpClient.startServer(req.params.id);
    res.json({
      success: true,
      message: 'MCP server started successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Stop MCP server
 */
router.post('/servers/:id/stop', async (req, res, next) => {
  try {
    await mcpClient.stopServer(req.params.id);
    res.json({
      success: true,
      message: 'MCP server stopped successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Tool Management
// ====================

/**
 * List tools for a server with caching
 * Following guideline: "efficient tool access with caching"
 */
router.get('/servers/:id/tools', async (req, res, next) => {
  try {
    const tools = await mcpClient.listTools(req.params.id);
    res.json({
      success: true,
      data: tools,
      cached: tools.some((t: any) => t.cachedAt),
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all available tools across servers
 */
router.get('/tools', async (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    const allTools = toolCache.getAllCachedTools();
    
    res.json({
      success: true,
      data: allTools,
      totalTools: allTools.length,
      serverCount: new Set(allTools.map((t: any) => t.serverId)).size,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Search tools by name or pattern
 */
router.get('/tools/search', (req, res, next) => {
  try {
    const { q: query, pattern } = req.query;
    
    if (!query && !pattern) {
      throw new AppError(400, 'Query parameter "q" or "pattern" is required');
    }

    const toolCache = MCPToolCache.getInstance();
    const tools = pattern 
      ? toolCache.findToolsByPattern(pattern as string)
      : toolCache.findToolsByName(query as string);

    res.json({
      success: true,
      data: tools,
      query: query || pattern,
      resultCount: tools.length,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get best tool for a specific name
 * Following guideline: "tool selection considering server health and priority"
 */
router.get('/tools/:name/best', (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    const healthChecker = MCPHealthChecker.getInstance();
    
    const healthyServerIds = new Set(
      healthChecker.getHealthyServers().map((s: any) => s.id)
    );
    
    const bestTool = toolCache.getBestToolForName(req.params.name, healthyServerIds);
    
    if (!bestTool) {
      throw new AppError(404, `Tool "${req.params.name}" not found`);
    }

    res.json({
      success: true,
      data: bestTool,
      alternatives: toolCache.findToolsByName(req.params.name).filter((t: any) => t.serverId !== bestTool.serverId),
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Invoke MCP tool with enhanced error handling and fallback
 * Following guidelines: "metadata field support", "fallback handling", "error recovery"
 */
router.post('/invoke', async (req, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    const result = await mcpClient.invokeTool(validated);
    
    res.json({
      success: true,
      data: result,
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
 * Smart tool selection endpoint
 * Following guideline: "LLM-based tool selection with confidence scoring"
 */
router.post('/tools/select', async (req, res, next) => {
  try {
    const validated = toolSelectionSchema.parse(req.body);
    
    // For now, implement basic tool selection
    // This could be enhanced with LLM-based selection in the future
    const toolCache = MCPToolCache.getInstance();
    const healthChecker = MCPHealthChecker.getInstance();
    
    const allTools = toolCache.getAllCachedTools();
    const healthyServerIds = new Set(healthChecker.getHealthyServers().map((s: any) => s.id));
    
    // Filter tools by healthy servers
    const availableTools = allTools.filter((tool: any) => 
      healthyServerIds.has(tool.serverId)
    );

    // Simple keyword matching for tool selection
    const query = validated.query.toLowerCase();
    const matchedTools = availableTools.filter((tool: any) => 
      tool.name.toLowerCase().includes(query) || 
      tool.description.toLowerCase().includes(query)
    );

    if (matchedTools.length === 0) {
      throw new AppError(404, `No tools found matching query: "${validated.query}"`);
    }

    // Sort by usage count and return the best match
    matchedTools.sort((a: any, b: any) => (b.usageCount || 0) - (a.usageCount || 0));
    const selectedTool = matchedTools[0];

    res.json({
      success: true,
      data: {
        selectedTool,
        confidence: 0.8, // Simple confidence score
        reasoning: `Selected "${selectedTool.name}" based on keyword match and usage statistics`,
        alternativeTools: matchedTools.slice(1, 4) // Top 3 alternatives
      },
      timestamp: new Date()
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid tool selection request', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

// ====================
// Health and Monitoring
// ====================

/**
 * Get comprehensive health status
 * Following guideline: "health checks with server status tracking"
 */
router.get('/health', (req, res, next) => {
  try {
    const healthChecker = MCPHealthChecker.getInstance();
    const healthStatus = healthChecker.getOverallHealthStatus();
    const stats = healthChecker.getHealthCheckStats();

    res.json({
      success: true,
      data: {
        ...healthStatus,
        stats,
        deploymentMode: 'multihost',
        transportMode: 'http-only'
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Force health check for specific server
 */
router.post('/servers/:id/health-check', async (req, res, next) => {
  try {
    const healthChecker = MCPHealthChecker.getInstance();
    const healthCheck = await healthChecker.forceHealthCheck(req.params.id);
    
    res.json({
      success: true,
      data: healthCheck,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get health status for specific server
 */
router.get('/servers/:id/health', (req, res, next) => {
  try {
    const healthChecker = MCPHealthChecker.getInstance();
    const healthCheck = healthChecker.getServerHealth(req.params.id);
    
    if (!healthCheck) {
      throw new AppError(404, 'Health status not found for server');
    }

    res.json({
      success: true,
      data: healthCheck,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Cache Management
// ====================

/**
 * Get cache status and statistics
 * Following guideline: "cache hit/miss tracking and optimization"
 */
router.get('/cache/status', (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    const cacheStatus = toolCache.getCacheStatus();
    
    res.json({
      success: true,
      data: cacheStatus,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Refresh cache for specific server
 */
router.post('/servers/:id/cache/refresh', async (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    const tools = await toolCache.refreshServerCache(req.params.id);
    
    res.json({
      success: true,
      data: {
        serverId: req.params.id,
        toolCount: tools.length,
        refreshedAt: new Date()
      },
      message: 'Cache refreshed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Invalidate cache for specific server
 */
router.delete('/servers/:id/cache', (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    toolCache.invalidateServerCache(req.params.id);
    
    res.json({
      success: true,
      message: 'Cache invalidated successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Clear all caches
 */
router.delete('/cache', (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    toolCache.invalidateAllCaches();
    
    res.json({
      success: true,
      message: 'All caches cleared successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Reset cache statistics
 */
router.post('/cache/reset-stats', (req, res, next) => {
  try {
    const toolCache = MCPToolCache.getInstance();
    toolCache.resetCacheStats();
    
    res.json({
      success: true,
      message: 'Cache statistics reset successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Configuration Management
// ====================

/**
 * Get configuration discovery status
 * Following guideline: "configuration endpoint extraction and validation"
 */
router.get('/config/discovery', (req, res, next) => {
  try {
    const configParser = MCPConfigParser.getInstance();
    const discoveryConfig = configParser.getDiscoveryConfig();
    const stats = configParser.getConfigurationStats();
    const validationResults = configParser.getHttpOnlyValidationResults();
    
    res.json({
      success: true,
      data: {
        discoveryConfig,
        stats,
        validationResults,
        needsRefresh: configParser.needsRefresh()
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Refresh configuration discovery
 */
router.post('/config/refresh', async (req, res, next) => {
  try {
    const configParser = MCPConfigParser.getInstance();
    const discoveryConfig = await configParser.parseConfiguration();
    
    res.json({
      success: true,
      data: discoveryConfig,
      message: 'Configuration refreshed successfully',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Validate configuration endpoint
 */
router.post('/config/validate', async (req, res, next) => {
  try {
    const { url, type = 'server', timeout = 5000 } = req.body;
    
    if (!url) {
      throw new AppError(400, 'URL is required for validation');
    }

    // Validate HTTP URL format
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new AppError(400, 'Only HTTP/HTTPS URLs are supported in multihost deployment');
      }
    } catch {
      throw new AppError(400, 'Invalid URL format');
    }

    const configParser = MCPConfigParser.getInstance();
    const isValid = await configParser.validateEndpoint({
      url,
      type: type as any,
      timeout
    });

    res.json({
      success: true,
      data: {
        url,
        isValid,
        validatedAt: new Date()
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Metrics and Analytics
// ====================

/**
 * Get comprehensive metrics
 * Following guideline: "metrics collection and monitoring"
 */
router.get('/metrics', (req, res, next) => {
  try {
    const status = mcpClient.getStatus();
    
    res.json({
      success: true,
      data: {
        ...status.metrics,
        deploymentMode: 'multihost',
        transportMode: 'http-only'
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get metrics for specific server
 */
router.get('/servers/:id/metrics', (req, res, next) => {
  try {
    const status = mcpClient.getStatus();
    const serverMetrics = status.metrics.serverMetrics[req.params.id];
    
    if (!serverMetrics) {
      throw new AppError(404, 'Metrics not found for server');
    }

    res.json({
      success: true,
      data: {
        serverId: req.params.id,
        ...serverMetrics
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Events and Monitoring
// ====================

/**
 * Get recent MCP events (simplified endpoint)
 */
router.get('/events', (req, res, next) => {
  try {
    // This would require implementing event storage
    // For now, return a simple response
    res.json({
      success: true,
      data: [],
      message: 'Event history not yet implemented',
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Diagnostic Endpoints
// ====================

/**
 * Run comprehensive diagnostics
 */
router.post('/diagnostics', async (req, res, next) => {
  try {
    const healthChecker = MCPHealthChecker.getInstance();
    const toolCache = MCPToolCache.getInstance();
    const configParser = MCPConfigParser.getInstance();

    // Run diagnostics
    const diagnostics = {
      health: healthChecker.getOverallHealthStatus(),
      cache: toolCache.getCacheStatus(),
      config: configParser.getConfigurationStats(),
      validationResults: configParser.getHttpOnlyValidationResults(),
      servers: mcpClient.getServers()
        .filter((server: any) => 
          server.transport === 'http' || 
          server.transport === 'streamable_http' || 
          server.transport === 'sse'
        )
        .map((server: any) => ({
          id: server.id,
          name: server.name,
          status: server.status,
          transport: server.transport,
          endpoint: server.endpoint,
          lastError: server.lastError
        })),
      deploymentMode: 'multihost',
      transportMode: 'http-only'
    };

    res.json({
      success: true,
      data: diagnostics,
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// ====================
// Error Handling
// ====================

/**
 * Health check endpoint for load balancers
 */
router.get('/ping', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'MCP Client Service',
    deploymentMode: 'multihost',
    transportMode: 'http-only',
    timestamp: new Date()
  });
});

export { router as mcpRouter };
