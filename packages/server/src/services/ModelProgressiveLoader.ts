import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { ModelCapability } from '@olympian/shared';
import { OllamaStreamliner } from './OllamaStreamliner';
import { getDeploymentConfig } from '../config/deployment';
import { customModelCapabilityService } from './CustomModelCapabilityService';

interface ProgressiveLoadingState {
  totalModels: number;
  processedModels: number;
  capabilities: ModelCapability[];
  visionModels: string[];
  isComplete: boolean;
  startTime: number;
  errors: Array<{ model: string; error: string }>;
  mode: 'automatic' | 'custom';
}

interface ProgressiveUpdate {
  type: 'loading_started' | 'model_processed' | 'vision_model_found' | 'loading_complete' | 'error';
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
 * 
 * Enhanced for subproject 3 (Multi-host deployment) with support for:
 * - Automatic capability detection via API testing (slower, more accurate)
 * - Custom predefined capabilities (faster, no testing required)
 */
export class ModelProgressiveLoader extends EventEmitter {
  private streamliner: OllamaStreamliner;
  private loadingState: ProgressiveLoadingState | null = null;
  private isLoading = false;
  private isStopped = false; // NEW: Add stopped flag for multi-host deployment
  private lastFullLoadTime = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private deploymentConfig = getDeploymentConfig();

  constructor() {
    super();
    this.streamliner = new OllamaStreamliner();
    
    logger.info(`ModelProgressiveLoader initialized for subproject 3 with ${this.deploymentConfig.modelCapability.mode} capability mode`);
  }

  /**
   * Start progressive loading of all model capabilities
   * Emits events as models are processed
   * Uses either automatic detection or custom predefined capabilities based on configuration
   */
  async startProgressiveLoading(forceReload = false): Promise<ProgressiveLoadingState> {
    // Check if we have recent cached results and don't need to reload
    const now = Date.now();
    if (!forceReload && this.loadingState?.isComplete && 
        (now - this.lastFullLoadTime) < this.CACHE_DURATION) {
      logger.info(`✅ Using cached model capabilities (within cache duration) - Mode: ${this.loadingState.mode}`);
      return this.loadingState;
    }

    // Prevent concurrent loading
    if (this.isLoading) {
      logger.info('⏳ Progressive loading already in progress, returning current state');
      return this.loadingState || this.createInitialState();
    }

    this.isLoading = true;
    this.isStopped = false; // Reset stopped flag
    const startTime = Date.now();
    const capabilityMode = this.deploymentConfig.modelCapability.mode;
    
    try {
      logger.info(`🚀 Starting progressive model capability loading in ${capabilityMode} mode for subproject 3...`);
      
      if (capabilityMode === 'custom') {
        return await this.loadCustomCapabilities(startTime);
      } else {
        return await this.loadAutomaticCapabilities(startTime);
      }
    } catch (error) {
      const detectionTime = Date.now() - startTime;
      logger.error(`❌ Failed to start progressive model loading in ${capabilityMode} mode after ${detectionTime}ms:`, error);
      
      if (this.loadingState) {
        this.loadingState.errors.push({
          model: 'SYSTEM',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * NEW: Stop progressive loading for multi-host deployment (Subproject 3)
   */
  stopProgressiveLoading(): void {
    logger.info('🛑 [ModelProgressiveLoader] Stopping progressive loading for multi-host deployment');
    this.isStopped = true;
    this.isLoading = false;
    
    // Clear any ongoing operations
    this.removeAllListeners();
  }

  /**
   * Load capabilities using custom predefined list (faster, no testing, NO API calls)
   * This method completely bypasses any Ollama API calls when in custom mode
   */
  private async loadCustomCapabilities(startTime: number): Promise<ProgressiveLoadingState> {
    logger.info('📋 Loading custom predefined model capabilities (NO testing, NO API calls)');
    
    // Get ALL predefined capabilities - no filtering based on Ollama availability
    const allCapabilities = customModelCapabilityService.getAllCustomCapabilities();
    const visionModels = allCapabilities.filter(cap => cap.vision).map(cap => cap.name);
    
    // Initialize loading state
    this.loadingState = {
      totalModels: allCapabilities.length,
      processedModels: allCapabilities.length, // All processed instantly in custom mode
      capabilities: allCapabilities,
      visionModels: visionModels,
      isComplete: true, // Complete immediately in custom mode
      startTime,
      errors: [],
      mode: 'custom'
    };

    logger.info(`📊 Custom mode processing summary (NO Ollama API calls):`, {
      totalPredefinedModels: allCapabilities.length,
      visionModels: visionModels.length,
      toolsModels: allCapabilities.filter(c => c.tools).length,
      reasoningModels: allCapabilities.filter(c => c.reasoning).length,
      baseModels: allCapabilities.filter(c => !c.vision && !c.tools && !c.reasoning).length,
      noOllamaConnection: true,
      message: 'Using ONLY predefined capabilities - no network calls to Ollama'
    });

    // Check if stopped before emitting events
    if (this.isStopped) {
      logger.info('🛑 Progressive loading stopped during custom capabilities loading');
      return this.loadingState;
    }

    // Emit initial state
    this.emit('progress', {
      type: 'loading_started',
      progress: {
        current: 0,
        total: allCapabilities.length,
        percentage: 0
      },
      state: { ...this.loadingState }
    } as ProgressiveUpdate);

    // Emit progress for each model (simulate processing for UI consistency)
    for (let i = 0; i < allCapabilities.length; i++) {
      if (this.isStopped) {
        logger.info('🛑 Progressive loading stopped during custom capabilities emission');
        break;
      }

      const capability = allCapabilities[i];
      
      // Emit vision model found event if applicable
      if (capability.vision) {
        this.emit('progress', {
          type: 'vision_model_found',
          model: capability.name,
          capability,
          isVisionModel: true,
          progress: {
            current: i + 1,
            total: allCapabilities.length,
            percentage: Math.round(((i + 1) / allCapabilities.length) * 100)
          },
          state: { ...this.loadingState }
        } as ProgressiveUpdate);
      }
      
      // Emit model processed event
      this.emit('progress', {
        type: 'model_processed',
        model: capability.name,
        capability,
        isVisionModel: capability.vision,
        progress: {
          current: i + 1,
          total: allCapabilities.length,
          percentage: Math.round(((i + 1) / allCapabilities.length) * 100)
        },
        state: { ...this.loadingState }
      } as ProgressiveUpdate);
      
      // Small delay to show progress (can be removed if not needed)
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const totalTime = Date.now() - startTime;
    this.lastFullLoadTime = Date.now();
    
    const stats = customModelCapabilityService.getCapabilityStats();
    logger.info(`✅ Custom model capability loading completed in ${totalTime}ms for subproject 3:`, {
      totalModels: allCapabilities.length,
      visionModels: stats.vision,
      toolsModels: stats.tools,
      reasoningModels: stats.reasoning,
      bothToolsAndReasoning: stats.bothToolsAndReasoning,
      baseModels: stats.baseModels,
      mode: 'custom (NO testing, NO API calls)',
      deployment: 'multi-host',
      ollamaConnectionRequired: false
    });

    // Emit completion event if not stopped
    if (!this.isStopped) {
      this.emit('progress', {
        type: 'loading_complete',
        progress: {
          current: allCapabilities.length,
          total: allCapabilities.length,
          percentage: 100
        },
        state: { ...this.loadingState }
      } as ProgressiveUpdate);
    }

    return this.loadingState;
  }

  /**
   * Load capabilities using automatic detection (slower, more accurate)
   */
  private async loadAutomaticCapabilities(startTime: number): Promise<ProgressiveLoadingState> {
    logger.info('🔍 Loading model capabilities using automatic detection (with testing)');
    
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
      errors: [],
      mode: 'automatic'
    };

    logger.info(`📊 Will process ${models.length} models progressively using automatic detection`);
    
    // Check if stopped before proceeding
    if (this.isStopped) {
      logger.info('🛑 Progressive loading stopped before automatic capabilities loading');
      return this.loadingState;
    }

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
      if (this.isStopped) {
        logger.info('🛑 Progressive loading stopped during automatic capabilities processing');
        break;
      }

      const chunkPromises = chunk.map(async (model) => {
        if (this.isStopped) return; // Skip if stopped

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
            if (!this.isStopped) {
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
          }
          
          // Emit model processed event
          if (!this.isStopped) {
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
          }
          
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
          if (!this.isStopped) {
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
        }
      });
      
      // Wait for this chunk to complete before processing the next
      await Promise.all(chunkPromises);
    }

    // Mark as complete
    this.loadingState.isComplete = true;
    this.lastFullLoadTime = Date.now();
    
    const totalTime = Date.now() - startTime;
    logger.info(`✅ Automatic model loading completed in ${totalTime}ms for subproject 3:`, {
      totalModels: this.loadingState.totalModels,
      processedModels: this.loadingState.processedModels,
      visionModels: this.loadingState.visionModels.length,
      capabilities: this.loadingState.capabilities.length,
      errors: this.loadingState.errors.length,
      averageTimePerModel: totalTime / this.loadingState.totalModels,
      mode: 'automatic (with testing)',
      deployment: 'multi-host'
    });

    // Emit completion event if not stopped
    if (!this.isStopped) {
      this.emit('progress', {
        type: 'loading_complete',
        progress: {
          current: this.loadingState.processedModels,
          total: this.loadingState.totalModels,
          percentage: 100
        },
        state: { ...this.loadingState }
      } as ProgressiveUpdate);
    }

    return this.loadingState;
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
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      return customModelCapabilityService.getCustomVisionModels();
    }
    return this.loadingState?.visionModels || [];
  }

  /**
   * Get all capabilities from current state
   */
  getCapabilities(): ModelCapability[] {
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      return customModelCapabilityService.getAllCustomCapabilities();
    }
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
    // In custom mode, we always have "cached" data (predefined capabilities)
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      return true;
    }
    
    const now = Date.now();
    return this.loadingState?.isComplete === true && 
           (now - this.lastFullLoadTime) < this.CACHE_DURATION;
  }

  /**
   * Clear cached data and force reload on next request
   */
  clearCache(): void {
    logger.info(`🗑️ Clearing model capability cache (mode: ${this.deploymentConfig.modelCapability.mode})`);
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
    mode: 'automatic' | 'custom';
  } {
    const now = Date.now();
    return {
      isLoading: this.isLoading,
      hasCachedData: this.hasCachedData(),
      cacheAge: this.lastFullLoadTime ? now - this.lastFullLoadTime : 0,
      state: this.getCurrentState(),
      mode: this.deploymentConfig.modelCapability.mode
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
      errors: [],
      mode: this.deploymentConfig.modelCapability.mode
    };
  }
}

// Singleton instance for use across the application
export const modelProgressiveLoader = new ModelProgressiveLoader();
