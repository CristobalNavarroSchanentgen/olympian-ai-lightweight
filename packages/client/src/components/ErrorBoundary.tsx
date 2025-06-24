import { Component, ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Error message:', error.message);
    console.error('[ErrorBoundary] Error stack:', error.stack);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    // Log additional details if available
    if (error.name) {
      console.error('[ErrorBoundary] Error name:', error.name);
    }
    if ((error as any).cause) {
      console.error('[ErrorBoundary] Error cause:', (error as any).cause);
    }
  }

  public render() {
    if (this.state.hasError) {
      // Return the custom fallback if provided, otherwise use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI with more details
      return (
        <div className="p-4 border border-red-500 rounded-md bg-red-50 dark:bg-red-900/20">
          <h2 className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
            Error rendering content
          </h2>
          <details className="text-xs text-red-700 dark:text-red-300">
            <summary className="cursor-pointer hover:underline">
              Show error details
            </summary>
            <pre className="mt-2 whitespace-pre-wrap font-mono overflow-x-auto">
              {this.state.error?.message || 'Unknown error'}
              {this.state.error?.stack && (
                <>
                  {'\n\nStack trace:\n'}
                  {this.state.error.stack}
                </>
              )}
            </pre>
          </details>
          <p className="text-xs text-red-600 dark:text-red-400 mt-2">
            Please try refreshing the page. If the problem persists, please report this issue.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
