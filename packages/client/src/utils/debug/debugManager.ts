/**
 * Debug initialization and management module
 * This module sets up the comprehensive UI debugging system
 * and provides easy access to debug utilities for all components
 */

import { uiLogger } from './uiLogger';
import { crashAnalyzer } from './crashAnalyzer';

// Debug mode configuration
export const DEBUG_CONFIG = {
  isEnabled: import.meta.env.VITE_UI_DEBUG_MODE === 'true',
  logLevel: import.meta.env.VITE_LOG_LEVEL || 'info',
  features: {
    renderDebug: import.meta.env.VITE_RENDER_DEBUG === 'true',
    errorBoundaryDebug: import.meta.env.VITE_ERROR_BOUNDARY_DEBUG === 'true',
    contentSanitizerDebug: import.meta.env.VITE_CONTENT_SANITIZER_DEBUG === 'true',
    performanceMonitoring: import.meta.env.VITE_PERFORMANCE_MONITORING === 'true',
    componentTracking: import.meta.env.VITE_COMPONENT_TRACKING === 'true',
    stateMonitoring: import.meta.env.VITE_STATE_MONITORING === 'true',
    effectDebugging: import.meta.env.VITE_EFFECT_DEBUGGING === 'true',
    markdownDebug: import.meta.env.VITE_MARKDOWN_DEBUG === 'true',
    typewriterDebug: import.meta.env.VITE_TYPEWRITER_DEBUG === 'true',
    websocketDebug: import.meta.env.VITE_WEBSOCKET_DEBUG === 'true',
    streamingDebug: import.meta.env.VITE_STREAMING_DEBUG === 'true',
    zustandDebug: import.meta.env.VITE_ZUSTAND_DEBUG === 'true',
  }
};

/**
 * Enhanced debug utilities for components
 */
export class UIDebugManager {
  private static instance: UIDebugManager | null = null;
  private initialized = false;
  private startTime: number;
  private componentRegistry = new Map<string, any>();

  constructor() {
    this.startTime = Date.now();
  }

  static getInstance(): UIDebugManager {
    if (!UIDebugManager.instance) {
      UIDebugManager.instance = new UIDebugManager();
    }
    return UIDebugManager.instance;
  }

  /**
   * Initialize the debug system
   */
  initialize(): void {
    if (this.initialized || !DEBUG_CONFIG.isEnabled) {
      return;
    }

    console.log('🔧 [UIDebugManager] Initializing comprehensive UI debugging system...');
    
    // Setup global error handling enhancements
    this.setupGlobalErrorHandling();
    
    // Setup performance monitoring
    this.setupPerformanceMonitoring();
    
    // Setup component tracking
    this.setupComponentTracking();
    
    // Setup console enhancements
    this.setupConsoleEnhancements();
    
    // Setup keyboard shortcuts for debugging
    this.setupKeyboardShortcuts();
    
    // Log initialization complete
    this.logInitializationComplete();
    
    this.initialized = true;
  }

  /**
   * Register a component for debugging
   */
  registerComponent(name: string, instance: any): void {
    if (!DEBUG_CONFIG.isEnabled) return;
    
    this.componentRegistry.set(name, {
      instance,
      registeredAt: Date.now(),
      renderCount: 0,
      lastRender: null,
      errors: [],
    });
    
    uiLogger.debug('Component Registration', `${name} registered for debugging`, {
      totalRegistered: this.componentRegistry.size,
    });
  }

  /**
   * Unregister a component
   */
  unregisterComponent(name: string): void {
    if (!DEBUG_CONFIG.isEnabled) return;
    
    const component = this.componentRegistry.get(name);
    if (component) {
      const lifetime = Date.now() - component.registeredAt;
      uiLogger.debug('Component Unregistration', `${name} unregistered`, {
        lifetime,
        totalRenders: component.renderCount,
        averageRenderInterval: component.renderCount > 1 ? lifetime / component.renderCount : 0,
      });
      
      this.componentRegistry.delete(name);
    }
  }

  /**
   * Log component render
   */
  logComponentRender(name: string, props?: any): void {
    if (!DEBUG_CONFIG.isEnabled || !DEBUG_CONFIG.features.componentTracking) return;
    
    const component = this.componentRegistry.get(name);
    if (component) {
      component.renderCount++;
      component.lastRender = Date.now();
    }
    
    uiLogger.componentRender(name, props, component?.renderCount || 0);
  }

  /**
   * Get component debug information
   */
  getComponentInfo(name: string): any {
    return this.componentRegistry.get(name) || null;
  }

  /**
   * Get all registered components
   */
  getAllComponents(): Array<{name: string, info: any}> {
    return Array.from(this.componentRegistry.entries()).map(([name, info]) => ({
      name,
      info
    }));
  }

  /**
   * Setup enhanced global error handling
   */
  private setupGlobalErrorHandling(): void {
    // Enhanced window error handler
    const originalErrorHandler = window.onerror;
    window.onerror = (message, source, lineno, colno, error) => {
      uiLogger.error('Global JavaScript Error', String(message), {
        source,
        lineno,
        colno,
        error: error?.stack,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
      
      // Call original handler if it exists
      if (originalErrorHandler) {
        originalErrorHandler.call(window, message, source, lineno, colno, error);
      }
      
      return false; // Don't prevent default error handling
    };

    // Enhanced unhandled promise rejection handler
    const originalRejectionHandler = window.onunhandledrejection;
    window.onunhandledrejection = (event) => {
      uiLogger.error('Unhandled Promise Rejection', 'Promise rejected without handler', {
        reason: event.reason,
        promise: event.promise,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      });
      
      // Call original handler if it exists
      if (originalRejectionHandler) {
        originalRejectionHandler.call(window, event);
      }
    };

    console.log('✅ [UIDebugManager] Enhanced global error handling setup complete');
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    if (!DEBUG_CONFIG.features.performanceMonitoring) return;

    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.duration > 50) { // Tasks longer than 50ms
              uiLogger.warn('Long Task Detected', `Task took ${entry.duration.toFixed(2)}ms`, {
                duration: entry.duration,
                startTime: entry.startTime,
                name: entry.name,
              });
            }
          });
        });
        
        longTaskObserver.observe({ entryTypes: ['longtask'] });
        
        // Monitor layout shifts
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry: any) => {
            if (entry.value > 0.1) { // Significant layout shift
              uiLogger.warn('Layout Shift Detected', `CLS value: ${entry.value}`, {
                value: entry.value,
                sources: entry.sources,
              });
            }
          });
        });
        
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        
        console.log('✅ [UIDebugManager] Performance monitoring setup complete');
      } catch (error) {
        console.warn('[UIDebugManager] Performance monitoring setup failed:', error);
      }
    }
  }

  /**
   * Setup component tracking
   */
  private setupComponentTracking(): void {
    if (!DEBUG_CONFIG.features.componentTracking) return;

    // Monitor React DevTools if available
    if (typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined') {
      console.log('✅ [UIDebugManager] React DevTools integration available');
    }

    console.log('✅ [UIDebugManager] Component tracking setup complete');
  }

  /**
   * Setup console enhancements
   */
  private setupConsoleEnhancements(): void {
    // Add custom console styles for debug messages
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Enhanced logging with timestamps and styling
    const createEnhancedLogger = (originalFn: any, level: string, color: string) => {
      return (...args: any[]) => {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        originalFn(
          `%c[${timestamp}] %c[${level}]`,
          'color: #666; font-size: 11px;',
          `color: ${color}; font-weight: bold;`,
          ...args
        );
      };
    };

    // Only enhance in debug mode
    if (DEBUG_CONFIG.isEnabled) {
      (console as any).debugLog = createEnhancedLogger(originalLog, 'DEBUG', '#2196F3');
      (console as any).infoLog = createEnhancedLogger(originalLog, 'INFO', '#4CAF50');
      (console as any).warnLog = createEnhancedLogger(originalWarn, 'WARN', '#FF9800');
      (console as any).errorLog = createEnhancedLogger(originalError, 'ERROR', '#F44336');
    }

    console.log('✅ [UIDebugManager] Console enhancements setup complete');
  }

  /**
   * Setup keyboard shortcuts for debugging
   */
  private setupKeyboardShortcuts(): void {
    const handleKeyboardShortcuts = (event: KeyboardEvent) => {
      // Only process shortcuts when Ctrl+Shift are pressed (or Cmd+Shift on Mac)
      const isShortcutKey = (event.ctrlKey || event.metaKey) && event.shiftKey;
      
      if (!isShortcutKey) return;

      switch (event.key.toLowerCase()) {
        case 'd':
          // Ctrl+Shift+D: Toggle debug mode
          event.preventDefault();
          this.toggleDebugMode();
          break;
          
        case 'l':
          // Ctrl+Shift+L: Export logs
          event.preventDefault();
          this.exportLogs();
          break;
          
        case 'c':
          // Ctrl+Shift+C: Clear logs
          event.preventDefault();
          this.clearLogs();
          break;
          
        case 'r':
          // Ctrl+Shift+R: Generate crash report
          event.preventDefault();
          this.generateCrashReport();
          break;
          
        case 's':
          // Ctrl+Shift+S: Show debug summary
          event.preventDefault();
          this.showDebugSummary();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyboardShortcuts);
    
    console.log('✅ [UIDebugManager] Keyboard shortcuts setup complete');
    console.log('🔧 [UIDebugManager] Available shortcuts:');
    console.log('  Ctrl+Shift+D: Toggle debug mode');
    console.log('  Ctrl+Shift+L: Export logs');
    console.log('  Ctrl+Shift+C: Clear logs');
    console.log('  Ctrl+Shift+R: Generate crash report');
    console.log('  Ctrl+Shift+S: Show debug summary');
  }

  /**
   * Toggle debug mode
   */
  private toggleDebugMode(): void {
    DEBUG_CONFIG.isEnabled = !DEBUG_CONFIG.isEnabled;
    console.log(`🔧 [UIDebugManager] Debug mode ${DEBUG_CONFIG.isEnabled ? 'enabled' : 'disabled'}`);
    
    if (DEBUG_CONFIG.isEnabled) {
      uiLogger.info('Debug Mode', 'Debug mode enabled via keyboard shortcut');
    }
  }

  /**
   * Export logs
   */
  private exportLogs(): void {
    const logs = uiLogger.exportLogs();
    const dataStr = JSON.stringify(logs, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ui-debug-logs-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    console.log('📁 [UIDebugManager] Logs exported successfully');
    uiLogger.info('Log Export', 'Debug logs exported via keyboard shortcut');
  }

  /**
   * Clear logs
   */
  private clearLogs(): void {
    uiLogger.clearLogs();
    console.clear();
    console.log('🧹 [UIDebugManager] Logs cleared');
  }

  /**
   * Generate crash report
   */
  private generateCrashReport(): void {
    crashAnalyzer.printCrashSummary();
    const report = crashAnalyzer.generateCrashReport();
    
    console.group('📊 [UIDebugManager] Comprehensive Debug Report');
    console.log('Session Info:', uiLogger.getSessionInfo());
    console.log('Component Registry:', this.getAllComponents());
    console.log('Crash Analysis:', report);
    console.groupEnd();
  }

  /**
   * Show debug summary
   */
  private showDebugSummary(): void {
    const sessionInfo = uiLogger.getSessionInfo();
    const components = this.getAllComponents();
    const uptime = Date.now() - this.startTime;
    
    console.group('📈 [UIDebugManager] Debug Summary');
    console.log('🕐 Session Uptime:', `${(uptime / 1000).toFixed(2)}s`);
    console.log('📊 Session Info:', sessionInfo);
    console.log('🎯 Registered Components:', components.length);
    console.log('⚙️ Debug Features:', Object.entries(DEBUG_CONFIG.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature));
    console.log('🔧 Debug Config:', DEBUG_CONFIG);
    console.groupEnd();
  }

  /**
   * Log initialization complete
   */
  private logInitializationComplete(): void {
    const enabledFeatures = Object.entries(DEBUG_CONFIG.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature);

    console.group('🎉 [UIDebugManager] Initialization Complete');
    console.log('✅ Debug system fully initialized');
    console.log('🔧 Enabled features:', enabledFeatures);
    console.log('📋 Available global functions:');
    console.log('  window.uiLogger - UI logging system');
    console.log('  window.crashAnalyzer - Crash analysis tools');
    console.log('  window.debugManager - Debug manager instance');
    console.log('  window.exportUILogs() - Export debug logs');
    console.log('  window.printCrashSummary() - Print crash summary');
    console.log('🔧 Use Ctrl+Shift+S to show debug summary anytime');
    console.groupEnd();

    // Add global access to debug manager
    (window as any).debugManager = this;
  }
}

/**
 * Convenient wrapper for component debugging
 */
export class ComponentDebugger {
  private manager: UIDebugManager;
  private componentName: string;

  constructor(componentName: string) {
    this.manager = UIDebugManager.getInstance();
    this.componentName = componentName;
    
    if (DEBUG_CONFIG.isEnabled) {
      this.manager.registerComponent(componentName, this);
    }
  }

  /**
   * Log component render
   */
  logRender(props?: any): void {
    this.manager.logComponentRender(this.componentName, props);
  }

  /**
   * Log component error
   */
  logError(error: Error, context?: any): void {
    uiLogger.componentError(this.componentName, error, context);
  }

  /**
   * Log component warning
   */
  logWarning(message: string, data?: any): void {
    uiLogger.warn('Component Warning', message, data, this.componentName);
  }

  /**
   * Log component info
   */
  logInfo(message: string, data?: any): void {
    uiLogger.info('Component Info', message, data, this.componentName);
  }

  /**
   * Log debug information
   */
  logDebug(message: string, data?: any): void {
    uiLogger.debug('Component Debug', message, data, this.componentName);
  }

  /**
   * Cleanup on component unmount
   */
  cleanup(): void {
    this.manager.unregisterComponent(this.componentName);
  }
}

/**
 * Hook for easy component debugging integration
 */
export function useComponentDebugger(componentName: string) {
  if (!DEBUG_CONFIG.isEnabled) {
    return {
      logRender: () => {},
      logError: () => {},
      logWarning: () => {},
      logInfo: () => {},
      logDebug: () => {},
    };
  }

  const debugger = new ComponentDebugger(componentName);
  
  // Cleanup on unmount
  React.useEffect(() => {
    return () => debugger.cleanup();
  }, []);
  
  return {
    logRender: debugger.logRender.bind(debugger),
    logError: debugger.logError.bind(debugger),
    logWarning: debugger.logWarning.bind(debugger),
    logInfo: debugger.logInfo.bind(debugger),
    logDebug: debugger.logDebug.bind(debugger),
  };
}

// Initialize debug system if enabled
const debugManager = UIDebugManager.getInstance();
if (DEBUG_CONFIG.isEnabled) {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => debugManager.initialize());
  } else {
    debugManager.initialize();
  }
}

export { debugManager };
export default UIDebugManager;
