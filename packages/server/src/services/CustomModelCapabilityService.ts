import { ModelCapability } from '@olympian/shared';
import { logger } from '../utils/logger';

/**
 * Custom Model Capability Service for subproject 3 (Multi-host deployment)
 * Provides predefined model capabilities to avoid testing overhead
 * Used when MODEL_CAPABILITY_MODE=custom in .env configuration
 */
export class CustomModelCapabilityService {
  private static instance: CustomModelCapabilityService;
  private customModelCapabilities: Map<string, ModelCapability> = new Map();

  constructor() {
    this.initializeCustomCapabilities();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CustomModelCapabilityService {
    if (!CustomModelCapabilityService.instance) {
      CustomModelCapabilityService.instance = new CustomModelCapabilityService();
    }
    return CustomModelCapabilityService.instance;
  }

  /**
   * Initialize predefined model capabilities as specified for subproject 3
   */
  private initializeCustomCapabilities(): void {
    logger.info('🔧 Initializing custom model capabilities for multi-host deployment (no testing)');

    // Vision models - exclusively vision, no tools or reasoning
    this.customModelCapabilities.set('llama3.2-vision:11b', {
      name: 'llama3.2-vision:11b',
      vision: true,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 128000,
      description: 'Llama 3.2 Vision 11B - Vision-capable model for image understanding'
    });

    this.customModelCapabilities.set('granite3.2-vision:2b', {
      name: 'granite3.2-vision:2b',
      vision: true,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 128000,
      description: 'Granite 3.2 Vision 2B - Compact vision model for image analysis'
    });

    // Reasoning + Tools models - both capabilities
    this.customModelCapabilities.set('qwen3:32b', {
      name: 'qwen3:32b',
      vision: false,
      tools: true,
      reasoning: true,
      maxTokens: 8192,
      contextWindow: 32768,
      description: 'Qwen 3 32B - Advanced model with both reasoning and tool-calling capabilities'
    });

    this.customModelCapabilities.set('qwen3:4b', {
      name: 'qwen3:4b',
      vision: false,
      tools: true,
      reasoning: true,
      maxTokens: 4096,
      contextWindow: 32768,
      description: 'Qwen 3 4B - Compact model with reasoning and tool-calling capabilities'
    });

    this.customModelCapabilities.set('deepseek-r1:14b', {
      name: 'deepseek-r1:14b',
      vision: false,
      tools: true,
      reasoning: true,
      maxTokens: 8192,
      contextWindow: 64000,
      description: 'DeepSeek R1 14B - Advanced reasoning model with tool-calling support'
    });

    // Tools-only models - no reasoning or vision
    this.customModelCapabilities.set('gemma3:27b', {
      name: 'gemma3:27b',
      vision: false,
      tools: true,
      reasoning: false,
      maxTokens: 8192,
      contextWindow: 8192,
      description: 'Gemma 3 27B - Tool-calling enabled model for function execution'
    });

    this.customModelCapabilities.set('gemma3:4b', {
      name: 'gemma3:4b',
      vision: false,
      tools: true,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 8192,
      description: 'Gemma 3 4B - Compact tool-calling model for efficient function execution'
    });

    // Base models - no special capabilities
    this.customModelCapabilities.set('phi4:14b', {
      name: 'phi4:14b',
      vision: false,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 16384,
      description: 'Phi 4 14B - Base language model for general text generation'
    });

    this.customModelCapabilities.set('llama3.2:3b', {
      name: 'llama3.2:3b',
      vision: false,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 128000,
      description: 'Llama 3.2 3B - Compact base model for general text tasks'
    });

    const totalModels = this.customModelCapabilities.size;
    const visionModels = Array.from(this.customModelCapabilities.values()).filter(c => c.vision).length;
    const toolsModels = Array.from(this.customModelCapabilities.values()).filter(c => c.tools).length;
    const reasoningModels = Array.from(this.customModelCapabilities.values()).filter(c => c.reasoning).length;
    const bothToolsAndReasoning = Array.from(this.customModelCapabilities.values()).filter(c => c.tools && c.reasoning).length;
    const baseModels = Array.from(this.customModelCapabilities.values()).filter(c => !c.vision && !c.tools && !c.reasoning).length;

    logger.info(`✅ Custom model capabilities initialized for subproject 3:`, {
      totalPredefinedModels: totalModels,
      visionModels: visionModels,
      toolsOnlyModels: toolsModels - bothToolsAndReasoning,
      reasoningAndToolsModels: bothToolsAndReasoning,
      baseModels: baseModels,
      modelList: Array.from(this.customModelCapabilities.keys()),
      deployment: 'multi-host',
      mode: 'custom (no testing)'
    });
  }

  /**
   * Get predefined capability for a specific model
   */
  getModelCapability(modelName: string): ModelCapability | null {
    const capability = this.customModelCapabilities.get(modelName);
    if (capability) {
      logger.debug(`✅ Found custom capability for model: ${modelName}`, {
        vision: capability.vision,
        tools: capability.tools,
        reasoning: capability.reasoning
      });
      return { ...capability }; // Return a copy to prevent modification
    }

    logger.debug(`❌ No custom capability defined for model: ${modelName}`);
    return null;
  }

  /**
   * Get all predefined model capabilities
   */
  getAllCustomCapabilities(): ModelCapability[] {
    const capabilities = Array.from(this.customModelCapabilities.values());
    logger.debug(`📋 Returning ${capabilities.length} custom model capabilities`);
    return capabilities.map(cap => ({ ...cap })); // Return copies
  }

  /**
   * Get predefined vision models
   */
  getCustomVisionModels(): string[] {
    const visionModels = Array.from(this.customModelCapabilities.values())
      .filter(cap => cap.vision)
      .map(cap => cap.name);
    
    logger.debug(`👁️ Found ${visionModels.length} predefined vision models: [${visionModels.join(', ')}]`);
    return visionModels;
  }

  /**
   * Get models with tool capabilities
   */
  getCustomToolsModels(): string[] {
    const toolsModels = Array.from(this.customModelCapabilities.values())
      .filter(cap => cap.tools)
      .map(cap => cap.name);
    
    logger.debug(`🔧 Found ${toolsModels.length} predefined tools models: [${toolsModels.join(', ')}]`);
    return toolsModels;
  }

  /**
   * Get models with reasoning capabilities
   */
  getCustomReasoningModels(): string[] {
    const reasoningModels = Array.from(this.customModelCapabilities.values())
      .filter(cap => cap.reasoning)
      .map(cap => cap.name);
    
    logger.debug(`🧠 Found ${reasoningModels.length} predefined reasoning models: [${reasoningModels.join(', ')}]`);
    return reasoningModels;
  }

  /**
   * Check if a model is available in the custom capability list
   */
  isModelAvailable(modelName: string): boolean {
    return this.customModelCapabilities.has(modelName);
  }

  /**
   * Get list of all predefined model names
   */
  getAvailableModelNames(): string[] {
    return Array.from(this.customModelCapabilities.keys());
  }

  /**
   * Get capability statistics
   */
  getCapabilityStats(): {
    total: number;
    vision: number;
    tools: number;
    reasoning: number;
    bothToolsAndReasoning: number;
    baseModels: number;
  } {
    const capabilities = Array.from(this.customModelCapabilities.values());
    
    return {
      total: capabilities.length,
      vision: capabilities.filter(c => c.vision).length,
      tools: capabilities.filter(c => c.tools).length,
      reasoning: capabilities.filter(c => c.reasoning).length,
      bothToolsAndReasoning: capabilities.filter(c => c.tools && c.reasoning).length,
      baseModels: capabilities.filter(c => !c.vision && !c.tools && !c.reasoning).length
    };
  }
}

// Export singleton instance
export const customModelCapabilityService = CustomModelCapabilityService.getInstance();
