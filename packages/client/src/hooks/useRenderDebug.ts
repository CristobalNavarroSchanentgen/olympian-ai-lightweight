import { useEffect, useRef } from 'react';

/**
 * Debug hook to track component renders and identify infinite loops
 */
export function useRenderDebug(componentName: string, props?: Record<string, any>) {
  const renderCount = useRef(0);
  const prevPropsRef = useRef<Record<string, any> | undefined>(props);
  const renderTimesRef = useRef<number[]>([]);

  useEffect(() => {
    renderCount.current += 1;
    const now = Date.now();
    renderTimesRef.current.push(now);

    // Keep only last 10 render times
    if (renderTimesRef.current.length > 10) {
      renderTimesRef.current = renderTimesRef.current.slice(-10);
    }

    // Check for rapid re-renders (more than 5 renders in 100ms)
    const recentRenders = renderTimesRef.current.filter(time => now - time < 100);
    if (recentRenders.length > 5) {
      console.error(`[INFINITE LOOP DETECTED] ${componentName} rendered ${recentRenders.length} times in 100ms!`);
      console.trace('Stack trace:');
    }

    console.log(`[Render Debug] ${componentName} rendered ${renderCount.current} times`);

    // Log prop changes if props are provided
    if (props && prevPropsRef.current) {
      const changedProps: string[] = [];
      
      Object.keys(props).forEach(key => {
        if (props[key] !== prevPropsRef.current![key]) {
          changedProps.push(key);
        }
      });

      if (changedProps.length > 0) {
        console.log(`[Render Debug] ${componentName} props changed:`, changedProps);
        changedProps.forEach(key => {
          console.log(`  ${key}:`, prevPropsRef.current![key], '→', props[key]);
        });
      }
    }

    prevPropsRef.current = props;
  });

  // Log on unmount
  useEffect(() => {
    return () => {
      console.log(`[Render Debug] ${componentName} unmounted after ${renderCount.current} renders`);
    };
  }, [componentName]);
}

/**
 * Hook to debug useEffect dependencies
 */
export function useEffectDebug(
  effect: () => void | (() => void),
  deps: React.DependencyList,
  debugName: string
) {
  const prevDepsRef = useRef<React.DependencyList>();

  useEffect(() => {
    if (prevDepsRef.current) {
      const changedDeps: number[] = [];
      
      deps.forEach((dep, index) => {
        if (dep !== prevDepsRef.current![index]) {
          changedDeps.push(index);
        }
      });

      if (changedDeps.length > 0) {
        console.log(`[Effect Debug] ${debugName} effect triggered. Changed deps:`, changedDeps);
        changedDeps.forEach(index => {
          console.log(`  deps[${index}]:`, prevDepsRef.current![index], '→', deps[index]);
        });
      }
    }

    prevDepsRef.current = deps;
    return effect();
  }, deps);
}
