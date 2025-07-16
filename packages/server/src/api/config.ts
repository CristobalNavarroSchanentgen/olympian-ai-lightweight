import { DatabaseService } from '../services/DatabaseService';
import { AppError } from '../middleware/errorHandler';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';

const router = Router();
const db = DatabaseService.getInstance();

// Config paths
const CONFIG_DIR = path.join(os.homedir(), '.olympian-ai-lite');
const MCP_CONFIG_PATH = path.join(CONFIG_DIR, 'mcp_config.json');
const TOOL_OVERRIDES_PATH = path.join(CONFIG_DIR, 'tool_overrides.json');
const BACKUPS_DIR = path.join(CONFIG_DIR, 'backups');
// Get MCP config
router.get("/mcp", async (_req, res, next) => {
  try {
    let config = {};
    
    // Try to load the project mcp-config.multihost.json first
    const projectConfigPath = path.join(process.cwd(), "mcp-config.multihost.json");
    
    try {
      const data = await fs.readFile(projectConfigPath, "utf-8");
      config = JSON.parse(data);
    } catch (error) {
      // Fallback to user config directory
      await ensureConfigDir();
      try {
        const data = await fs.readFile(MCP_CONFIG_PATH, "utf-8");
        config = JSON.parse(data);
      } catch {
        // Return empty config if neither exists
        config = { mcpServers: {}, _meta: { version: "1.0" } };
      }
    }

    res.json({
      success: true,
      data: config,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Update MCP config
router.put('/mcp', async (req, res, next) => {
  try {
    await ensureConfigDir();
    
    // Validate the config
    const configSchema = z.object({
      servers: z.array(z.any()),
      version: z.string(),
    });
    
    const validated = configSchema.parse(req.body);
    
    // Create backup
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupPath = path.join(BACKUPS_DIR, `mcp_config_${timestamp}.json`);
    
    try {
      const currentConfig = await fs.readFile(MCP_CONFIG_PATH, 'utf-8');
      await fs.writeFile(backupPath, currentConfig);
    } catch {
      // No existing config to backup
    }
    
    // Save new config
    const newConfig = {
      ...validated,
      lastModified: new Date(),
    };
    
    await fs.writeFile(MCP_CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    
    res.json({
      success: true,
      data: newConfig,
      timestamp: new Date(),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, 'Invalid configuration', 'VALIDATION_ERROR'));
    } else {
      next(error);
    }
  }
});

// Get tool overrides
router.get('/tool-overrides', async (_req, res, next) => {
  try {
    await ensureConfigDir();
    
    let overrides = {};
    try {
      const data = await fs.readFile(TOOL_OVERRIDES_PATH, 'utf-8');
      overrides = JSON.parse(data);
    } catch {
      // File doesn't exist, return empty overrides
      overrides = {};
    }

    res.json({
      success: true,
      data: overrides,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Update tool overrides
router.put('/tool-overrides', async (req, res, next) => {
  try {
    await ensureConfigDir();
    
    // Create backup
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const backupPath = path.join(BACKUPS_DIR, `tool_overrides_${timestamp}.json`);
    
    try {
      const currentOverrides = await fs.readFile(TOOL_OVERRIDES_PATH, 'utf-8');
      await fs.writeFile(backupPath, currentOverrides);
    } catch {
      // No existing overrides to backup
    }
    
    // Save new overrides
    await fs.writeFile(TOOL_OVERRIDES_PATH, JSON.stringify(req.body, null, 2));
    
    res.json({
      success: true,
      data: req.body,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// List backups
router.get('/backups', async (_req, res, next) => {
  try {
    await ensureConfigDir();
    
    const files = await fs.readdir(BACKUPS_DIR);
    const backups = await Promise.all(
      files.map(async (filename) => {
        const stats = await fs.stat(path.join(BACKUPS_DIR, filename));
        return {
          filename,
          type: filename.includes('mcp_config') ? 'mcp' : 'tool_overrides',
          createdAt: stats.birthtime,
          size: stats.size,
        };
      })
    );
    
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    res.json({
      success: true,
      data: backups,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Restore from backup
router.post('/backups/:filename/restore', async (req, res, next) => {
  try {
    await ensureConfigDir();
    
    const backupPath = path.join(BACKUPS_DIR, req.params.filename);
    const backupData = await fs.readFile(backupPath, 'utf-8');
    
    if (req.params.filename.includes('mcp_config')) {
      await fs.writeFile(MCP_CONFIG_PATH, backupData);
    } else if (req.params.filename.includes('tool_overrides')) {
      await fs.writeFile(TOOL_OVERRIDES_PATH, backupData);
    } else {
      throw new AppError(400, 'Unknown backup type');
    }
    
    res.json({
      success: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

export { router as configRouter };