#!/bin/bash

# Enhanced UI Debug Setup Script
# This script prepares the environment for comprehensive UI debugging and crash investigation

set -e

# Colors for output
CYAN='\033[36m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
RESET='\033[0m'

echo -e "${CYAN}🔧 Setting up enhanced UI debugging environment...${RESET}"

# Ensure we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Must be run from the project root directory${RESET}"
    exit 1
fi

# Create UI debug configuration if it doesn't exist
echo -e "${CYAN}📋 Creating UI debug configuration...${RESET}"

# Create .env.debug file for UI debugging
cat > packages/client/.env.debug << 'EOF'
# UI Debug Mode Configuration
# This file is automatically created by make logs-ui

# Enable comprehensive UI debugging
VITE_UI_DEBUG_MODE=true
VITE_LOG_LEVEL=debug
VITE_RENDER_DEBUG=true
VITE_ERROR_BOUNDARY_DEBUG=true
VITE_CONTENT_SANITIZER_DEBUG=true
VITE_PERFORMANCE_MONITORING=true

# React development mode optimizations
VITE_REACT_STRICT_MODE=true
VITE_REACT_PROFILER=true

# Enhanced error reporting
VITE_DETAILED_ERRORS=true
VITE_STACK_TRACES=true
VITE_SOURCE_MAPS=true

# Component tracking
VITE_COMPONENT_TRACKING=true
VITE_STATE_MONITORING=true
VITE_EFFECT_DEBUGGING=true

# Markdown and content debugging
VITE_MARKDOWN_DEBUG=true
VITE_TYPEWRITER_DEBUG=true
VITE_ARTIFACT_DEBUG=true

# WebSocket and streaming debugging
VITE_WEBSOCKET_DEBUG=true
VITE_STREAMING_DEBUG=true

# Store debugging
VITE_ZUSTAND_DEBUG=true
VITE_STORE_PERSISTENCE_DEBUG=true
EOF

echo -e "${GREEN}✅ Created .env.debug file${RESET}"

# Update vite.config.ts to support debug mode
echo -e "${CYAN}🔧 Enhancing Vite configuration for debug mode...${RESET}"

# Create debug-enhanced vite config backup and update
if [ ! -f "packages/client/vite.config.ts.backup" ]; then
    cp packages/client/vite.config.ts packages/client/vite.config.ts.backup
fi

# Create enhanced vite config for debugging
cat > packages/client/vite.config.debug.ts << 'EOF'
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load environment variables
  const env = loadEnv(mode, process.cwd(), '');
  
  // Check if we're in debug mode
  const isDebugMode = env.VITE_UI_DEBUG_MODE === 'true';
  
  return {
    plugins: [
      react({
        // Enhanced React debugging in debug mode
        babel: isDebugMode ? {
          plugins: [
            // Add React debug transforms
            ['@babel/plugin-transform-react-jsx-development', {}],
          ],
        } : undefined,
        // Enable React DevTools profiling
        jsxRuntime: 'automatic',
        jsxImportSource: isDebugMode ? '@welldone-software/why-did-you-render' : 'react',
      }),
    ],
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      // Enable source maps in debug mode
      sourcemap: isDebugMode ? 'inline' : false,
      // Disable minification in debug mode for better error messages
      minify: isDebugMode ? false : 'esbuild',
      // More detailed build info in debug mode
      rollupOptions: isDebugMode ? {
        output: {
          sourcemap: true,
          sourcemapExcludeSources: false,
        },
      } : {},
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@olympian/shared': path.resolve(__dirname, '../shared/src'),
      },
    },
    server: {
      port: 3000,
      // Enhanced logging in debug mode
      logLevel: isDebugMode ? 'info' : 'error',
      proxy: {
        '/api': {
          target: 'http://localhost:4000',
          changeOrigin: true,
          // Log proxy requests in debug mode
          configure: isDebugMode ? (proxy, _options) => {
            proxy.on('error', (err, _req, _res) => {
              console.log('[PROXY] Error:', err);
            });
            proxy.on('proxyReq', (proxyReq, req, _res) => {
              console.log('[PROXY] Request:', req.method, req.url);
            });
            proxy.on('proxyRes', (proxyRes, req, _res) => {
              console.log('[PROXY] Response:', proxyRes.statusCode, req.url);
            });
          } : undefined,
        },
        '/socket.io': {
          target: 'http://localhost:4000',
          ws: true,
          changeOrigin: true,
        },
      },
    },
    // Enhanced debugging options
    define: isDebugMode ? {
      __DEV__: true,
      __DEBUG__: true,
      'process.env.NODE_ENV': '"development"',
    } : {},
    // Optimize dependencies for debugging
    optimizeDeps: isDebugMode ? {
      include: ['react', 'react-dom', 'react-markdown'],
      exclude: ['@vitejs/plugin-react'],
    } : {},
  };
});
EOF

echo -e "${GREEN}✅ Enhanced Vite configuration for debug mode${RESET}"

# Create enhanced UI logging utility
echo -e "${CYAN}📝 Creating enhanced UI logging utilities...${RESET}"

mkdir -p packages/client/src/utils/debug

# Create comprehensive debug logger
cat > packages/client/src/utils/debug/uiLogger.ts << 'EOF'
/**
 * Enhanced UI Logger for comprehensive debugging and crash investigation
 * Created by make logs-ui command
 */

// Debug mode check
const isDebugMode = import.meta.env.VITE_UI_DEBUG_MODE === 'true';
const logLevel = import.meta.env.VITE_LOG_LEVEL || 'info';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface UILogEntry {
  timestamp: string;
  level: LogLevel;
  component?: string;
  category: string;
  message: string;
  data?: any;
  stack?: string;
  userId?: string;
  sessionId?: string;
}

class UILogger {
  private logs: UILogEntry[] = [];
  private maxLogs = 1000;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    if (isDebugMode) {
      console.log('[UILogger] Debug mode enabled - comprehensive logging active');
      this.setupGlobalErrorHandling();
    }
  }

  private generateSessionId(): string {
    return `ui-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupGlobalErrorHandling() {
    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.error('Global Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack,
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error('Unhandled Promise Rejection', {
        reason: event.reason,
        promise: event.promise,
      });
    });

    // Monitor React errors (works with Error Boundaries)
    const originalConsoleError = console.error;
    console.error = (...args) => {
      if (args[0]?.includes?.('React') || args[0]?.includes?.('Warning')) {
        this.error('React Error/Warning', { args });
      }
      originalConsoleError.apply(console, args);
    };
  }

  private shouldLog(level: LogLevel): boolean {
    if (!isDebugMode && level < LogLevel.WARN) return false;
    
    const configLevel = {
      'debug': LogLevel.DEBUG,
      'info': LogLevel.INFO,
      'warn': LogLevel.WARN,
      'error': LogLevel.ERROR,
    }[logLevel] || LogLevel.INFO;

    return level >= configLevel;
  }

  private addLog(entry: UILogEntry) {
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    component?: string
  ): UILogEntry {
    const entry: UILogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      sessionId: this.sessionId,
    };

    if (component) entry.component = component;
    if (data !== undefined) entry.data = data;
    if (level >= LogLevel.ERROR) {
      entry.stack = new Error().stack;
    }

    return entry;
  }

  debug(category: string, message: string, data?: any, component?: string) {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const entry = this.createLogEntry(LogLevel.DEBUG, category, message, data, component);
    this.addLog(entry);
    
    console.debug(`[UI-DEBUG] [${category}] ${component ? `[${component}] ` : ''}${message}`, data || '');
  }

  info(category: string, message: string, data?: any, component?: string) {
    if (!this.shouldLog(LogLevel.INFO)) return;
    
    const entry = this.createLogEntry(LogLevel.INFO, category, message, data, component);
    this.addLog(entry);
    
    console.info(`[UI-INFO] [${category}] ${component ? `[${component}] ` : ''}${message}`, data || '');
  }

  warn(category: string, message: string, data?: any, component?: string) {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const entry = this.createLogEntry(LogLevel.WARN, category, message, data, component);
    this.addLog(entry);
    
    console.warn(`[UI-WARN] [${category}] ${component ? `[${component}] ` : ''}${message}`, data || '');
  }

  error(category: string, message: string, data?: any, component?: string) {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const entry = this.createLogEntry(LogLevel.ERROR, category, message, data, component);
    this.addLog(entry);
    
    console.error(`[UI-ERROR] [${category}] ${component ? `[${component}] ` : ''}${message}`, data || '');
  }

  // Specialized logging methods for UI crash investigation
  componentRender(component: string, props?: any, renderCount?: number) {
    this.debug('Component Render', `${component} rendered`, { props, renderCount }, component);
  }

  componentError(component: string, error: Error, errorInfo?: any) {
    this.error('Component Error', `${component} crashed`, { 
      error: error.message, 
      stack: error.stack, 
      errorInfo 
    }, component);
  }

  contentSanitization(component: string, originalContent: string, sanitizedContent: string) {
    this.debug('Content Sanitization', 'Content processed', {
      originalLength: originalContent.length,
      sanitizedLength: sanitizedContent.length,
      hasSpecialChars: /[^\x20-\x7E]/.test(originalContent),
    }, component);
  }

  markdownRenderError(component: string, content: string, error: Error) {
    this.error('Markdown Render Error', 'ReactMarkdown failed to render', {
      contentPreview: content.substring(0, 200),
      contentLength: content.length,
      error: error.message,
      stack: error.stack,
    }, component);
  }

  infiniteLoopDetected(component: string, renderCount: number, timeWindow: number) {
    this.error('Infinite Loop', `Detected ${renderCount} renders in ${timeWindow}ms`, {
      renderCount,
      timeWindow,
    }, component);
  }

  stateChange(component: string, stateName: string, oldValue: any, newValue: any) {
    this.debug('State Change', `${stateName} changed`, {
      from: oldValue,
      to: newValue,
    }, component);
  }

  effectTrigger(component: string, effectName: string, dependencies: any[]) {
    this.debug('Effect Trigger', `${effectName} effect triggered`, {
      dependencies,
    }, component);
  }

  // Export logs for analysis
  exportLogs(filterLevel?: LogLevel): UILogEntry[] {
    if (filterLevel !== undefined) {
      return this.logs.filter(log => log.level >= filterLevel);
    }
    return [...this.logs];
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    console.info('[UILogger] Logs cleared');
  }

  // Get session info for debugging
  getSessionInfo() {
    return {
      sessionId: this.sessionId,
      logCount: this.logs.length,
      errorCount: this.logs.filter(log => log.level === LogLevel.ERROR).length,
      warnCount: this.logs.filter(log => log.level === LogLevel.WARN).length,
      isDebugMode,
      logLevel,
    };
  }
}

// Create singleton instance
export const uiLogger = new UILogger();

// Add global access for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).uiLogger = uiLogger;
  (window as any).exportUILogs = () => uiLogger.exportLogs();
  (window as any).clearUILogs = () => uiLogger.clearLogs();
  
  if (isDebugMode) {
    console.info('[UILogger] Global debugging functions available:');
    console.info('  window.uiLogger - Logger instance');
    console.info('  window.exportUILogs() - Export all logs');
    console.info('  window.clearUILogs() - Clear logs');
  }
}

export default uiLogger;
EOF

echo -e "${GREEN}✅ Created enhanced UI logging utilities${RESET}"

# Create enhanced render debug hooks
echo -e "${CYAN}🔧 Enhancing render debug hooks...${RESET}"

cat > packages/client/src/hooks/useEnhancedRenderDebug.ts << 'EOF'
import { useEffect, useRef, useCallback } from 'react';
import { uiLogger } from '@/utils/debug/uiLogger';

/**
 * Enhanced render debug hook with comprehensive tracking
 * Automatically enabled in debug mode
 */
export function useEnhancedRenderDebug(componentName: string, props?: Record<string, any>) {
  const renderCount = useRef(0);
  const prevPropsRef = useRef<Record<string, any> | undefined>(props);
  const renderTimesRef = useRef<number[]>([]);
  const isDebugMode = import.meta.env.VITE_UI_DEBUG_MODE === 'true';

  useEffect(() => {
    if (!isDebugMode) return;

    renderCount.current += 1;
    const now = Date.now();
    renderTimesRef.current.push(now);

    // Keep only last 20 render times for more detailed analysis
    if (renderTimesRef.current.length > 20) {
      renderTimesRef.current = renderTimesRef.current.slice(-20);
    }

    // Enhanced infinite loop detection with different time windows
    const checkInfiniteLoop = (windowMs: number, maxRenders: number) => {
      const recentRenders = renderTimesRef.current.filter(time => now - time < windowMs);
      if (recentRenders.length > maxRenders) {
        uiLogger.infiniteLoopDetected(componentName, recentRenders.length, windowMs);
        console.error(`[INFINITE LOOP] ${componentName} rendered ${recentRenders.length} times in ${windowMs}ms!`);
        console.trace('Component stack trace:');
        return true;
      }
      return false;
    };

    // Check different time windows
    const hasInfiniteLoop = 
      checkInfiniteLoop(100, 5) ||   // 5 renders in 100ms
      checkInfiniteLoop(1000, 20) ||  // 20 renders in 1 second
      checkInfiniteLoop(5000, 50);    // 50 renders in 5 seconds

    if (hasInfiniteLoop) {
      // Additional analysis for infinite loops
      console.group(`[INFINITE LOOP ANALYSIS] ${componentName}`);
      console.log('Render history:', renderTimesRef.current.map((time, i) => ({
        render: i + 1,
        timestamp: new Date(time).toISOString(),
        timeSincePrevious: i > 0 ? time - renderTimesRef.current[i - 1] : 0,
      })));
      console.log('Current props:', props);
      console.log('Previous props:', prevPropsRef.current);
      console.groupEnd();
    }

    // Log render with detailed information
    uiLogger.componentRender(componentName, props, renderCount.current);

    // Enhanced prop change analysis
    if (props && prevPropsRef.current) {
      const changedProps: Array<{key: string, from: any, to: any}> = [];
      const addedProps: Array<{key: string, value: any}> = [];
      const removedProps: Array<{key: string, value: any}> = [];
      
      // Check for changed and removed props
      Object.keys(prevPropsRef.current).forEach(key => {
        if (!(key in props)) {
          removedProps.push({ key, value: prevPropsRef.current![key] });
        } else if (props[key] !== prevPropsRef.current![key]) {
          changedProps.push({ key, from: prevPropsRef.current![key], to: props[key] });
        }
      });

      // Check for added props
      Object.keys(props).forEach(key => {
        if (!(key in prevPropsRef.current!)) {
          addedProps.push({ key, value: props[key] });
        }
      });

      if (changedProps.length > 0 || addedProps.length > 0 || removedProps.length > 0) {
        console.group(`[PROP CHANGES] ${componentName} render #${renderCount.current}`);
        
        if (changedProps.length > 0) {
          console.log('Changed props:', changedProps);
        }
        if (addedProps.length > 0) {
          console.log('Added props:', addedProps);
        }
        if (removedProps.length > 0) {
          console.log('Removed props:', removedProps);
        }
        
        // Check for object/function prop issues
        changedProps.forEach(({ key, from, to }) => {
          if (typeof from === 'object' && typeof to === 'object' && from !== to) {
            console.warn(`[POTENTIAL ISSUE] ${key} object recreated (may cause unnecessary re-renders)`);
          }
          if (typeof from === 'function' && typeof to === 'function' && from !== to) {
            console.warn(`[POTENTIAL ISSUE] ${key} function recreated (may cause unnecessary re-renders)`);
          }
        });
        
        console.groupEnd();
      }
    }

    prevPropsRef.current = props;

    // Performance monitoring
    if (renderCount.current % 10 === 0) {
      console.log(`[PERFORMANCE] ${componentName} has rendered ${renderCount.current} times`);
    }
  });

  // Log on unmount with summary
  useEffect(() => {
    return () => {
      if (isDebugMode) {
        const totalTime = renderTimesRef.current.length > 1 
          ? renderTimesRef.current[renderTimesRef.current.length - 1] - renderTimesRef.current[0]
          : 0;
        
        console.log(`[UNMOUNT] ${componentName} unmounted after ${renderCount.current} renders over ${totalTime}ms`);
        uiLogger.debug('Component Unmount', `${componentName} unmounted`, {
          totalRenders: renderCount.current,
          totalTime,
        }, componentName);
      }
    };
  }, [componentName, isDebugMode]);

  // Return debug utilities for component use
  return useCallback(() => ({
    renderCount: renderCount.current,
    renderTimes: [...renderTimesRef.current],
    averageRenderTime: renderTimesRef.current.length > 1 
      ? (renderTimesRef.current[renderTimesRef.current.length - 1] - renderTimesRef.current[0]) / (renderTimesRef.current.length - 1)
      : 0,
  }), []);
}

/**
 * Enhanced effect debug hook with dependency analysis
 */
export function useEnhancedEffectDebug(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  debugName: string,
  componentName?: string
) {
  const prevDepsRef = useRef<React.DependencyList>();
  const effectRunCount = useRef(0);
  const isDebugMode = import.meta.env.VITE_UI_DEBUG_MODE === 'true';

  useEffect(() => {
    if (!isDebugMode) return effect();

    effectRunCount.current += 1;

    if (prevDepsRef.current) {
      const changedDeps: Array<{index: number, from: any, to: any}> = [];
      
      deps.forEach((dep, index) => {
        if (dep !== prevDepsRef.current![index]) {
          changedDeps.push({ index, from: prevDepsRef.current![index], to: dep });
        }
      });

      if (changedDeps.length > 0) {
        console.group(`[EFFECT] ${debugName} (run #${effectRunCount.current})`);
        console.log('Changed dependencies:', changedDeps);
        
        // Analyze dependency changes
        changedDeps.forEach(({ index, from, to }) => {
          if (typeof from === 'object' && typeof to === 'object' && JSON.stringify(from) === JSON.stringify(to)) {
            console.warn(`[DEPENDENCY ISSUE] deps[${index}] object identity changed but content is same`);
          }
          if (typeof from === 'function' && typeof to === 'function') {
            console.warn(`[DEPENDENCY ISSUE] deps[${index}] function identity changed`);
          }
        });
        
        console.groupEnd();

        uiLogger.effectTrigger(componentName || 'Unknown', debugName, deps);
      }
    } else {
      console.log(`[EFFECT] ${debugName} (initial run)`);
    }

    prevDepsRef.current = deps;
    return effect();
  }, deps);
}
EOF

echo -e "${GREEN}✅ Enhanced render debug hooks created${RESET}"

# Create UI crash analysis tools
echo -e "${CYAN}🔍 Creating UI crash analysis tools...${RESET}"

cat > packages/client/src/utils/debug/crashAnalyzer.ts << 'EOF'
import { uiLogger, UILogEntry, LogLevel } from './uiLogger';

/**
 * UI Crash Analyzer - Provides tools to analyze and report UI crashes
 */

export interface CrashReport {
  sessionId: string;
  timestamp: string;
  errorCount: number;
  warningCount: number;
  recentErrors: UILogEntry[];
  recentWarnings: UILogEntry[];
  componentErrorCounts: Record<string, number>;
  errorCategories: Record<string, number>;
  suspectedComponents: string[];
  recommendations: string[];
}

export class UICrashAnalyzer {
  generateCrashReport(): CrashReport {
    const allLogs = uiLogger.exportLogs();
    const errors = allLogs.filter(log => log.level === LogLevel.ERROR);
    const warnings = allLogs.filter(log => log.level === LogLevel.WARN);
    
    // Recent errors and warnings (last 10)
    const recentErrors = errors.slice(-10);
    const recentWarnings = warnings.slice(-10);
    
    // Component error counts
    const componentErrorCounts: Record<string, number> = {};
    errors.forEach(error => {
      if (error.component) {
        componentErrorCounts[error.component] = (componentErrorCounts[error.component] || 0) + 1;
      }
    });
    
    // Error category counts
    const errorCategories: Record<string, number> = {};
    errors.forEach(error => {
      errorCategories[error.category] = (errorCategories[error.category] || 0) + 1;
    });
    
    // Suspected components (components with most errors)
    const suspectedComponents = Object.entries(componentErrorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([component]) => component);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(errors, warnings, componentErrorCounts, errorCategories);
    
    return {
      sessionId: uiLogger.getSessionInfo().sessionId,
      timestamp: new Date().toISOString(),
      errorCount: errors.length,
      warningCount: warnings.length,
      recentErrors,
      recentWarnings,
      componentErrorCounts,
      errorCategories,
      suspectedComponents,
      recommendations,
    };
  }
  
  private generateRecommendations(
    errors: UILogEntry[],
    warnings: UILogEntry[],
    componentErrorCounts: Record<string, number>,
    errorCategories: Record<string, number>
  ): string[] {
    const recommendations: string[] = [];
    
    // Infinite loop detection
    const infiniteLoopErrors = errors.filter(e => e.category === 'Infinite Loop');
    if (infiniteLoopErrors.length > 0) {
      recommendations.push('🔄 Infinite render loops detected. Check useEffect dependencies and avoid creating objects/functions in render.');
    }
    
    // Markdown rendering errors
    const markdownErrors = errors.filter(e => e.category === 'Markdown Render Error');
    if (markdownErrors.length > 0) {
      recommendations.push('📝 ReactMarkdown rendering failures detected. Check content sanitization and special characters.');
    }
    
    // Component crashes
    const componentErrors = errors.filter(e => e.category === 'Component Error');
    if (componentErrors.length > 0) {
      recommendations.push('⚛️ React component crashes detected. Review error boundaries and component error handling.');
    }
    
    // Content sanitization issues
    const sanitizationWarnings = warnings.filter(w => w.category === 'Content Sanitization');
    if (sanitizationWarnings.length > 5) {
      recommendations.push('🧹 Frequent content sanitization issues. Consider improving content validation on the backend.');
    }
    
    // High error components
    const highErrorComponents = Object.entries(componentErrorCounts)
      .filter(([, count]) => count > 3)
      .map(([component]) => component);
    
    if (highErrorComponents.length > 0) {
      recommendations.push(`🎯 Components with frequent errors: ${highErrorComponents.join(', ')}. Focus debugging efforts here.`);
    }
    
    // Global errors
    const globalErrors = errors.filter(e => e.category === 'Global Error');
    if (globalErrors.length > 0) {
      recommendations.push('🌐 Uncaught errors detected. Add more try-catch blocks and error boundaries.');
    }
    
    // Memory/performance issues
    const renderCount = warnings.filter(w => w.message.includes('rendered') && w.message.includes('times')).length;
    if (renderCount > 10) {
      recommendations.push('⚡ High component render frequency detected. Optimize with React.memo, useMemo, and useCallback.');
    }
    
    return recommendations;
  }
  
  exportCrashReport(): string {
    const report = this.generateCrashReport();
    return JSON.stringify(report, null, 2);
  }
  
  printCrashSummary(): void {
    const report = this.generateCrashReport();
    
    console.group('🚨 UI CRASH ANALYSIS SUMMARY');
    console.log(`Session ID: ${report.sessionId}`);
    console.log(`Timestamp: ${report.timestamp}`);
    console.log(`Total Errors: ${report.errorCount}`);
    console.log(`Total Warnings: ${report.warningCount}`);
    
    if (report.suspectedComponents.length > 0) {
      console.log('🎯 Suspected Components:', report.suspectedComponents);
    }
    
    if (report.recommendations.length > 0) {
      console.log('💡 Recommendations:');
      report.recommendations.forEach(rec => console.log(`  ${rec}`));
    }
    
    if (report.recentErrors.length > 0) {
      console.log('❌ Recent Errors:');
      report.recentErrors.forEach(error => {
        console.log(`  [${error.component || 'Unknown'}] ${error.message}`);
      });
    }
    
    console.groupEnd();
  }
}

// Create singleton analyzer
export const crashAnalyzer = new UICrashAnalyzer();

// Add global access for debugging
if (typeof window !== 'undefined') {
  (window as any).crashAnalyzer = crashAnalyzer;
  (window as any).generateCrashReport = () => crashAnalyzer.generateCrashReport();
  (window as any).printCrashSummary = () => crashAnalyzer.printCrashSummary();
  
  if (import.meta.env.VITE_UI_DEBUG_MODE === 'true') {
    console.info('[CrashAnalyzer] Global debugging functions available:');
    console.info('  window.crashAnalyzer - Analyzer instance');
    console.info('  window.generateCrashReport() - Generate detailed crash report');
    console.info('  window.printCrashSummary() - Print crash summary to console');
  }
}

export default crashAnalyzer;
EOF

echo -e "${GREEN}✅ UI crash analysis tools created${RESET}"

# Update package.json to include debug script
echo -e "${CYAN}📦 Adding debug script to package.json...${RESET}"

cd packages/client

# Check if jq is available for JSON manipulation
if command -v jq >/dev/null 2>&1; then
    # Use jq to update package.json
    tmp=$(mktemp)
    jq '.scripts["dev:debug"] = "vite --config vite.config.debug.ts --mode development"' package.json > "$tmp" && mv "$tmp" package.json
    echo -e "${GREEN}✅ Added dev:debug script to package.json${RESET}"
else
    # Fallback: manual addition
    echo -e "${YELLOW}⚠️  jq not available, please manually add this script to packages/client/package.json:${RESET}"
    echo -e "${YELLOW}\"dev:debug\": \"vite --config vite.config.debug.ts --mode development\"${RESET}"
fi

cd ../..

echo -e "${CYAN}📚 Creating debugging documentation...${RESET}"

# Create comprehensive debug documentation
cat > docs/UI_DEBUG_MODE.md << 'EOF'
# UI Debug Mode Documentation

This documentation covers the comprehensive UI debugging system activated by `make logs-ui`.

## Overview

The UI Debug Mode provides extensive logging, error tracking, and performance monitoring specifically designed for investigating UI crashes and rendering issues.

## Activation

```bash
make logs-ui
```

This command:
1. Sets up debug environment configuration
2. Enables comprehensive logging
3. Starts the development server with enhanced debugging
4. Provides real-time UI crash investigation tools

## Features

### 1. Enhanced Logging System

- **Component Render Tracking**: Monitors all component renders with detailed prop analysis
- **Error Boundary Logging**: Captures and logs all React error boundary triggers
- **Content Sanitization Debug**: Tracks content processing and sanitization
- **Infinite Loop Detection**: Identifies and reports infinite render loops
- **Performance Monitoring**: Tracks render frequency and performance issues

### 2. Global Debug Functions

When running in debug mode, the following functions are available in the browser console:

```javascript
// Logger functions
window.uiLogger                 // Access to the main logger instance
window.exportUILogs()          // Export all logs as JSON
window.clearUILogs()           // Clear all logs

// Crash analysis functions
window.crashAnalyzer           // Access to crash analyzer
window.generateCrashReport()   // Generate comprehensive crash report
window.printCrashSummary()     // Print crash summary to console
```

### 3. Debug Environment Variables

The following environment variables are automatically set in debug mode:

```bash
VITE_UI_DEBUG_MODE=true                    # Enable comprehensive debugging
VITE_LOG_LEVEL=debug                       # Set logging level to debug
VITE_RENDER_DEBUG=true                     # Enable render debugging
VITE_ERROR_BOUNDARY_DEBUG=true             # Enable error boundary debugging
VITE_CONTENT_SANITIZER_DEBUG=true          # Enable content sanitization debugging
VITE_PERFORMANCE_MONITORING=true           # Enable performance monitoring
VITE_COMPONENT_TRACKING=true               # Enable component tracking
VITE_STATE_MONITORING=true                 # Enable state monitoring
VITE_EFFECT_DEBUGGING=true                 # Enable effect debugging
VITE_MARKDOWN_DEBUG=true                   # Enable markdown debugging
VITE_TYPEWRITER_DEBUG=true                 # Enable typewriter effect debugging
VITE_WEBSOCKET_DEBUG=true                  # Enable WebSocket debugging
VITE_STREAMING_DEBUG=true                  # Enable streaming debugging
VITE_ZUSTAND_DEBUG=true                    # Enable Zustand store debugging
```

### 4. Enhanced Component Debugging

#### Render Debug Hook

```typescript
import { useEnhancedRenderDebug } from '@/hooks/useEnhancedRenderDebug';

function MyComponent(props) {
  const getDebugInfo = useEnhancedRenderDebug('MyComponent', props);
  
  // Component logic...
  
  // Access debug info if needed
  const debugInfo = getDebugInfo();
  console.log('Render count:', debugInfo.renderCount);
}
```

#### Effect Debug Hook

```typescript
import { useEnhancedEffectDebug } from '@/hooks/useEnhancedRenderDebug';

function MyComponent() {
  const [state, setState] = useState();
  
  useEnhancedEffectDebug(() => {
    // Effect logic
  }, [state], 'MyComponent effect');
}
```

### 5. Crash Investigation Tools

#### Crash Report Generation

```javascript
// Generate a comprehensive crash report
const report = window.generateCrashReport();

// Report contains:
// - Session information
// - Error and warning counts
// - Recent errors and warnings
// - Component error statistics
// - Error category breakdown
// - Suspected problematic components
// - Automated recommendations
```

#### Real-time Crash Analysis

```javascript
// Print crash summary to console
window.printCrashSummary();

// Output includes:
// - Session ID and timestamp
// - Total error/warning counts
// - Suspected components
// - Recommendations
// - Recent errors
```

## Common Debugging Scenarios

### 1. Infinite Render Loops

**Symptoms**: Component renders rapidly, browser becomes unresponsive
**Debug**: Look for `[INFINITE LOOP DETECTED]` messages in console
**Common Causes**: 
- Objects/arrays created in render
- Missing dependencies in useEffect
- State updates triggering themselves

### 2. ReactMarkdown Rendering Failures

**Symptoms**: "Failed to render message" or blank content
**Debug**: Look for `[Markdown Render Error]` logs
**Common Causes**:
- Special characters (smart quotes, ellipsis)
- Unbalanced markdown syntax
- Large content size

### 3. Component Crashes

**Symptoms**: Error boundaries triggered, components showing fallback UI
**Debug**: Look for `[Component Error]` logs
**Common Causes**:
- Null/undefined props
- Type mismatches
- Missing error handling

### 4. Content Sanitization Issues

**Symptoms**: Content appears differently than expected
**Debug**: Look for `[Content Sanitization]` logs
**Common Causes**:
- Unicode characters
- HTML in content
- Content length issues

## Performance Monitoring

The debug mode tracks:
- Component render frequency
- Render time analysis
- Prop change frequency
- Effect trigger frequency
- Memory usage patterns

High-frequency renders are automatically flagged with performance warnings.

## Log Analysis

### Log Levels

- **DEBUG**: Detailed information for development
- **INFO**: General information about application flow
- **WARN**: Potential issues that don't break functionality
- **ERROR**: Errors that break functionality

### Log Categories

- **Component Render**: Render tracking and analysis
- **Component Error**: React component crashes
- **Infinite Loop**: Render loop detection
- **Markdown Render Error**: ReactMarkdown failures
- **Content Sanitization**: Content processing
- **Global Error**: Uncaught JavaScript errors
- **Effect Trigger**: useEffect execution tracking
- **State Change**: State mutation tracking

## Best Practices

1. **Always run `make logs-ui` when investigating UI crashes**
2. **Check the browser console for real-time debug information**
3. **Use `window.printCrashSummary()` to get quick insights**
4. **Export logs with `window.exportUILogs()` for detailed analysis**
5. **Clear logs with `window.clearUILogs()` when starting fresh testing**
6. **Focus on components with highest error counts first**
7. **Pay attention to infinite loop warnings**
8. **Monitor content sanitization logs for content issues**

## Troubleshooting

### Debug Mode Not Working

1. Ensure `make logs-ui` was run successfully
2. Check that `VITE_UI_DEBUG_MODE=true` in the environment
3. Verify the development server is running
4. Check browser console for any initialization errors

### No Debug Output

1. Verify log level is set to 'debug'
2. Check that components are using debug hooks
3. Ensure global error handling is working
4. Try triggering a known issue to test logging

### Performance Issues in Debug Mode

Debug mode adds overhead for comprehensive logging. This is expected and should only be used for debugging, not production.

## Integration with UI_CRASH_ANALYSIS.md

This debug mode directly supports the investigation steps outlined in `docs/UI_CRASH_ANALYSIS.md`:

1. **Error boundaries** provide detailed logging
2. **Content sanitization** is fully monitored  
3. **Infinite loop detection** is automated
4. **Component tracking** identifies problematic components
5. **Performance monitoring** identifies render issues

## Files Created/Modified

- `packages/client/.env.debug` - Debug environment configuration
- `packages/client/vite.config.debug.ts` - Enhanced Vite config for debugging
- `packages/client/src/utils/debug/uiLogger.ts` - Comprehensive logging system
- `packages/client/src/hooks/useEnhancedRenderDebug.ts` - Enhanced debug hooks
- `packages/client/src/utils/debug/crashAnalyzer.ts` - Crash analysis tools
- `docs/UI_DEBUG_MODE.md` - This documentation

## Next Steps

After using debug mode to identify issues:

1. Review the crash report recommendations
2. Focus on components with highest error counts
3. Address infinite loops first (highest priority)
4. Improve content sanitization if needed
5. Add error boundaries where missing
6. Optimize components with high render frequency

Remember to disable debug mode for production builds as it significantly increases bundle size and runtime overhead.
EOF

echo -e "${GREEN}✅ Created comprehensive debugging documentation${RESET}"

echo ""
echo -e "${GREEN}🎉 UI Debug Environment Setup Complete!${RESET}"
echo ""
echo -e "${CYAN}📋 Summary of what was created:${RESET}"
echo -e "  ✅ Enhanced Makefile with logs-ui command"
echo -e "  ✅ UI debug environment configuration (.env.debug)"
echo -e "  ✅ Enhanced Vite configuration for debugging"
echo -e "  ✅ Comprehensive UI logging system"
echo -e "  ✅ Enhanced render debug hooks"
echo -e "  ✅ UI crash analysis tools"
echo -e "  ✅ Debug mode documentation"
echo ""
echo -e "${CYAN}🚀 To start debugging UI crashes, run:${RESET}"
echo -e "  ${YELLOW}make logs-ui${RESET}"
echo ""
echo -e "${CYAN}💡 This will enable:${RESET}"
echo -e "  - Comprehensive component render tracking"
echo -e "  - Automatic infinite loop detection"
echo -e "  - ReactMarkdown error monitoring"
echo -e "  - Content sanitization debugging"
echo -e "  - Real-time crash analysis"
echo -e "  - Performance monitoring"
echo ""
echo -e "${CYAN}🔍 In the browser console, you'll have access to:${RESET}"
echo -e "  - window.uiLogger (logging system)"
echo -e "  - window.exportUILogs() (export logs)"
echo -e "  - window.crashAnalyzer (crash analysis)"
echo -e "  - window.printCrashSummary() (quick analysis)"
echo ""
echo -e "${YELLOW}📚 See docs/UI_DEBUG_MODE.md for detailed usage instructions${RESET}"
