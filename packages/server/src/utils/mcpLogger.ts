import { logger } from './logger';
import * as fs from 'fs';
import * as path from 'path';

interface MCPEvent {
  timestamp: string;
  eventType: 'startup' | 'shutdown' | 'error' | 'restart' | 'health' | 'connection';
  serverId?: string;
  serverName?: string;
  message: string;
  details?: any;
  stackTrace?: string;
}

class MCPLogger {
  private static instance: MCPLogger;
  private logFile: string;
  private events: MCPEvent[] = [];
  private maxEvents = 1000;

  private constructor() {
    const logsDir = path.join(process.cwd(), 'logs', 'mcp');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const dateStr = new Date().toISOString().split('T')[0];
    this.logFile = path.join(logsDir, `mcp-events-\${dateStr}.log`);
  }

  static getInstance(): MCPLogger {
    if (!MCPLogger.instance) {
      MCPLogger.instance = new MCPLogger();
    }
    return MCPLogger.instance;
  }

  logEvent(event: Omit<MCPEvent, 'timestamp'>): void {
    const fullEvent: MCPEvent = {
      ...event,
      timestamp: new Date().toISOString()
    };
    
    // Add to memory buffer
    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
    
    // Write to file
    const logLine = JSON.stringify(fullEvent) + '\n';
    fs.appendFileSync(this.logFile, logLine);
    
    // Also log to console via main logger
    const logMessage = `[MCP:\${event.eventType}] \${event.serverName || 'System'}: \${event.message}`;
    
    switch(event.eventType) {
      case 'error':
        logger.error(logMessage, event.details);
        if (event.stackTrace) {
          logger.error('Stack trace:', event.stackTrace);
        }
        break;
      case 'shutdown':
        logger.warn(logMessage, event.details);
        break;
      default:
        logger.info(logMessage, event.details);
    }
  }

  getRecentEvents(count: number = 50): MCPEvent[] {
    return this.events.slice(-count);
  }

  generateReport(): string {
    const shutdowns = this.events.filter(e => e.eventType === 'shutdown' || e.eventType === 'restart');
    const errors = this.events.filter(e => e.eventType === 'error');
    const recent = this.getRecentEvents(20);
    
    return `=== MCP Health Report ===
Generated: \${new Date().toISOString()}
Summary:
- Total Events: \${this.events.length}
- Shutdowns: \${shutdowns.length}
- Errors: \${errors.length}`;
  }
}

export const mcpLogger = MCPLogger.getInstance();
