import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { ModelCapability } from '@olympian/shared';
import { OllamaStreamliner } from './OllamaStreamliner';

interface ProgressiveLoadingState {
  totalModels: number;
  processedModels: number;
  capabilities: ModelCapability[];
  visionModels: string[];
  isComplete: boolean;
  startTime: number;
  errors: Array<{ model: string; error: string }>;
}

interface ProgressiveUpdate {
  type: 'model_processed' | 'vision_model_found' | 'loading_complete' | 'error';
  model?: string;
  capability?: ModelCapability;
  isVisionModel?: boolean;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  state?: ProgressiveLoadingState;
  error?: string;
}

/**
 * Progressive Model Loader - Streams model capabilities as they are detected
 * This solves the timeout issue by providing rolling release of models to the UI
 */
export class ModelProgressiveLoader extends EventEmitter {
  private streamliner: OllamaStreamliner;
  private loadingState: ProgressiveLoadingState | null = null;
  private isLoading = false;
  private lastFullLoadTime = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    super();
    this.streamliner = new OllamaStreamliner();
  }

  /**
   * Start progressive loading of all model capabilities
   * Emits events as models are processed
   */
  async startProgressiveLoading(forceReload = false): Promise<ProgressiveLoadingState> {
    // Check if we have recent cached results and don't need to reload
    const now = Date.now();
    if (!forceReload && this.loadingState?.isComplete && 
        (now - this.lastFullLoadTime) < this.CACHE_DURATION) {
      logger.info('✅ Using cached model capabilities (within cache duration)');
      return this.loadingState;
    }

    // Prevent concurrent loading
    if (this.isLoading) {
      logger.info('⏳ Progressive loading already in progress, returning current state');
      return this.loadingState || this.createInitialState();
    }

    this.isLoading = true;
    const startTime = Date.now();
    
    try {
      logger.info('🚀 Starting progressive model capability loading...');
      
      // Get list of all models first
      const models = await this.streamliner.listModels();
      
      // Initialize loading state
      this.loadingState = {
        totalModels: models.length,
        processedModels: 0,
        capabilities: [],
        visionModels: [],
        isComplete: false,
        startTime,
        errors: []
      };

      logger.info(`📊 Will process ${models.length} models progressively`);
      
      // Emit initial state
      this.emit('progress', {
        type: 'loading_started',
        progress: {
          current: 0,
          total: models.length,
          percentage: 0
        },
        state: { ...this.loadingState }
      } as ProgressiveUpdate);

      // Process models with limited concurrency to avoid overwhelming the system
      const concurrencyLimit = 2; // Reduced from 3 for more stable processing
      const chunks = [];
      for (let i = 0; i < models.length; i += concurrencyLimit) {
        chunks.push(models.slice(i, i + concurrencyLimit));
      }

      // Process each chunk and emit progress
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (model) => {
          try {
            logger.debug(`🔍 Processing model: ${model}`);
            const capability = await this.streamliner.detectCapabilities(model);
            
            // Update state
            this.loadingState!.processedModels++;
            this.loadingState!.capabilities.push(capability);
            
            // Track vision models separately
            if (capability.vision) {
              this.loadingState!.visionModels.push(model);
              logger.info(`👁️ Vision model found: ${model}`);
              
              // Emit vision model found event
              this.emit('progress', {
                type: 'vision_model_found',
                model,
                capability,
                isVisionModel: true,
                progress: {
                  current: this.loadingState!.processedModels,
                  total: this.loadingState!.totalModels,
                  percentage: Math.round((this.loadingState!.processedModels / this.loadingState!.totalModels) * 100)
                },
                state: { ...this.loadingState! }
              } as ProgressiveUpdate);
            }
            
            // Emit model processed event
            this.emit('progress', {
              type: 'model_processed',
              model,
              capability,
              isVisionModel: capability.vision,
              progress: {
                current: this.loadingState!.processedModels,
                total: this.loadingState!.totalModels,
                percentage: Math.round((this.loadingState!.processedModels / this.loadingState!.totalModels) * 100)
              },
              state: { ...this.loadingState! }
            } as ProgressiveUpdate);
            
            logger.debug(`✅ Processed model ${model} (${this.loadingState!.processedModels}/${this.loadingState!.totalModels})`);
            
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.warn(`❌ Failed to process model '${model}':`, errorMessage);
            
            // Track error but continue with other models
            this.loadingState!.errors.push({
              model,
              error: errorMessage
            });
            
            // Still increment processed count to keep progress accurate
            this.loadingState!.processedModels++;
            
            // Emit error event
            this.emit('progress', {
              type: 'error',
              model,
              error: errorMessage,
              progress: {
                current: this.loadingState!.processedModels,
                total: this.loadingState!.totalModels,
                percentage: Math.round((this.loadingState!.processedModels / this.loadingState!.totalModels) * 100)
              },
              state: { ...this.loadingState! }
            } as ProgressiveUpdate);
          }
        });
        
        // Wait for this chunk to complete before processing the next
        await Promise.all(chunkPromises);
      }

      // Mark as complete
      this.loadingState.isComplete = true;
      this.lastFullLoadTime = Date.now();
      
      const totalTime = Date.now() - startTime;
      logger.info(`✅ Progressive model loading completed in ${totalTime}ms`, {
        totalModels: this.loadingState.totalModels,
        processedModels: this.loadingState.processedModels,
        visionModels: this.loadingState.visionModels.length,
        capabilities: this.loadingState.capabilities.length,
        errors: this.loadingState.errors.length,
        averageTimePerModel: totalTime / this.loadingState.totalModels
      });

      // Emit completion event
      this.emit('progress', {
        type: 'loading_complete',
        progress: {
          current: this.loadingState.processedModels,
          total: this.loadingState.totalModels,
          percentage: 100
        },
        state: { ...this.loadingState }
      } as ProgressiveUpdate);

      return this.loadingState;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('❌ Failed to start progressive model loading:', errorMessage);
      
      if (this.loadingState) {
        this.loadingState.errors.push({
          model: 'SYSTEM',
          error: errorMessage
        });
      }
      
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get current loading state
   */
  getCurrentState(): ProgressiveLoadingState | null {
    return this.loadingState ? { ...this.loadingState } : null;
  }

  /**
   * Get vision models from current state
   */
  getVisionModels(): string[] {
    return this.loadingState?.visionModels || [];
  }

  /**
   * Get all capabilities from current state
   */
  getCapabilities(): ModelCapability[] {
    return this.loadingState?.capabilities || [];
  }

  /**
   * Check if loading is currently in progress
   */
  isCurrentlyLoading(): boolean {
    return this.isLoading;
  }

  /**
   * Check if we have valid cached data
   */
  hasCachedData(): boolean {
    const now = Date.now();
    return this.loadingState?.isComplete === true && 
           (now - this.lastFullLoadTime) < this.CACHE_DURATION;
  }

  /**
   * Clear cached data and force reload on next request
   */
  clearCache(): void {
    logger.info('🗑️ Clearing model capability cache');
    this.loadingState = null;
    this.lastFullLoadTime = 0;
    this.streamliner.clearCapabilityCache(); // Clear underlying cache too
  }

  /**
   * Get loading statistics
   */
  getStats(): {
    isLoading: boolean;
    hasCachedData: boolean;
    cacheAge: number;
    state: ProgressiveLoadingState | null;
  } {
    const now = Date.now();
    return {
      isLoading: this.isLoading,
      hasCachedData: this.hasCachedData(),
      cacheAge: this.lastFullLoadTime ? now - this.lastFullLoadTime : 0,
      state: this.getCurrentState()
    };
  }

  private createInitialState(): ProgressiveLoadingState {
    return {
      totalModels: 0,
      processedModels: 0,
      capabilities: [],
      visionModels: [],
      isComplete: false,
      startTime: Date.now(),
      errors: []
    };
  }
}

// Singleton instance for use across the application
export const modelProgressiveLoader = new ModelProgressiveLoader();
