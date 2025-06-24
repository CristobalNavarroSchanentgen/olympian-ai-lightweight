import { Component, ReactNode, ErrorInfo } from 'react';
import { uiLogger } from '@/utils/debug/uiLogger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string; // Optional component name for better debugging
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  private errorCount = 0;
  private isDebugMode = false;

  public state: State = {
    hasError: false,
    error: null,
    errorId: null,
  };

  constructor(props: Props) {
    super(props);
    
    // Check if debug mode is enabled
    this.isDebugMode = import.meta.env.VITE_UI_DEBUG_MODE === 'true' || 
                       import.meta.env.VITE_ERROR_BOUNDARY_DEBUG === 'true';
  }

  public static getDerivedStateFromError(error: Error): State {
    // Generate unique error ID for tracking
    const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return { 
      hasError: true, 
      error,
      errorId 
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.errorCount++;
    const componentName = this.props.componentName || 'Unknown Component';
    const componentStack = errorInfo.componentStack || 'No component stack available';
    
    // Enhanced logging for debug mode
    if (this.isDebugMode) {
      console.group(`🚨 [ErrorBoundary] Component Crash #${this.errorCount} - ${componentName}`);
      console.error('Error:', error);
      console.error('Error message:', error.message);
      console.error('Error name:', error.name);
      console.error('Error stack:', error.stack);
      console.error('Component stack:', componentStack);
      
      // Additional debug information
      console.log('Error ID:', this.state.errorId);
      console.log('Timestamp:', new Date().toISOString());
      console.log('User Agent:', navigator.userAgent);
      console.log('URL:', window.location.href);
      
      // Check for React-specific errors
      if (error.message.includes('Minified React error')) {
        console.warn('This is a minified React error. Enable development mode for better error messages.');
      }
      
      // Check for common error patterns
      if (error.message.includes('Cannot read properties of undefined')) {
        console.warn('💡 Tip: This error often indicates accessing properties of undefined/null objects');
      }
      
      if (error.message.includes('Maximum update depth exceeded')) {
        console.warn('💡 Tip: This indicates an infinite re-render loop. Check useEffect dependencies.');
      }
      
      console.groupEnd();
    } else {
      // Standard logging for production
      console.error('[ErrorBoundary] Caught error:', error);
      console.error('[ErrorBoundary] Component stack:', componentStack);
    }
    
    // Log to UI logger
    try {
      uiLogger.componentError(componentName, error, {
        componentStack,
        errorId: this.state.errorId,
        errorCount: this.errorCount,
        props: this.isDebugMode ? this.props : undefined, // Only log props in debug mode
      });
    } catch (logError) {
      console.warn('[ErrorBoundary] Failed to log to UI logger:', logError);
    }
    
    // Additional error tracking based on error type
    this.analyzeError(error, errorInfo);
  }

  private analyzeError(error: Error, errorInfo: ErrorInfo) {
    if (!this.isDebugMode) return;
    
    console.group('🔍 [ErrorBoundary] Error Analysis');
    
    // Analyze error patterns
    const errorPatterns = [
      {
        pattern: /Cannot read properties of (undefined|null)/,
        advice: 'Add null/undefined checks before accessing object properties',
        category: 'Null Reference'
      },
      {
        pattern: /Maximum update depth exceeded/,
        advice: 'Check useEffect dependencies and avoid state updates that trigger themselves',
        category: 'Infinite Loop'
      },
      {
        pattern: /Cannot access before initialization/,
        advice: 'Variable is being used before it\'s declared (temporal dead zone)',
        category: 'Initialization Error'
      },
      {
        pattern: /is not a function/,
        advice: 'Check if the variable is actually a function and is properly imported',
        category: 'Type Error'
      },
      {
        pattern: /ReactMarkdown/,
        advice: 'Check content being passed to ReactMarkdown for special characters or invalid structure',
        category: 'Markdown Error'
      }
    ];
    
    const matchedPattern = errorPatterns.find(p => p.pattern.test(error.message));
    if (matchedPattern) {
      console.log('🎯 Error Category:', matchedPattern.category);
      console.log('💡 Suggestion:', matchedPattern.advice);
    }
    
    // Analyze component stack for problematic components
    const componentStack = errorInfo.componentStack || '';
    const componentMatches = componentStack.match(/at (\w+)/g);
    if (componentMatches) {
      console.log('📍 Component Chain:', componentMatches.map(match => match.replace('at ', '')));
    }
    
    console.groupEnd();
  }

  public render() {
    if (this.state.hasError) {
      // Return the custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Enhanced error UI with debug features
      const componentName = this.props.componentName || 'Unknown Component';
      
      return (
        <div className="p-4 border border-red-500 rounded-md bg-red-50 dark:bg-red-900/20">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <span className="text-red-600 dark:text-red-400 text-xl">⚠️</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-800 dark:text-red-200 mb-1">
                Component Error
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300 mb-3">
                The <code className="bg-red-100 dark:bg-red-800 px-1 rounded">{componentName}</code> component encountered an error and crashed.
              </p>
              
              {this.isDebugMode && (
                <div className="mb-3">
                  <div className="text-xs text-red-600 dark:text-red-400 mb-1">
                    <strong>Error ID:</strong> {this.state.errorId}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400 mb-1">
                    <strong>Error Count:</strong> {this.errorCount}
                  </div>
                  <div className="text-xs text-red-600 dark:text-red-400">
                    <strong>Debug Mode:</strong> Enabled (check console for detailed logs)
                  </div>
                </div>
              )}
              
              <details className="text-xs text-red-700 dark:text-red-300 mb-3">
                <summary className="cursor-pointer hover:underline font-medium mb-2">
                  {this.isDebugMode ? 'Show detailed error information' : 'Show error details'}
                </summary>
                <div className="bg-red-100 dark:bg-red-900/40 p-2 rounded border">
                  <div className="font-mono text-xs break-words">
                    <div className="mb-2">
                      <strong>Error:</strong> {this.state.error?.name || 'Unknown'}
                    </div>
                    <div className="mb-2">
                      <strong>Message:</strong> {this.state.error?.message || 'No message available'}
                    </div>
                    {this.isDebugMode && this.state.error?.stack && (
                      <details className="mt-2">
                        <summary className="cursor-pointer hover:underline">Stack trace</summary>
                        <pre className="mt-1 whitespace-pre-wrap text-xs overflow-x-auto max-h-32 overflow-y-auto">
                          {this.state.error.stack}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </details>
              
              <div className="space-y-2">
                <button
                  onClick={() => {
                    this.setState({ hasError: false, error: null, errorId: null });
                    this.errorCount = 0;
                  }}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition-colors"
                >
                  Try Again
                </button>
                
                {this.isDebugMode && (
                  <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                    <div>
                      <strong>Debug Tools:</strong>
                    </div>
                    <div>
                      • Run <code className="bg-red-100 dark:bg-red-800 px-1 rounded">window.printCrashSummary()</code> in console
                    </div>
                    <div>
                      • Export logs with <code className="bg-red-100 dark:bg-red-800 px-1 rounded">window.exportUILogs()</code>
                    </div>
                    <div>
                      • Check component render history for infinite loops
                    </div>
                  </div>
                )}
                
                <p className="text-xs text-red-600 dark:text-red-400">
                  If this error persists, please report it with the error ID: <code className="bg-red-100 dark:bg-red-800 px-1 rounded">{this.state.errorId}</code>
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
