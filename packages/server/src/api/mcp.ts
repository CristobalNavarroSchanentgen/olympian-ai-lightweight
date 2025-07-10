import { Router } from 'express';
import { MCPManager } from '../services/MCPManager';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';
import { logger } from '../utils/logger';

const router = Router();

// Get MCP manager instance
const mcp = MCPManager.getInstance();

// Validation schemas
const invokeToolSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),  
  arguments: z.record(z.unknown()).optional()
});

/**
 * Get MCP service status
 */
router.get('/status', (req, res) => {
  const stats = mcp.getStats();
  const servers = mcp.getServers();
  
  res.json({
    success: true,
    data: {
      initialized: true,
      stats,
      servers: servers.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        transport: s.transport
      }))
    }
  });
});

/**
 * Get all MCP servers
 */
router.get('/servers', (req, res) => {
  const servers = mcp.getServers();
  
  res.json({
    success: true,
    data: servers
  });
});

/**
 * Get all available tools
 */
router.get('/tools', async (req, res, next) => {
  try {
    const tools = await mcp.listTools();
    
    res.json({
      success: true,
      data: {
        tools,
        count: tools.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Call a tool
 */
router.post('/tools/call', async (req, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    
    const result = await mcp.callTool(
      validated.serverId,
      validated.toolName,
      validated.arguments || {}
    );
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid request'));
    } else {
      next(error);
    }
  }
});

/**
 * Invoke tool (legacy format)
 */
router.post('/invoke', async (req, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    
    const result = await mcp.invokeTool({
      serverId: validated.serverId,
      toolName: validated.toolName,
      arguments: validated.arguments || {}
    });
    
    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid request'));
    } else {
      next(error);
    }
  }
});

/**
 * Add a new server
 */
router.post('/servers', async (req, res, next) => {
  try {
    const { name, command, args, env, optional } = req.body;
    
    if (!name || !command) {
      throw new AppError(400, 'Name and command are required');
    }
    
    await mcp.addServer({
      id: `custom_${Date.now()}`,
      name,
      transport: 'stdio',
      command,
      args: args || [],
      env: env || {},
      optional: optional !== false,
      status: 'stopped'
    });
    
    res.json({
      success: true,
      message: 'Server added successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove a server
 */
router.delete('/servers/:serverId', async (req, res, next) => {
  try {
    await mcp.removeServer(req.params.serverId);
    
    res.json({
      success: true,
      message: 'Server removed successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Health check
 */
router.get('/health', (req, res) => {
  const stats = mcp.getStats();
  const healthy = stats.running > 0;
  
  res.status(healthy ? 200 : 503).json({
    success: healthy,
    status: healthy ? 'healthy' : 'unhealthy',
    stats
  });
});

export { router as mcpRouter };

// Add debug endpoints for MCPStreamliner
router.get('/debug/tool-calls', async (req, res) => {
  try {
    const mcpStreamliner = require('../services/MCPStreamliner').MCPStreamliner.getInstance();
    const limit = parseInt(req.query.limit as string) || 10;
    
    const recentCalls = mcpStreamliner.getRecentCalls(limit);
    
    res.json({
      success: true,
      data: {
        recentCalls,
        totalCalls: recentCalls.length
      }
    });
  } catch (error) {
    logger.error('Failed to get tool call debug info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tool call debug information'
    });
  }
});

router.get('/debug/tool-registry', async (req, res) => {
  try {
    const mcpStreamliner = require('../services/MCPStreamliner').MCPStreamliner.getInstance();
    
    const registry = Array.from(mcpStreamliner.getToolRegistry().entries());
    
    res.json({
      success: true,
      data: {
        tools: registry.map(([name, info]) => ({
          name,
          ...info
        })),
        totalTools: registry.length
      }
    });
  } catch (error) {
    logger.error('Failed to get tool registry:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tool registry'
    });
  }
});
