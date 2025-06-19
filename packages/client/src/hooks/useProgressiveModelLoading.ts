import { useState, useEffect, useCallback, useRef } from 'react';
import { ModelCapability } from '@olympian/shared';
import { api } from '../services/api';

interface ProgressiveUpdate {
  type: 'model_processed' | 'vision_model_found' | 'loading_complete' | 'error' | 'initial_state';
  model?: string;
  capability?: ModelCapability;
  isVisionModel?: boolean;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  state?: {
    totalModels: number;
    processedModels: number;
    capabilities: ModelCapability[];
    visionModels: string[];
    isComplete: boolean;
    startTime: number;
    errors: Array<{ model: string; error: string }>;
  };
  error?: string;
}

interface UseProgressiveModelLoadingOptions {
  autoStart?: boolean;
  onVisionModelFound?: (model: string, capability: ModelCapability) => void;
  onModelProcessed?: (model: string, capability: ModelCapability) => void;
  onLoadingComplete?: (state: ProgressiveUpdate['state']) => void;
  onError?: (error: string, model?: string) => void;
}

interface UseProgressiveModelLoadingReturn {
  // State
  capabilities: ModelCapability[];
  visionModels: string[];
  isLoading: boolean;
  isComplete: boolean;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  errors: Array<{ model: string; error: string }>;
  
  // Statistics
  stats: {
    totalTime: number;
    averageTimePerModel: number;
    successRate: number;
  };
  
  // Actions
  startLoading: (forceReload?: boolean) => Promise<void>;
  clearCache: () => Promise<void>;
  
  // Connection status
  isConnected: boolean;
  connectionError: string | null;
}

/**
 * Hook for progressive model capability loading with real-time updates
 * 
 * This hook provides:
 * - Progressive loading of model capabilities that doesn't timeout
 * - Real-time updates as models are processed
 * - Automatic caching and cache management
 * - Error handling and fallback behavior
 * - Connection status monitoring
 * 
 * Usage:
 * ```tsx
 * const {
 *   capabilities,
 *   visionModels,
 *   isLoading,
 *   progress,
 *   startLoading
 * } = useProgressiveModelLoading({
 *   autoStart: true,
 *   onVisionModelFound: (model) => console.log('Vision model found:', model)
 * });
 * ```
 */
export function useProgressiveModelLoading(options: UseProgressiveModelLoadingOptions = {}): UseProgressiveModelLoadingReturn {
  const {
    autoStart = false,
    onVisionModelFound,
    onModelProcessed,
    onLoadingComplete,
    onError
  } = options;

  // State
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);
  const [visionModels, setVisionModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [errors, setErrors] = useState<Array<{ model: string; error: string }>>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<number>(0);

  // Refs
  const eventSourceRef = useRef<EventSource | null>(null);
  const isInitializedRef = useRef(false);

  // Statistics
  const stats = {
    totalTime: startTime ? Date.now() - startTime : 0,
    averageTimePerModel: progress.current > 0 ? (Date.now() - startTime) / progress.current : 0,
    successRate: progress.total > 0 ? ((progress.current - errors.length) / progress.total) * 100 : 0
  };

  // Handle progressive updates
  const handleProgressiveUpdate = useCallback((update: ProgressiveUpdate) => {
    console.log('📡 [Progressive] Received update:', update.type, update.progress);

    switch (update.type) {
      case 'initial_state':
        if (update.state) {
          setCapabilities(update.state.capabilities || []);
          setVisionModels(update.state.visionModels || []);
          setIsComplete(update.state.isComplete || false);
          setErrors(update.state.errors || []);
          setProgress({
            current: update.state.processedModels || 0,
            total: update.state.totalModels || 0,
            percentage: update.state.totalModels > 0 
              ? Math.round(((update.state.processedModels || 0) / update.state.totalModels) * 100)
              : 0
          });
          if (update.state.startTime) {
            setStartTime(update.state.startTime);
          }
        }
        break;

      case 'model_processed':
        if (update.capability) {
          setCapabilities(prev => {
            const existing = prev.find(cap => cap.name === update.capability!.name);
            if (existing) {
              return prev; // Already exists, don't duplicate
            }
            return [...prev, update.capability!];
          });
          
          if (update.progress) {
            setProgress(update.progress);
          }
          
          if (onModelProcessed && update.model && update.capability) {
            onModelProcessed(update.model, update.capability);
          }
        }
        break;

      case 'vision_model_found':
        if (update.model && update.capability) {
          setVisionModels(prev => {
            if (prev.includes(update.model!)) {
              return prev; // Already exists
            }
            return [...prev, update.model!];
          });
          
          if (onVisionModelFound) {
            onVisionModelFound(update.model, update.capability);
          }
        }
        break;

      case 'loading_complete':
        setIsComplete(true);
        setIsLoading(false);
        if (update.state && onLoadingComplete) {
          onLoadingComplete(update.state);
        }
        console.log('✅ [Progressive] Loading completed');
        break;

      case 'error':
        if (update.error && update.model) {
          setErrors(prev => [...prev, { model: update.model!, error: update.error! }]);
          if (onError) {
            onError(update.error, update.model);
          }
        }
        break;
    }
  }, [onVisionModelFound, onModelProcessed, onLoadingComplete, onError]);

  // Start progressive loading
  const startLoading = useCallback(async (forceReload = false) => {
    try {
      console.log('🚀 [Progressive] Starting progressive loading...', { forceReload });
      
      setIsLoading(true);
      setConnectionError(null);
      setStartTime(Date.now());
      
      // Start the progressive loading on the backend
      const response = await api.startProgressiveLoading(forceReload);
      console.log('📊 [Progressive] Loading started:', response);
      
      // If we have cached data, use it immediately
      if (response.cached && response.data) {
        const state = response.data;
        setCapabilities(state.capabilities || []);
        setVisionModels(state.visionModels || []);
        setIsComplete(state.isComplete || false);
        setErrors(state.errors || []);
        setProgress({
          current: state.processedModels || 0,
          total: state.totalModels || 0,
          percentage: state.totalModels > 0 
            ? Math.round(((state.processedModels || 0) / state.totalModels) * 100)
            : 0
        });
        setIsLoading(false);
        return;
      }
      
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      
      // Create new SSE connection for real-time updates
      const eventSource = api.createProgressiveLoadingStream(
        handleProgressiveUpdate,
        (error) => {
          console.error('❌ [Progressive] Stream error:', error);
          setConnectionError('Connection lost');
          setIsConnected(false);
          setIsLoading(false);
        }
      );
      
      eventSourceRef.current = eventSource;
      
      // Monitor connection
      eventSource.onopen = () => {
        console.log('✅ [Progressive] Stream connected');
        setIsConnected(true);
        setConnectionError(null);
      };
      
    } catch (error) {
      console.error('❌ [Progressive] Failed to start loading:', error);
      setIsLoading(false);
      setConnectionError(error instanceof Error ? error.message : 'Unknown error');
      
      if (onError) {
        onError(error instanceof Error ? error.message : 'Unknown error');
      }
    }
  }, [handleProgressiveUpdate, onError]);

  // Clear cache
  const clearCache = useCallback(async () => {
    try {
      console.log('🗑️ [Progressive] Clearing cache...');
      await api.clearProgressiveCache();
      
      // Reset local state
      setCapabilities([]);
      setVisionModels([]);
      setIsComplete(false);
      setErrors([]);
      setProgress({ current: 0, total: 0, percentage: 0 });
      setStartTime(0);
      
      console.log('✅ [Progressive] Cache cleared');
    } catch (error) {
      console.error('❌ [Progressive] Failed to clear cache:', error);
      throw error;
    }
  }, []);

  // Auto-start if requested
  useEffect(() => {
    if (autoStart && !isInitializedRef.current) {
      isInitializedRef.current = true;
      startLoading();
    }
  }, [autoStart, startLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        console.log('🔌 [Progressive] Closing SSE connection');
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    // State
    capabilities,
    visionModels,
    isLoading,
    isComplete,
    progress,
    errors,
    
    // Statistics
    stats,
    
    // Actions
    startLoading,
    clearCache,
    
    // Connection status
    isConnected,
    connectionError
  };
}

/**
 * Simplified hook for just getting vision models progressively
 */
export function useProgressiveVisionModels(autoStart = true) {
  const [visionModels, setVisionModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoStart) return;

    const loadVisionModels = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const models = await api.getProgressiveVisionModels();
        setVisionModels(models);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('❌ Failed to load vision models:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadVisionModels();
  }, [autoStart]);

  return { visionModels, isLoading, error };
}

/**
 * Simplified hook for just getting model capabilities progressively
 */
export function useProgressiveCapabilities(autoStart = true) {
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!autoStart) return;

    const loadCapabilities = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const caps = await api.getProgressiveModelCapabilities();
        setCapabilities(caps);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        console.error('❌ Failed to load capabilities:', err);
      } finally {
        setIsLoading(false);
      }
    };

    loadCapabilities();
  }, [autoStart]);

  return { capabilities, isLoading, error };
}
