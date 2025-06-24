/**
 * Crash Analyzer - Comprehensive crash detection and analysis system
 * Tracks errors, performance issues, and system state for debugging
 */

import { uiLogger, LogEntry } from './uiLogger';

export interface CrashData {
  id: string;
  timestamp: number;
  type: 'javascript_error' | 'unhandled_rejection' | 'component_error' | 'performance_issue';
  message: string;
  stack?: string;
  component?: string;
  props?: any;
  userAgent: string;
  url: string;
  sessionId: string;
  context?: any;
}

export interface CrashReport {
  summary: {
    totalCrashes: number;
    uniqueErrors: number;
    mostFrequentError: string;
    crashRate: number;
    sessionDuration: number;
  };
  crashes: CrashData[];
  patterns: {
    byComponent: Record<string, number>;
    byType: Record<string, number>;
    byHour: Record<number, number>;
  };
  performance: {
    longTasks: number;
    layoutShifts: number;
    memoryUsage?: number;
  };
}

class CrashAnalyzer {
  private crashes: CrashData[] = [];
  private sessionStart: number;
  private sessionId: string;
  private maxCrashes = 500; // Prevent memory bloat

  constructor() {
    this.sessionStart = Date.now();
    this.sessionId = this.generateSessionId();
    this.setupErrorListeners();
  }

  private generateSessionId(): string {
    return `crash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupErrorListeners(): void {
    // Global error handler
    window.addEventListener('error', (event) => {
      this.recordCrash({
        type: 'javascript_error',
        message: event.message,
        stack: event.error?.stack,
        context: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });

    // Unhandled promise rejection handler
    window.addEventListener('unhandledrejection', (event) => {
      this.recordCrash({
        type: 'unhandled_rejection',
        message: `Unhandled Promise Rejection: ${event.reason}`,
        stack: event.reason?.stack,
        context: {
          reason: event.reason,
        },
      });
    });
  }

  recordCrash(crashData: Partial<CrashData>): void {
    const crash: CrashData = {
      id: `crash-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type: crashData.type || 'javascript_error',
      message: crashData.message || 'Unknown error',
      stack: crashData.stack,
      component: crashData.component,
      props: crashData.props,
      userAgent: navigator.userAgent,
      url: window.location.href,
      sessionId: this.sessionId,
      context: crashData.context,
    };

    this.crashes.push(crash);

    // Maintain crash size limit
    if (this.crashes.length > this.maxCrashes) {
      this.crashes = this.crashes.slice(-this.maxCrashes);
    }

    // Log to UI logger as well
    uiLogger.error('Crash Detected', crash.message, {
      crashId: crash.id,
      type: crash.type,
      component: crash.component,
      stack: crash.stack,
    });
  }

  recordComponentError(componentName: string, error: Error, props?: any): void {
    this.recordCrash({
      type: 'component_error',
      message: error.message,
      stack: error.stack,
      component: componentName,
      props,
      context: {
        componentName,
        errorName: error.name,
      },
    });
  }

  recordPerformanceIssue(type: string, details: any): void {
    this.recordCrash({
      type: 'performance_issue',
      message: `Performance issue: ${type}`,
      context: {
        performanceType: type,
        details,
      },
    });
  }

  generateCrashReport(): CrashReport {
    const sessionDuration = Date.now() - this.sessionStart;
    const totalCrashes = this.crashes.length;
    
    // Group by error message to find unique errors
    const errorGroups = this.crashes.reduce((acc, crash) => {
      acc[crash.message] = (acc[crash.message] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const uniqueErrors = Object.keys(errorGroups).length;
    const mostFrequentError = Object.entries(errorGroups)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || 'None';

    // Pattern analysis
    const byComponent = this.crashes.reduce((acc, crash) => {
      if (crash.component) {
        acc[crash.component] = (acc[crash.component] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const byType = this.crashes.reduce((acc, crash) => {
      acc[crash.type] = (acc[crash.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byHour = this.crashes.reduce((acc, crash) => {
      const hour = new Date(crash.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Performance metrics
    const performanceCrashes = this.crashes.filter(c => c.type === 'performance_issue');
    const longTasks = performanceCrashes.filter(c => 
      c.context?.performanceType === 'long_task'
    ).length;
    const layoutShifts = performanceCrashes.filter(c => 
      c.context?.performanceType === 'layout_shift'
    ).length;

    let memoryUsage: number | undefined;
    if ('memory' in performance) {
      memoryUsage = (performance as any).memory.usedJSHeapSize;
    }

    return {
      summary: {
        totalCrashes,
        uniqueErrors,
        mostFrequentError,
        crashRate: sessionDuration > 0 ? (totalCrashes / sessionDuration) * 60000 : 0, // crashes per minute
        sessionDuration,
      },
      crashes: [...this.crashes],
      patterns: {
        byComponent,
        byType,
        byHour,
      },
      performance: {
        longTasks,
        layoutShifts,
        memoryUsage,
      },
    };
  }

  printCrashSummary(): void {
    const report = this.generateCrashReport();
    
    console.group('💥 [CrashAnalyzer] Crash Summary Report');
    console.log('📊 Summary:', report.summary);
    console.log('🏗️ Crashes by Component:', report.patterns.byComponent);
    console.log('📝 Crashes by Type:', report.patterns.byType);
    console.log('⏰ Crashes by Hour:', report.patterns.byHour);
    console.log('⚡ Performance Issues:', report.performance);
    
    if (report.crashes.length > 0) {
      console.log('🔍 Recent Crashes:');
      report.crashes.slice(-5).forEach((crash, index) => {
        console.log(`  ${index + 1}. [${crash.type}] ${crash.message}`, {
          component: crash.component,
          timestamp: new Date(crash.timestamp).toISOString(),
        });
      });
    }
    
    console.groupEnd();
  }

  exportCrashData(): CrashData[] {
    return [...this.crashes];
  }

  clearCrashes(): void {
    this.crashes = [];
  }

  getCrashById(id: string): CrashData | undefined {
    return this.crashes.find(crash => crash.id === id);
  }

  getRecentCrashes(count: number = 10): CrashData[] {
    return this.crashes.slice(-count);
  }

  getCrashesByComponent(componentName: string): CrashData[] {
    return this.crashes.filter(crash => crash.component === componentName);
  }

  getCrashesByType(type: CrashData['type']): CrashData[] {
    return this.crashes.filter(crash => crash.type === type);
  }
}

// Export singleton instance
export const crashAnalyzer = new CrashAnalyzer();

// Make available globally for debugging
(window as any).crashAnalyzer = crashAnalyzer;
(window as any).printCrashSummary = () => crashAnalyzer.printCrashSummary();
(window as any).exportCrashData = () => crashAnalyzer.exportCrashData();

export default CrashAnalyzer;
