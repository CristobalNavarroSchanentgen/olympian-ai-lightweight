import { Router } from 'express';
import { MCPClientService } from '../services/MCPClient';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();
const mcpClient = new MCPClientService();

// Initialize MCP client service
mcpClient.initialize().catch(error => {
  console.error('Failed to initialize MCP client:', error);
});

// Validation schemas
const createServerSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(['stdio', 'http']),
  endpoint: z.string().optional(),
});

const invokeToolSchema = z.object({
  serverId: z.string(),
  toolName: z.string(),
  arguments: z.record(z.unknown()),
});

// Get all MCP servers
router.get('/servers', (_req, res) => {
  const servers = mcpClient.getServers();
  res.json({
    success: true,
    data: servers,
    timestamp: new Date(),
  });
});

// Get specific MCP server
router.get('/servers/:id', (req, res, next) => {
  try {
    const server = mcpClient.getServer(req.params.id);
    if (!server) {
      throw new AppError(404, 'MCP server not found');
    }

    res.json({
      success: true,
      data: server,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Add MCP server
router.post('/servers', async (req, res, next) => {
  try {
    const validated = createServerSchema.parse(req.body);
    const server = await mcpClient.addServer(validated);
    
    res.status(201).json({
      success: true,
      data: server,
      timestamp: new Date(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid server configuration', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

// Remove MCP server
router.delete('/servers/:id', async (req, res, next) => {
  try {
    await mcpClient.removeServer(req.params.id);
    res.json({
      success: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Start MCP server
router.post('/servers/:id/start', async (req, res, next) => {
  try {
    await mcpClient.startServer(req.params.id);
    res.json({
      success: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Stop MCP server
router.post('/servers/:id/stop', async (req, res, next) => {
  try {
    await mcpClient.stopServer(req.params.id);
    res.json({
      success: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// List tools for a server
router.get('/servers/:id/tools', async (req, res, next) => {
  try {
    const tools = await mcpClient.listTools(req.params.id);
    res.json({
      success: true,
      data: tools,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Invoke MCP tool
router.post('/invoke', async (req, res, next) => {
  try {
    const validated = invokeToolSchema.parse(req.body);
    const result = await mcpClient.invokeTool(validated);
    
    res.json({
      success: true,
      data: result,
      timestamp: new Date(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid invoke request', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

export { router as mcpRouter };