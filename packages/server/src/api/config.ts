import { Router, Request, Response, NextFunction } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

function ensureConfigDir() {
  const configDir = path.join(process.cwd(), 'config');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

// Get all config templates
router.get('/templates', (_req: Request, res: Response, next: NextFunction) => {
  try {
    const templates = [
      { name: 'mcp-config.stdio.json', description: 'Standard I/O MCP configuration' },
      { name: 'mcp-config.multihost.json', description: 'Multi-host MCP configuration' }
    ];
    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

// Save config
router.post('/save', (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureConfigDir();
    const configPath = path.join(process.cwd(), 'mcp-config.json');
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: 'Configuration saved' });
  } catch (error) {
    next(error);
  }
});

// Get active config
router.get('/active', (_req: Request, res: Response, next: NextFunction) => {
  try {
    ensureConfigDir();
    const configPath = path.join(process.cwd(), 'mcp-config.json');
    
    if (!fs.existsSync(configPath)) {
      res.json({ success: false, message: 'No active configuration found' });
      return;
    }
    
    const content = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(content);
    res.json({ success: true, data: config });
  } catch (error) {
    next(error);
  }
});

// Load template
router.post('/load-template', (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureConfigDir();
    const { templateName } = req.body;
    const templatePath = path.join(process.cwd(), templateName);
    
    if (!fs.existsSync(templatePath)) {
      res.status(404).json({ success: false, message: 'Template not found' });
      return;
    }
    
    const content = fs.readFileSync(templatePath, 'utf8');
    const config = JSON.parse(content);
    
    // Save as active config
    const configPath = path.join(process.cwd(), 'mcp-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    res.json({ success: true, data: config, message: 'Template loaded and saved as active configuration' });
  } catch (error) {
    next(error);
  }
});

// List saved configs
router.get('/list', (_req: Request, res: Response, next: NextFunction) => {
  try {
    ensureConfigDir();
    const configDir = path.join(process.cwd(), 'config');
    
    if (!fs.existsSync(configDir)) {
      res.json({ success: true, data: [] });
      return;
    }
    
    const files = fs.readdirSync(configDir);
    const configs = files
      .filter((file: string) => file.endsWith('.json'))
      .map((filename: string) => {
        const filePath = path.join(configDir, filename);
        const stat = fs.statSync(filePath);
        return {
          filename,
          size: stat.size,
          modified: stat.mtime
        };
      })
      .sort((a: any, b: any) => b.modified.getTime() - a.modified.getTime());
    
    res.json({ success: true, data: configs });
  } catch (error) {
    next(error);
  }
});

// Save named config
router.post('/save-as/:name', (req: Request, res: Response, next: NextFunction) => {
  try {
    ensureConfigDir();
    const { name } = req.params;
    const configPath = path.join(process.cwd(), 'config', `${name}.json`);
    
    fs.writeFileSync(configPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true, message: `Configuration saved as ${name}` });
  } catch (error) {
    next(error);
  }
});

export { router };
