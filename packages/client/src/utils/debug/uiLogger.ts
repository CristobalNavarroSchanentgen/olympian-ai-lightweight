/**
 * UI Logger - Comprehensive logging system for UI debugging
 * Provides structured logging with categorization, filtering, and export capabilities
 */

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string;
  data?: any;
  component?: string;
  stackTrace?: string;
}

export interface SessionInfo {
  sessionId: string;
  startTime: number;
  userAgent: string;
  url: string;
  totalLogs: number;
  errorCount: number;
  warningCount: number;
}

class UILogger {
  private logs: LogEntry[] = [];
  private sessionInfo: SessionInfo;
  private maxLogs = 1000; // Prevent memory bloat

  constructor() {
    this.sessionInfo = {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      totalLogs: 0,
      errorCount: 0,
      warningCount: 0,
    };
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private createLogEntry(
    level: LogEntry['level'],
    category: string,
    message: string,
    data?: any,
    component?: string
  ): LogEntry {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      level,
      category,
      message,
      data,
      component,
    };

    if (level === 'error') {
      entry.stackTrace = new Error().stack;
    }

    return entry;
  }

  private addLog(entry: LogEntry): void {
    this.logs.push(entry);
    this.sessionInfo.totalLogs++;

    if (entry.level === 'error') {
      this.sessionInfo.errorCount++;
    } else if (entry.level === 'warn') {
      this.sessionInfo.warningCount++;
    }

    // Maintain log size limit
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  debug(category: string, message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('debug', category, message, data, component);
    this.addLog(entry);
    console.debug(`[${category}] ${message}`, data);
  }

  info(category: string, message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('info', category, message, data, component);
    this.addLog(entry);
    console.info(`[${category}] ${message}`, data);
  }

  warn(category: string, message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('warn', category, message, data, component);
    this.addLog(entry);
    console.warn(`[${category}] ${message}`, data);
  }

  error(category: string, message: string, data?: any, component?: string): void {
    const entry = this.createLogEntry('error', category, message, data, component);
    this.addLog(entry);
    console.error(`[${category}] ${message}`, data);
  }

  componentRender(componentName: string, props?: any, renderCount?: number): void {
    this.debug('Component Render', `${componentName} rendered`, {
      props,
      renderCount,
    }, componentName);
  }

  componentError(componentName: string, error: Error, context?: any): void {
    this.error('Component Error', `Error in ${componentName}`, {
      error: error.message,
      stack: error.stack,
      context,
    }, componentName);
  }

  exportLogs(): LogEntry[] {
    return [...this.logs];
  }

  getSessionInfo(): SessionInfo {
    return { ...this.sessionInfo };
  }

  clearLogs(): void {
    this.logs = [];
    this.sessionInfo.totalLogs = 0;
    this.sessionInfo.errorCount = 0;
    this.sessionInfo.warningCount = 0;
  }

  filterLogs(level?: LogEntry['level'], component?: string, category?: string): LogEntry[] {
    return this.logs.filter(log => {
      if (level && log.level !== level) return false;
      if (component && log.component !== component) return false;
      if (category && log.category !== category) return false;
      return true;
    });
  }
}

// Export singleton instance
export const uiLogger = new UILogger();

// Make available globally for debugging
(window as any).uiLogger = uiLogger;
(window as any).exportUILogs = () => uiLogger.exportLogs();

export default UILogger;
