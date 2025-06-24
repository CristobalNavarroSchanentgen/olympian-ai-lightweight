import { useEffect, useRef, useCallback } from 'react';

// Import UI logger for enhanced debugging
let uiLogger: any = null;
const isDebugMode = import.meta.env.VITE_UI_DEBUG_MODE === 'true' || 
                   import.meta.env.VITE_RENDER_DEBUG === 'true';

// Dynamic import of UI logger
if (isDebugMode) {
  try {
    import('@/utils/debug/uiLogger').then(module => {
      uiLogger = module.uiLogger;
    }).catch(() => {
      console.debug('[useRenderDebug] UI debug logger not available');
    });
  } catch {
    // Fallback for environments where dynamic imports aren't supported
  }
}

/**
 * Enhanced render debug hook with comprehensive tracking
 * Integrates with the new UI debug system for better crash investigation
 */
export function useRenderDebug(componentName: string, props?: Record<string, any>) {
  const renderCount = useRef(0);
  const prevPropsRef = useRef<Record<string, any> | undefined>(props);
  const renderTimesRef = useRef<number[]>([]);
  const firstRenderTime = useRef<number>(Date.now());

  useEffect(() => {
    if (!isDebugMode) return;

    renderCount.current += 1;
    const now = Date.now();
    renderTimesRef.current.push(now);

    // Keep only last 20 render times for analysis
    if (renderTimesRef.current.length > 20) {
      renderTimesRef.current = renderTimesRef.current.slice(-20);
    }

    // Enhanced infinite loop detection with multiple time windows
    const checkInfiniteLoop = (windowMs: number, maxRenders: number, severity: 'warning' | 'error') => {
      const recentRenders = renderTimesRef.current.filter(time => now - time < windowMs);
      if (recentRenders.length > maxRenders) {
        const message = `${componentName} rendered ${recentRenders.length} times in ${windowMs}ms!`;
        
        if (severity === 'error') {
          console.error(`[INFINITE LOOP DETECTED] ${message}`);
          console.trace('Component stack trace:');
          
          // Log to UI logger if available
          if (uiLogger) {
            uiLogger.infiniteLoopDetected(componentName, recentRenders.length, windowMs);
          }
        } else {
          console.warn(`[HIGH RENDER FREQUENCY] ${message}`);
        }
        
        return true;
      }
      return false;
    };

    // Check different severity levels
    const hasInfiniteLoop = checkInfiniteLoop(100, 5, 'error');   // Critical: 5 renders in 100ms
    const hasHighFrequency = checkInfiniteLoop(1000, 15, 'warning'); // Warning: 15 renders in 1 second

    if (hasInfiniteLoop) {
      // Additional analysis for infinite loops
      console.group(`[INFINITE LOOP ANALYSIS] ${componentName}`);
      console.log('Render timeline:', renderTimesRef.current.map((time, i) => ({
        render: i + 1,
        timestamp: new Date(time).toISOString(),
        timeSincePrevious: i > 0 ? time - renderTimesRef.current[i - 1] : 0,
        timeSinceFirst: time - firstRenderTime.current,
      })));
      console.log('Current props:', props);
      console.log('Previous props:', prevPropsRef.current);
      
      // Analyze prop changes for potential causes
      if (props && prevPropsRef.current) {
        const suspiciousProps = analyzePropsForInfiniteLoop(props, prevPropsRef.current);
        if (suspiciousProps.length > 0) {
          console.warn('Suspicious props that might cause infinite loops:', suspiciousProps);
        }
      }
      
      console.groupEnd();
    }

    // Log render with enhanced information
    if (uiLogger) {
      uiLogger.componentRender(componentName, props, renderCount.current);
    }

    // Enhanced prop change analysis
    if (props && prevPropsRef.current) {
      const propAnalysis = analyzePropsChanges(props, prevPropsRef.current);
      
      if (propAnalysis.hasChanges) {
        const logLevel = hasInfiniteLoop ? 'error' : hasHighFrequency ? 'warn' : 'debug';
        
        console.group(`[PROP CHANGES] ${componentName} render #${renderCount.current}`);
        
        if (propAnalysis.changedProps.length > 0) {
          console.log('Changed props:', propAnalysis.changedProps);
        }
        if (propAnalysis.addedProps.length > 0) {
          console.log('Added props:', propAnalysis.addedProps);
        }
        if (propAnalysis.removedProps.length > 0) {
          console.log('Removed props:', propAnalysis.removedProps);
        }
        
        // Enhanced warnings for common issues
        propAnalysis.warnings.forEach(warning => {
          console.warn(`💡 ${warning}`);
        });
        
        console.groupEnd();
      }
    }

    prevPropsRef.current = props;

    // Performance monitoring with enhanced metrics
    if (renderCount.current % 10 === 0 && renderCount.current > 10) {
      const totalTime = now - firstRenderTime.current;
      const averageRenderInterval = totalTime / renderCount.current;
      
      console.log(`[PERFORMANCE] ${componentName} performance summary:`, {
        totalRenders: renderCount.current,
        totalTime: `${totalTime}ms`,
        averageInterval: `${averageRenderInterval.toFixed(2)}ms`,
        rendersPerSecond: (renderCount.current / (totalTime / 1000)).toFixed(2)
      });
    }
  });

  // Enhanced unmount logging with summary
  useEffect(() => {
    return () => {
      if (isDebugMode) {
        const totalTime = renderTimesRef.current.length > 1 
          ? renderTimesRef.current[renderTimesRef.current.length - 1] - firstRenderTime.current
          : 0;
        
        const summary = {
          totalRenders: renderCount.current,
          totalTime,
          averageRenderTime: totalTime / renderCount.current || 0,
          componentLifetime: `${totalTime}ms`
        };
        
        console.log(`[UNMOUNT] ${componentName} unmounted:`, summary);
        
        if (uiLogger) {
          uiLogger.debug('Component Unmount', `${componentName} unmounted`, summary, componentName);
        }
      }
    };
  }, [componentName]);

  // Return enhanced debug utilities
  return useCallback(() => ({
    renderCount: renderCount.current,
    renderTimes: [...renderTimesRef.current],
    averageRenderTime: renderTimesRef.current.length > 1 
      ? (renderTimesRef.current[renderTimesRef.current.length - 1] - renderTimesRef.current[0]) / (renderTimesRef.current.length - 1)
      : 0,
    totalLifetime: renderTimesRef.current.length > 0 
      ? renderTimesRef.current[renderTimesRef.current.length - 1] - firstRenderTime.current
      : 0,
    rendersPerSecond: renderTimesRef.current.length > 1 
      ? renderCount.current / ((renderTimesRef.current[renderTimesRef.current.length - 1] - firstRenderTime.current) / 1000)
      : 0
  }), []);
}

/**
 * Analyze prop changes for potential infinite loop causes
 */
function analyzePropsForInfiniteLoop(currentProps: Record<string, any>, prevProps: Record<string, any>): string[] {
  const suspicious: string[] = [];
  
  Object.keys(currentProps).forEach(key => {
    const current = currentProps[key];
    const previous = prevProps[key];
    
    // Check for object/array recreation
    if (typeof current === 'object' && typeof previous === 'object' && 
        current !== previous && JSON.stringify(current) === JSON.stringify(previous)) {
      suspicious.push(`${key}: object/array recreated with same content`);
    }
    
    // Check for function recreation
    if (typeof current === 'function' && typeof previous === 'function' && current !== previous) {
      suspicious.push(`${key}: function recreated (consider useCallback)`);
    }
    
    // Check for Date objects being recreated
    if (current instanceof Date && previous instanceof Date && 
        current.getTime() === previous.getTime() && current !== previous) {
      suspicious.push(`${key}: Date object recreated with same time`);
    }
  });
  
  return suspicious;
}

/**
 * Enhanced prop change analysis
 */
function analyzePropsChanges(currentProps: Record<string, any>, prevProps: Record<string, any>) {
  const changedProps: Array<{key: string, from: any, to: any, type: string}> = [];
  const addedProps: Array<{key: string, value: any, type: string}> = [];
  const removedProps: Array<{key: string, value: any, type: string}> = [];
  const warnings: string[] = [];
  
  // Check for changed and removed props
  Object.keys(prevProps).forEach(key => {
    if (!(key in currentProps)) {
      removedProps.push({ 
        key, 
        value: prevProps[key], 
        type: typeof prevProps[key] 
      });
    } else if (currentProps[key] !== prevProps[key]) {
      const changeType = typeof currentProps[key];
      changedProps.push({ 
        key, 
        from: prevProps[key], 
        to: currentProps[key], 
        type: changeType 
      });
      
      // Generate specific warnings
      if (changeType === 'object' && currentProps[key] && prevProps[key]) {
        if (JSON.stringify(currentProps[key]) === JSON.stringify(prevProps[key])) {
          warnings.push(`Prop '${key}' object identity changed but content is identical (consider useMemo)`);
        }
      } else if (changeType === 'function') {
        warnings.push(`Prop '${key}' function identity changed (consider useCallback)`);
      }
    }
  });

  // Check for added props
  Object.keys(currentProps).forEach(key => {
    if (!(key in prevProps)) {
      addedProps.push({ 
        key, 
        value: currentProps[key], 
        type: typeof currentProps[key] 
      });
    }
  });
  
  return {
    hasChanges: changedProps.length > 0 || addedProps.length > 0 || removedProps.length > 0,
    changedProps,
    addedProps,
    removedProps,
    warnings
  };
}

/**
 * Enhanced effect debug hook with comprehensive dependency analysis
 */
export function useEffectDebug(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  debugName: string,
  componentName?: string
) {
  const prevDepsRef = useRef<React.DependencyList>();
  const effectRunCount = useRef(0);
  const firstRunTime = useRef<number>();

  useEffect(() => {
    if (!isDebugMode) return effect();

    effectRunCount.current += 1;
    const now = Date.now();
    
    if (!firstRunTime.current) {
      firstRunTime.current = now;
    }

    if (prevDepsRef.current) {
      const depAnalysis = analyzeDependencyChanges(deps, prevDepsRef.current);
      
      if (depAnalysis.hasChanges) {
        console.group(`[EFFECT] ${debugName} (run #${effectRunCount.current})`);
        console.log('Changed dependencies:', depAnalysis.changedDeps);
        console.log('Dependency analysis:', depAnalysis.analysis);
        
        // Enhanced warnings
        depAnalysis.warnings.forEach(warning => {
          console.warn(`⚠️ ${warning}`);
        });
        
        // Performance warning for frequent effect runs
        if (effectRunCount.current > 10) {
          const timeSinceFirst = now - (firstRunTime.current || now);
          const avgRunInterval = timeSinceFirst / effectRunCount.current;
          
          if (avgRunInterval < 100) { // Running more than 10 times per second
            console.warn(`🚨 Effect running very frequently (avg ${avgRunInterval.toFixed(2)}ms between runs)`);
          }
        }
        
        console.groupEnd();

        // Log to UI logger
        if (uiLogger) {
          uiLogger.effectTrigger(componentName || 'Unknown', debugName, deps);
        }
      }
    } else {
      console.log(`[EFFECT] ${debugName} (initial run)`);
    }

    prevDepsRef.current = deps;
    return effect();
  }, deps);
}

/**
 * Analyze dependency changes for useEffect debugging
 */
function analyzeDependencyChanges(currentDeps: React.DependencyList, prevDeps: React.DependencyList) {
  const changedDeps: Array<{index: number, from: any, to: any, analysis: string}> = [];
  const warnings: string[] = [];
  
  currentDeps.forEach((dep, index) => {
    if (dep !== prevDeps[index]) {
      let analysis = 'Value changed';
      
      // Deep analysis of the change
      if (typeof dep === 'object' && typeof prevDeps[index] === 'object') {
        if (dep === null || prevDeps[index] === null) {
          analysis = 'Object became null/undefined';
        } else if (JSON.stringify(dep) === JSON.stringify(prevDeps[index])) {
          analysis = 'Object identity changed but content is identical';
          warnings.push(`Dependency ${index}: Object recreation detected (consider useMemo)`);
        } else {
          analysis = 'Object content changed';
        }
      } else if (typeof dep === 'function') {
        analysis = 'Function identity changed';
        warnings.push(`Dependency ${index}: Function recreation detected (consider useCallback)`);
      } else if (typeof dep !== typeof prevDeps[index]) {
        analysis = `Type changed from ${typeof prevDeps[index]} to ${typeof dep}`;
      }
      
      changedDeps.push({ 
        index, 
        from: prevDeps[index], 
        to: dep, 
        analysis 
      });
    }
  });
  
  return {
    hasChanges: changedDeps.length > 0,
    changedDeps,
    analysis: changedDeps.map(change => `deps[${change.index}]: ${change.analysis}`),
    warnings
  };
}

/**
 * Hook for debugging state changes
 */
export function useStateDebug<T>(
  stateName: string, 
  state: T, 
  componentName?: string
) {
  const prevStateRef = useRef<T>(state);
  
  useEffect(() => {
    if (!isDebugMode) return;
    
    if (prevStateRef.current !== state) {
      const stateChange = {
        stateName,
        from: prevStateRef.current,
        to: state,
        timestamp: new Date().toISOString()
      };
      
      console.log(`[STATE CHANGE] ${componentName || 'Unknown'}.${stateName}:`, stateChange);
      
      // Log to UI logger
      if (uiLogger) {
        uiLogger.stateChange(componentName || 'Unknown', stateName, prevStateRef.current, state);
      }
      
      prevStateRef.current = state;
    }
  }, [state, stateName, componentName]);
}

/**
 * Hook for performance monitoring
 */
export function usePerformanceMonitor(componentName: string, threshold: number = 16) {
  const renderStartTime = useRef<number>();
  
  useEffect(() => {
    if (!isDebugMode) return;
    
    renderStartTime.current = performance.now();
    
    return () => {
      if (renderStartTime.current) {
        const renderTime = performance.now() - renderStartTime.current;
        
        if (renderTime > threshold) {
          console.warn(`[SLOW RENDER] ${componentName} took ${renderTime.toFixed(2)}ms to render (threshold: ${threshold}ms)`);
          
          if (uiLogger) {
            uiLogger.warn('Slow Render', `${componentName} slow render`, {
              renderTime,
              threshold
            }, componentName);
          }
        }
      }
    };
  });
}
