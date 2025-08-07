import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

class ProcessWatchdog {
  private static instance: ProcessWatchdog;
  private startTime: Date;
  private restartFile: string;
  
  private constructor() {
    this.startTime = new Date();
    const logsDir = path.join(process.cwd(), 'logs', 'mcp');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.restartFile = path.join(logsDir, 'restarts.log');
    
    this.logStartup();
  }
  
  static getInstance(): ProcessWatchdog {
    if (!ProcessWatchdog.instance) {
      ProcessWatchdog.instance = new ProcessWatchdog();
    }
    return ProcessWatchdog.instance;
  }
  
  private logStartup(): void {
    const lastRestart = this.getLastRestart();
    const timeSinceLastRestart = lastRestart 
      ? (this.startTime.getTime() - new Date(lastRestart.timestamp).getTime()) / 1000
      : null;
    
    const startupInfo = {
      timestamp: this.startTime.toISOString(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      timeSinceLastRestart,
      env: {
        NODE_ENV: process.env.NODE_ENV,
        MCP_ENABLED: process.env.MCP_ENABLED,
        DEPLOYMENT_MODE: process.env.DEPLOYMENT_MODE
      }
    };
    
    fs.appendFileSync(this.restartFile, JSON.stringify(startupInfo) + '\n');
    
    if (timeSinceLastRestart && timeSinceLastRestart < 60) {
      logger.warn(`⚠️ Rapid restart detected! Last restart was ${timeSinceLastRestart.toFixed(1)}s ago`);
    }
  }
  
  private getLastRestart(): any {
    try {
      if (fs.existsSync(this.restartFile)) {
        const lines = fs.readFileSync(this.restartFile, 'utf-8').split('\n').filter(l => l);
        if (lines.length > 0) {
          return JSON.parse(lines[lines.length - 1]);
        }
      }
    } catch (error) {
      logger.error('Error reading restart log:', error);
    }
    return null;
  }
  
  getRestartHistory(limit: number = 10): any[] {
    try {
      if (fs.existsSync(this.restartFile)) {
        const lines = fs.readFileSync(this.restartFile, 'utf-8').split('\n').filter(l => l);
        return lines.slice(-limit).map(l => JSON.parse(l));
      }
    } catch (error) {
      logger.error('Error reading restart history:', error);
    }
    return [];
  }
  
  getUptime(): number {
    return (Date.now() - this.startTime.getTime()) / 1000;
  }
}

export const processWatchdog = ProcessWatchdog.getInstance();
