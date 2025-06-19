import { ChatRequest, ProcessedRequest, ModelCapability, VisionError } from '@olympian/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { getDeploymentConfig, OllamaLoadBalancer } from '../config/deployment';
import { ChatMemoryService, MemoryConfig } from './ChatMemoryService';

interface OllamaModelInfo {
  modelfile?: string;
  description?: string;
  modalities?: string[]; // Key field for vision detection
  model_info?: {
    architecture?: string;
    parameters?: Record<string, any>;
    // Additional model_info fields from Ollama API
    'general.architecture'?: string;
    'general.parameter_count'?: number;
    'llama.context_length'?: number;
    'llama.embedding_length'?: number;
    [key: string]: any;
  };
  details?: {
    families?: string[];
    format?: string;
    parameter_size?: string;
    quantization_level?: string;
    parent_model?: string;
  };
  // Official capabilities field from Ollama API
  capabilities?: string[]; // e.g., ["completion", "vision", "tools", "embeddings"]
  // Additional fields that might contain vision info
  config?: {
    vision_encoder?: any;
    image_processor?: any;
    modalities?: string[];
  };
  parameters?: Record<string, any>;
  template?: string;
  license?: string | string[];
  system?: string;
}

interface OllamaModelListResponse {
  models?: Array<{ name: string }>;
}

interface OllamaStreamResponse {
  message?: {
    content?: string;
  };
}

interface OllamaGenerateResponse {
  response?: string;
  error?: string;
}

interface OllamaToolTestResponse {
  message?: {
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  };
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

export class OllamaStreamliner {
  private modelCapabilities: Map<string, ModelCapability> = new Map();
  private deploymentConfig = getDeploymentConfig();
  private loadBalancer?: OllamaLoadBalancer;
  private memoryService: ChatMemoryService;
  private capabilityDetectionInProgress: Set<string> = new Set();

  constructor() {
    // Initialize load balancer if multiple hosts are configured
    if (this.deploymentConfig.ollama.hosts.length > 0) {
      this.loadBalancer = new OllamaLoadBalancer(
        this.deploymentConfig.ollama.hosts,
        this.deploymentConfig.ollama.loadBalancer
      );
      logger.info(`Initialized Ollama load balancer with ${this.deploymentConfig.ollama.hosts.length} hosts`);
    }
    
    // Initialize memory service
    this.memoryService = ChatMemoryService.getInstance();
    
    // Log Ollama configuration for debugging
    logger.info(`Ollama configuration: ${JSON.stringify({
      host: this.deploymentConfig.ollama.host,
      deploymentMode: this.deploymentConfig.mode,
      hosts: this.deploymentConfig.ollama.hosts
    })}`);
  }

  private getOllamaHost(clientIp?: string): string {
    if (this.loadBalancer && this.deploymentConfig.ollama.hosts.length > 0) {
      return this.loadBalancer.getNextHost(clientIp);
    }
    return this.deploymentConfig.ollama.host;
  }

  /**
   * Clear cached model capabilities (useful for testing or when models are updated)
   */
  clearCapabilityCache(model?: string): void {
    if (model) {
      this.modelCapabilities.delete(model);
      logger.info(`Cleared capability cache for model: ${model}`);
    } else {
      this.modelCapabilities.clear();
      logger.info('Cleared all model capability cache');
    }
  }

  async detectCapabilities(model: string): Promise<ModelCapability> {
    // Check cache first
    if (this.modelCapabilities.has(model)) {
      logger.debug(`Using cached capabilities for model: ${model}`);
      return this.modelCapabilities.get(model)!;
    }

    // Prevent concurrent capability detection for the same model
    if (this.capabilityDetectionInProgress.has(model)) {
      logger.debug(`Capability detection already in progress for model: ${model}, waiting...`);
      // Wait for ongoing detection to complete
      while (this.capabilityDetectionInProgress.has(model)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.modelCapabilities.has(model)) {
        return this.modelCapabilities.get(model)!;
      }
    }

    this.capabilityDetectionInProgress.add(model);
    const startTime = Date.now();
    logger.info(`🔍 Starting capability detection for model: ${model}`);

    const ollamaHost = this.getOllamaHost();

    try {
      // Step 1: Get comprehensive model info using official Ollama API
      logger.debug(`📊 Fetching detailed model info for: ${model}`);
      const modelInfo = await this.getModelInfo(model, ollamaHost);
      
      // Step 2: Use official capabilities field first (most reliable)
      let hasVision = false;
      let hasTools = false;
      let hasReasoning = false;

      if (modelInfo.capabilities && Array.isArray(modelInfo.capabilities)) {
        logger.info(`✅ Using official capabilities field for '${model}': [${modelInfo.capabilities.join(', ')}]`);
        
        // Check for vision capability
        hasVision = modelInfo.capabilities.includes('vision') || 
                   modelInfo.capabilities.includes('multimodal') ||
                   modelInfo.capabilities.includes('image');
        
        // Check for tools capability  
        hasTools = modelInfo.capabilities.includes('tools') ||
                  modelInfo.capabilities.includes('functions') ||
                  modelInfo.capabilities.includes('function_calling');
                  
        // For reasoning, we still need to use pattern detection since it's not officially tracked
        hasReasoning = false; // Will be detected separately below
        
        logger.info(`🎯 Official capabilities detected - Vision: ${hasVision}, Tools: ${hasTools}`);
      } else {
        logger.debug(`📋 No official capabilities field found, using fallback detection methods`);
      }

      // Step 3: Fallback detection if official capabilities are not available
      if (!modelInfo.capabilities || modelInfo.capabilities.length === 0) {
        // Enhanced vision detection using multiple methods
        hasVision = await this.hasVisionSupport(model, modelInfo);
        
        // Only detect tools and reasoning if NOT a vision model (vision is exclusive)
        if (!hasVision) {
          hasTools = await this.hasToolSupportAdvanced(model, modelInfo);
          hasReasoning = await this.hasReasoningSupportAdvanced(model, modelInfo);
        }
      } else {
        // Even with official capabilities, we still need to detect reasoning
        // since it's not commonly included in the official capabilities field
        if (!hasVision) {
          hasReasoning = await this.hasReasoningSupportAdvanced(model, modelInfo);
        }
      }

      // Step 4: Apply exclusivity rules - Vision is exclusive
      if (hasVision) {
        hasTools = false;
        hasReasoning = false;
        logger.debug(`🚫 Vision model detected - disabling tools and reasoning (vision is exclusive)`);
      }
      
      // Parse capabilities from modelfile and metadata
      const capability: ModelCapability = {
        name: model,
        vision: hasVision,
        tools: hasTools,
        reasoning: hasReasoning,
        maxTokens: this.parseMaxTokens(modelInfo) || 4096,
        contextWindow: this.parseContextWindow(modelInfo) || 128000,
        description: modelInfo.description,
      };

      const detectionTime = Date.now() - startTime;
      
      // Enhanced logging for capability detection debugging
      logger.info(`✅ Capability detection completed for model '${model}' in ${detectionTime}ms:`, {
        hasVision: capability.vision,
        hasTools: capability.tools,
        hasReasoning: capability.reasoning,
        combinedCapabilities: `vision:${capability.vision}, tools:${capability.tools}, reasoning:${capability.reasoning}`,
        officialCapabilities: modelInfo.capabilities || 'none',
        isVisionExclusive: hasVision && (!hasTools && !hasReasoning),
        canHaveBothToolsAndReasoning: !hasVision && (hasTools || hasReasoning),
        maxTokens: capability.maxTokens,
        contextWindow: capability.contextWindow,
        detectionTimeMs: detectionTime
      });

      // Validation check to ensure capability logic is correct
      if (hasVision && (hasTools || hasReasoning)) {
        logger.warn(`⚠️ Logic error: Vision model '${model}' incorrectly detected with tools(${hasTools}) or reasoning(${hasReasoning}). Vision should be exclusive.`);
      }

      // Cache the result
      this.modelCapabilities.set(model, capability);
      
      return capability;
    } catch (error) {
      const detectionTime = Date.now() - startTime;
      logger.error(`❌ Failed to detect capabilities for model ${model} after ${detectionTime}ms:`, error);
      
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      
      // Return default capabilities
      const defaultCapability: ModelCapability = {
        name: model,
        vision: false,
        tools: false,
        reasoning: false,
        maxTokens: 4096,
        contextWindow: 8192,
      };
      
      // Cache the default to avoid repeated failures
      this.modelCapabilities.set(model, defaultCapability);
      return defaultCapability;
    } finally {
      this.capabilityDetectionInProgress.delete(model);
    }
  }

  private async getModelInfo(model: string, ollamaHost: string): Promise<OllamaModelInfo> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn(`⏱️ Model info request timeout for: ${model}`);
      controller.abort();
    }, 20000); // Increased timeout to 20 seconds for thorough API calls

    try {
      logger.debug(`📡 Requesting comprehensive model info from: ${ollamaHost}/api/show`);
      const response = await fetch(`${ollamaHost}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: model,
          verbose: true // Request verbose response for complete information
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      const modelInfo = await response.json() as OllamaModelInfo;
      logger.debug(`📋 Successfully retrieved comprehensive model info for: ${model}`, {
        hasCapabilities: !!modelInfo.capabilities,
        capabilitiesCount: modelInfo.capabilities?.length || 0,
        hasModalities: !!modelInfo.modalities,
        hasFamilies: !!modelInfo.details?.families,
        hasModelInfo: !!modelInfo.model_info
      });
      return modelInfo;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn(`⏱️ Model info request timed out for: ${model}`);
        throw new Error(`Model info request timed out for: ${model}`);
      }
      throw error;
    }
  }

  private async hasVisionSupport(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`👁️ Starting enhanced vision detection for model: ${model}`);
    
    try {
      // Method 1: Check official capabilities field (most reliable)
      if (modelInfo.capabilities && Array.isArray(modelInfo.capabilities)) {
        const visionCapabilities = ['vision', 'multimodal', 'image'];
        const hasOfficialVision = modelInfo.capabilities.some(cap => 
          visionCapabilities.includes(cap.toLowerCase())
        );
        if (hasOfficialVision) {
          logger.info(`✓ Vision detected via official capabilities for '${model}': [${modelInfo.capabilities.join(', ')}]`);
          return true;
        }
      }

      // Method 2: Check modalities field (very reliable)
      if (modelInfo.modalities && Array.isArray(modelInfo.modalities)) {
        const visionModalityPatterns = ['vision', 'multimodal', 'image', 'visual'];
        const hasVisionModality = modelInfo.modalities.some(modality => 
          visionModalityPatterns.some(pattern => 
            modality.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (hasVisionModality) {
          logger.info(`✓ Vision detected via modalities for '${model}': [${modelInfo.modalities.join(', ')}]`);
          return true;
        }
      }

      // Method 3: Check config modalities (alternative location)
      if (modelInfo.config?.modalities && Array.isArray(modelInfo.config.modalities)) {
        const visionModalityPatterns = ['vision', 'multimodal', 'image', 'visual'];
        const hasConfigVision = modelInfo.config.modalities.some(modality => 
          visionModalityPatterns.some(pattern => 
            modality.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (hasConfigVision) {
          logger.info(`✓ Vision detected via config modalities for '${model}': [${modelInfo.config.modalities.join(', ')}]`);
          return true;
        }
      }

      // Method 4: Enhanced architecture detection using model_info
      if (modelInfo.model_info?.['general.architecture']) {
        const architecture = modelInfo.model_info['general.architecture'].toLowerCase();
        const visionArchPatterns = [
          'llava', 'clip', 'vit', 'bakllava', 'moondream', 
          'multimodal', 'vision', 'cogvlm', 'instructblip'
        ];
        const hasVisionArch = visionArchPatterns.some(pattern => 
          architecture.includes(pattern)
        );
        if (hasVisionArch) {
          logger.info(`✓ Vision detected via general.architecture for '${model}': ${architecture}`);
          return true;
        }
      }

      // Method 5: Check model families (from details)
      if (modelInfo.details?.families && Array.isArray(modelInfo.details.families)) {
        const visionFamilyPatterns = [
          'llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'moondream', 
          'vision', 'multimodal', 'cogvlm', 'instructblip', 'blip',
          'minicpm-v', 'qwen-vl', 'internvl', 'deepseek-vl'
        ];
        const hasVisionFamily = modelInfo.details.families.some(family =>
          visionFamilyPatterns.some(pattern => 
            family.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (hasVisionFamily) {
          logger.info(`✓ Vision detected via model families for '${model}': [${modelInfo.details.families.join(', ')}]`);
          return true;
        }
      }

      // Method 6: Vision-specific name patterns (fallback)
      const visionNamePatterns = [
        'llava', 'bakllava', 'llava-v1.6', 'llama3.2-vision', 'moondream', 
        'cogvlm', 'minicpm-v', 'qwen.*vl', 'internvl', 'deepseek-vl', 
        'yi-vl', 'phi.*vision', 'phi-3-vision'
      ];
      
      const hasVisionName = visionNamePatterns.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(model);
      });
      
      if (hasVisionName) {
        logger.info(`✓ Vision detected via name pattern for '${model}'`);
        return true;
      }

    } catch (error) {
      logger.error(`Error during enhanced vision detection for model '${model}':`, error);
    }

    logger.debug(`✗ No vision capability detected for '${model}' after enhanced analysis`);
    return false;
  }

  // Advanced tool detection using official API and enhanced patterns
  private async hasToolSupportAdvanced(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`🔧 Advanced tool detection for model: ${model}`);
    
    // Method 1: Check official capabilities (most reliable)
    if (modelInfo.capabilities && Array.isArray(modelInfo.capabilities)) {
      const toolCapabilities = ['tools', 'functions', 'function_calling', 'tool_use'];
      const hasOfficialTools = modelInfo.capabilities.some(cap => 
        toolCapabilities.includes(cap.toLowerCase())
      );
      if (hasOfficialTools) {
        logger.info(`✓ Tools detected via official capabilities for '${model}': [${modelInfo.capabilities.join(', ')}]`);
        return true;
      }
    }

    // Method 2: Enhanced model name patterns
    const knownToolModels = [
      // Major tool-capable model families
      'mistral', 'mixtral', 'llama3.1', 'llama-3.1', 'llama3.2', 
      'qwen2.5', 'qwen2', 'gemma2', 'command-r', 'firefunction', 
      'hermes', 'dolphin', 'nous-hermes', 'openchat', 'wizard',
      'codegemma', 'codellama', 'deepseek-coder', 'starcoder',
      // Instruction-tuned models often support tools
      'instruct', 'chat', 'assistant'
    ];
    
    const modelLower = model.toLowerCase();
    const hasKnownToolSupport = knownToolModels.some(tm => modelLower.includes(tm));
    
    if (hasKnownToolSupport) {
      logger.info(`✓ Tool capability detected via enhanced model pattern for '${model}'`);
      return true;
    }
    
    // Method 3: Check modelfile for tool/function indicators
    const modelfile = modelInfo.modelfile || '';
    const toolIndicators = [
      'TOOLS', 'function', 'tool_use', 'function_calling',
      'tools_available', 'can_use_tools', 'function_call'
    ];
    const hasToolsInModelfile = toolIndicators.some(indicator =>
      modelfile.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (hasToolsInModelfile) {
      logger.info(`✓ Tool capability detected via modelfile for '${model}'`);
      return true;
    }
    
    // Method 4: Check description for tool/function mentions
    const description = modelInfo.description || '';
    const descriptionIndicators = [
      'function', 'tool', 'api', 'execute', 'call functions',
      'tool use', 'function calling', 'external tools'
    ];
    const hasToolsInDescription = descriptionIndicators.some(indicator =>
      description.toLowerCase().includes(indicator.toLowerCase())
    );
    
    if (hasToolsInDescription) {
      logger.info(`✓ Tool capability detected via description for '${model}'`);
      return true;
    }
    
    // Method 5: Check template for tool support patterns
    const template = modelInfo.template || '';
    const templateToolPatterns = [
      'tool_calls', 'function_call', 'tools', '<tool_call>',
      '{{.*tool.*}}', '{{.*function.*}}'
    ];
    const hasToolTemplate = templateToolPatterns.some(pattern => {
      const regex = new RegExp(pattern, 'i');
      return regex.test(template);
    });
    
    if (hasToolTemplate) {
      logger.info(`✓ Tool capability detected via template for '${model}'`);
      return true;
    }
    
    logger.debug(`✗ No tool capability patterns detected for '${model}'`);
    return false;
  }

  // Advanced reasoning detection using enhanced patterns and official API
  private async hasReasoningSupportAdvanced(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`🧠 Advanced reasoning detection for model: ${model}`);
    
    // Method 1: Check official capabilities (if reasoning becomes officially tracked)
    if (modelInfo.capabilities && Array.isArray(modelInfo.capabilities)) {
      const reasoningCapabilities = ['reasoning', 'thinking', 'analysis', 'problem_solving'];
      const hasOfficialReasoning = modelInfo.capabilities.some(cap => 
        reasoningCapabilities.includes(cap.toLowerCase())
      );
      if (hasOfficialReasoning) {
        logger.info(`✓ Reasoning detected via official capabilities for '${model}': [${modelInfo.capabilities.join(', ')}]`);
        return true;
      }
    }
    
    // Method 2: Enhanced reasoning model patterns
    const knownReasoningModels = [
      // Explicit reasoning models
      'deepseek-r1', 'qwen-qwq', 'qwq', 'thinking', 'reasoning',
      // High-capability instruction models
      'llama3.1', 'llama-3.1', 'qwen2.5', 'qwen2', 'mixtral',
      'gemma2', 'nous-hermes', 'wizard', 'dolphin', 'openchat',
      'mistral', 'command-r', 'yi-', 'deepseek', 'internlm',
      // Instruction and chat variants often have reasoning
      'instruct', 'chat', 'assistant'
    ];
    
    const modelLower = model.toLowerCase();
    
    // Check if model is in known reasoning models list
    if (knownReasoningModels.some(rm => modelLower.includes(rm.toLowerCase()))) {
      logger.info(`✓ Model '${model}' detected as reasoning-capable via pattern matching`);
      return true;
    }
    
    // Method 3: Check for reasoning indicators in model families
    if (modelInfo.details?.families) {
      const reasoningFamilyIndicators = [
        'reasoning', 'thinking', 'analysis', 'instruct', 'chat',
        'assistant', 'helpful', 'smart', 'intelligent'
      ];
      const hasReasoningFamily = modelInfo.details.families.some(family =>
        reasoningFamilyIndicators.some(indicator => 
          family.toLowerCase().includes(indicator)
        )
      );
      if (hasReasoningFamily) {
        logger.info(`✓ Reasoning detected via model families for '${model}': [${modelInfo.details.families.join(', ')}]`);
        return true;
      }
    }
    
    // Method 4: Check description for reasoning capabilities
    if (modelInfo.description) {
      const reasoningDescriptionIndicators = [
        'reasoning', 'think', 'analysis', 'problem', 'logic',
        'step-by-step', 'chain of thought', 'intelligent', 'smart',
        'helpful', 'assistant', 'instruction', 'chat'
      ];
      const hasReasoningDescription = reasoningDescriptionIndicators.some(indicator =>
        modelInfo.description!.toLowerCase().includes(indicator)
      );
      if (hasReasoningDescription) {
        logger.info(`✓ Reasoning detected via description for '${model}'`);
        return true;
      }
    }
    
    // Method 5: Check modelfile for reasoning indicators
    const modelfile = modelInfo.modelfile || '';
    const reasoningModelfileIndicators = [
      'reasoning', 'think', 'step', 'analysis', 'problem',
      'helpful', 'assistant', 'intelligent', 'instruction'
    ];
    const hasReasoningInModelfile = reasoningModelfileIndicators.some(indicator =>
      modelfile.toLowerCase().includes(indicator)
    );
    
    if (hasReasoningInModelfile) {
      logger.info(`✓ Reasoning detected via modelfile for '${model}'`);
      return true;
    }

    // Method 6: Check for instruction/chat templates (good reasoning indicator)
    const template = modelInfo.template || '';
    const hasInstructionTemplate = template.includes('user') && template.includes('assistant') ||
                                  template.includes('USER') && template.includes('ASSISTANT') ||
                                  template.includes('instruction') || template.includes('INSTRUCTION');
    
    if (hasInstructionTemplate) {
      logger.info(`✓ Reasoning detected via instruction template for '${model}'`);
      return true;
    }
    
    logger.debug(`✗ No reasoning capability patterns detected for '${model}'`);
    return false;
  }

  private parseMaxTokens(modelInfo: OllamaModelInfo): number | null {
    // Check model_info first (more reliable)
    if (modelInfo.model_info?.['llama.context_length']) {
      return modelInfo.model_info['llama.context_length'];
    }
    
    // Fallback to modelfile parsing
    const modelfile = modelInfo.modelfile || '';
    const match = modelfile.match(/num_predict\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private parseContextWindow(modelInfo: OllamaModelInfo): number | null {
    // Check model_info first (more reliable)
    if (modelInfo.model_info?.['llama.context_length']) {
      return modelInfo.model_info['llama.context_length'];
    }
    
    // Fallback to modelfile parsing
    const modelfile = modelInfo.modelfile || '';
    const match = modelfile.match(/num_ctx\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private async encodeImage(imagePath: string): Promise<string> {
    // If the image is already base64 encoded, return it
    if (imagePath.startsWith('data:image/')) {
      return imagePath.split(',')[1];
    }
    return imagePath;
  }

  private async processImageWithVisionModel(
    images: string[], 
    content: string, 
    visionModel: string,
    clientIp?: string
  ): Promise<string> {
    const ollamaHost = this.getOllamaHost(clientIp);
    
    logger.info(`Processing ${images.length} image(s) with vision model '${visionModel}' at ${ollamaHost}`);
    
    try {
      // Encode images
      const encodedImages = await Promise.all(images.map(img => this.encodeImage(img)));
      logger.debug(`Encoded ${encodedImages.length} images for vision processing`);

      // Use the vision model to describe the images
      const requestBody = {
        model: visionModel,
        prompt: `Describe the following image(s) in detail: ${content}`,
        images: encodedImages,
        stream: false,
      };

      logger.debug(`Sending vision request to ${ollamaHost}/api/generate with model: ${visionModel}`);

      const response = await fetch(`${ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Vision model request failed: ${response.status} ${response.statusText}`, {
          host: ollamaHost,
          model: visionModel,
          error: errorText
        });
        throw new Error(`Vision model request failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as OllamaGenerateResponse;
      
      if (result.error) {
        logger.error(`Ollama returned error for vision processing:`, result.error);
        throw new Error(`Ollama error: ${result.error}`);
      }

      if (!result.response) {
        logger.warn('Vision model returned empty response');
        return 'Unable to process image - no response from vision model';
      }

      logger.info(`Successfully processed images with vision model, response length: ${result.response.length}`);
      logger.debug(`Vision model response preview: ${result.response.substring(0, 200)}...`);
      return result.response;
    } catch (error) {
      logger.error('Failed to process image with vision model:', {
        error: error instanceof Error ? error.message : error,
        host: ollamaHost,
        model: visionModel,
        imageCount: images.length
      });
      
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      
      throw error;
    }
  }

  async getAvailableVisionModels(): Promise<string[]> {
    try {
      const models = await this.listModels();
      const visionModels: string[] = [];
      
      logger.info(`🔍 Checking ${models.length} models for vision capabilities using enhanced detection...`);
      
      // Check each model for vision capabilities using our robust detection
      for (const model of models) {
        try {
          const capabilities = await this.detectCapabilities(model);
          if (capabilities.vision) {
            visionModels.push(model);
            logger.info(`✓ Added '${model}' to vision models list`);
          } else {
            logger.debug(`✗ Model '${model}' does not have vision capabilities`);
          }
        } catch (error) {
          logger.warn(`Failed to check vision capability for model '${model}':`, error);
          // Continue checking other models
        }
      }
      
      logger.info(`✅ Enhanced vision capability detection complete: Found ${visionModels.length} vision-capable models out of ${models.length} total models`);
      logger.info(`Vision models: [${visionModels.join(', ')}]`);
      
      return visionModels;
    } catch (error) {
      logger.error('Failed to get available vision models:', error);
      return [];
    }
  }

  async getModelCapabilities(): Promise<ModelCapability[]> {
    try {
      const models = await this.listModels();
      const capabilities: ModelCapability[] = [];
      
      logger.info(`🔍 Getting enhanced capabilities for ${models.length} models...`);
      
      // Process models in parallel with limited concurrency for better performance
      const concurrencyLimit = 3; // Process 3 models at a time
      const chunks = [];
      for (let i = 0; i < models.length; i += concurrencyLimit) {
        chunks.push(models.slice(i, i + concurrencyLimit));
      }
      
      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (model) => {
          try {
            const capability = await this.detectCapabilities(model);
            return capability;
          } catch (error) {
            logger.warn(`Failed to get capabilities for model '${model}':`, error);
            // Return default capability to continue with other models
            return {
              name: model,
              vision: false,
              tools: false,
              reasoning: false,
              maxTokens: 4096,
              contextWindow: 8192,
            } as ModelCapability;
          }
        });
        
        const chunkResults = await Promise.all(chunkPromises);
        capabilities.push(...chunkResults);
      }
      
      // Log summary of capabilities detected
      const visionCount = capabilities.filter(c => c.vision).length;
      const toolsCount = capabilities.filter(c => c.tools).length;
      const reasoningCount = capabilities.filter(c => c.reasoning).length;
      const bothToolsAndReasoningCount = capabilities.filter(c => c.tools && c.reasoning).length;
      const officialCapabilitiesCount = capabilities.filter(c => c.description?.includes('official')).length;
      
      logger.info(`✅ Retrieved enhanced capabilities for ${capabilities.length} models:`, {
        visionModels: visionCount,
        toolsModels: toolsCount,
        reasoningModels: reasoningCount,
        modelsWithBothToolsAndReasoning: bothToolsAndReasoningCount,
        exclusivityCheck: `Vision models correctly exclude tools/reasoning: ${capabilities.filter(c => c.vision && (c.tools || c.reasoning)).length === 0}`,
        detectionMethod: 'Enhanced with official Ollama API capabilities field'
      });
      
      return capabilities;
    } catch (error) {
      logger.error('Failed to get model capabilities:', error);
      return [];
    }
  }

  async processRequest(
    request: ChatRequest,
    memoryConfig?: MemoryConfig
  ): Promise<ProcessedRequest> {
    const capabilities = await this.detectCapabilities(request.model);

    // Get conversation history if conversationId is provided
    let messages: Array<{ role: string; content: string; images?: string[] }> = [];
    
    if (request.conversationId) {
      try {
        // Calculate token budget for history based on model capabilities
        const contextWindow = capabilities.contextWindow;
        const maxHistoryTokens = Math.floor(contextWindow * 0.5); // Use 50% of context for history
        
        const adjustedMemoryConfig: MemoryConfig = {
          ...memoryConfig,
          maxTokens: Math.min(memoryConfig?.maxTokens || 4000, maxHistoryTokens),
        };
        
        messages = await this.memoryService.getConversationHistory(
          request.conversationId,
          adjustedMemoryConfig
        );
        logger.debug(`Loaded ${messages.length} messages from conversation history`);
      } catch (error) {
        logger.error('Failed to load conversation history:', error);
        // Continue without history if loading fails
      }
    }

    // Vision handling
    if (request.images && request.images.length > 0) {
      logger.info(`Processing request with ${request.images.length} images`);
      
      // If a vision model is specified, use hybrid processing
      if (request.visionModel) {
        logger.info(`Using hybrid processing with vision model: ${request.visionModel}`);
        return await this.formatHybridVisionRequest(request, messages);
      }
      
      // Otherwise, check if the current model supports vision
      if (!capabilities.vision) {
        const availableVisionModels = await this.getAvailableVisionModels();
        const error: VisionError = {
          error: 'VISION_UNSUPPORTED',
          message: `The selected model '${request.model}' doesn't support images. Please choose a vision-capable model or enable hybrid processing with a vision model.`,
          available_vision_models: availableVisionModels,
        };
        logger.warn(`Vision not supported for model ${request.model}`, { availableVisionModels });
        throw new AppError(400, JSON.stringify(error), 'MODEL_CAPABILITY_ERROR');
      }
      return this.formatVisionRequest(request, messages);
    }

    // Standard text handling
    return this.formatTextRequest(request, messages);
  }

  private async formatHybridVisionRequest(
    request: ChatRequest,
    history: Array<{ role: string; content: string; images?: string[] }>
  ): Promise<ProcessedRequest> {
    logger.info(`Starting hybrid vision processing for request`);
    
    try {
      // Process images with vision model first
      const imageDescription = await this.processImageWithVisionModel(
        request.images!,
        request.content,
        request.visionModel!
      );

      logger.info(`Vision processing complete, description length: ${imageDescription.length}`);

      // Add the processed content to history
      const enhancedContent = `${request.content}\n\n[Image Analysis: ${imageDescription}]`;
      const messages = [
        ...history,
        {
          role: 'user',
          content: enhancedContent,
        },
      ];

      logger.info(`Hybrid request formatted with ${messages.length} total messages`);
      logger.debug(`Enhanced content preview: ${enhancedContent.substring(0, 200)}...`);

      return {
        model: request.model,
        messages,
        stream: true,
      };
    } catch (error) {
      logger.error('Error in formatHybridVisionRequest:', error);
      throw error;
    }
  }

  private formatVisionRequest(
    request: ChatRequest,
    history: Array<{ role: string; content: string; images?: string[] }>
  ): ProcessedRequest {
    // Add current message to history
    const messages = [
      ...history,
      {
        role: 'user',
        content: request.content,
        images: request.images,
      },
    ];

    return {
      model: request.model,
      messages,
      stream: true,
    };
  }

  private formatTextRequest(
    request: ChatRequest,
    history: Array<{ role: string; content: string; images?: string[] }>
  ): ProcessedRequest {
    // Add current message to history
    const messages = [
      ...history,
      {
        role: 'user',
        content: request.content,
      },
    ];

    return {
      model: request.model,
      messages,
      stream: true,
    };
  }

  async streamChat(
    processedRequest: ProcessedRequest,
    onToken: (token: string) => void,
    clientIp?: string
  ): Promise<void> {
    const ollamaHost = this.getOllamaHost(clientIp);
    
    logger.info(`Starting stream chat with model: ${processedRequest.model}`);
    logger.debug(`Request preview: ${JSON.stringify({
      model: processedRequest.model,
      messageCount: processedRequest.messages.length,
      lastMessagePreview: processedRequest.messages[processedRequest.messages.length - 1]?.content?.substring(0, 100) + '...'
    })}`);
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn(`Stream timeout reached for model ${processedRequest.model}, aborting...`);
      controller.abort();
    }, 120000); // 2 minutes timeout for streaming
    
    try {
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processedRequest),
        signal: controller.signal, // Add abort signal for timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Ollama chat request failed: ${response.status} ${response.statusText}`, { errorText });
        throw new AppError(response.status, `Ollama request failed: ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let tokenCount = 0;
      let lastTokenTime = Date.now();

      try {
        logger.info('Starting to stream response tokens...');
        
        while (true) {
          // Add per-chunk timeout to detect stalled streams
          const chunkTimeoutId = setTimeout(() => {
            logger.warn(`No data received for 30 seconds, aborting stream for model ${processedRequest.model}`);
            controller.abort();
          }, 30000); // 30 seconds per chunk timeout
          
          const { done, value } = await reader.read();
          clearTimeout(chunkTimeoutId);
          
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const json = JSON.parse(line) as OllamaStreamResponse;
                if (json.message?.content) {
                  tokenCount++;
                  lastTokenTime = Date.now();
                  onToken(json.message.content);
                  
                  if (tokenCount === 1) {
                    logger.info('First token received and sent to client');
                  }
                  if (tokenCount % 50 === 0) {
                    logger.debug(`Streamed ${tokenCount} tokens so far`);
                  }
                }
              } catch (error) {
                logger.error('Failed to parse Ollama response line:', { line, error });
              }
            }
          }
        }
        
        logger.info(`Stream completed successfully with ${tokenCount} tokens`);
        
        // Report success to load balancer
        if (this.loadBalancer) {
          this.loadBalancer.reportSuccess(ollamaHost);
        }
      } finally {
        reader.releaseLock();
        clearTimeout(timeoutId);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        logger.error('Stream was aborted due to timeout:', {
          model: processedRequest.model,
          host: ollamaHost,
          reason: 'timeout'
        });
        throw new AppError(408, 'Request timeout: The model took too long to respond. This could be due to model complexity or server load.', 'STREAM_TIMEOUT');
      }
      
      logger.error('Error in streamChat:', {
        error: error instanceof Error ? error.message : error,
        host: ollamaHost,
        model: processedRequest.model
      });
      
      // Report failure to load balancer
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    const ollamaHost = this.getOllamaHost();
    
    try {
      logger.debug(`🔍 Attempting to fetch models from ${ollamaHost}/api/tags`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(`${ollamaHost}/api/tags`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Olympian-AI-Lightweight/1.0'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
      }

      const data = await response.json() as OllamaModelListResponse;
      const models = data.models?.map((m) => m.name) || [];
      
      logger.info(`Successfully connected to Ollama at ${ollamaHost}`);
      logger.info(`Found ${models.length} models: ${models.join(', ')}`);
      
      return models;
    } catch (error) {
      // Enhanced error logging with more details
      const errorDetails = {
        host: ollamaHost,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        isNetworkError: error instanceof TypeError && error.message.includes('fetch'),
        isTimeoutError: error instanceof Error && error.name === 'AbortError',
        timestamp: new Date().toISOString()
      };

      if (errorDetails.isNetworkError) {
        logger.error('🔗 Network connection failed to Ollama server:', {
          ...errorDetails,
          possibleCauses: [
            'Ollama server is not running',
            'Network connectivity issues',
            'DNS resolution failure',
            'Firewall blocking the connection',
            'Incorrect hostname/IP address'
          ],
          troubleshooting: [
            `Try: curl -v ${ollamaHost}/api/tags`,
            'Check if Ollama is running on the target host',
            'Verify network connectivity between containers',
            'Check firewall rules and security groups'
          ]
        });
      } else if (errorDetails.isTimeoutError) {
        logger.error('⏱️ Connection timeout to Ollama server:', {
          ...errorDetails,
          possibleCauses: [
            'Ollama server is overloaded',
            'Network latency too high',
            'Server is starting up'
          ]
        });
      } else {
        logger.error('❌ Failed to list Ollama models:', errorDetails);
      }
      
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      
      return [];
    }
  }

  // Get load balancer statistics (useful for monitoring)
  getLoadBalancerStats(): Map<string, any> | null {
    return this.loadBalancer?.getStats() || null;
  }
}
