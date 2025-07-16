import { promises as fs } from 'fs';
import { dirname } from 'path';

/**
 * Ensure the config directory exists
 */
export async function ensureConfigDir(configPath: string = './mcp-config.json'): Promise<void> {
  const dir = dirname(configPath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}
