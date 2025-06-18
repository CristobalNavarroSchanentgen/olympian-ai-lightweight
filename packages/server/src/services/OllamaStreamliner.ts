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
  };
  details?: {
    families?: string[];
    format?: string;
    parameter_size?: string;
    quantization_level?: string;
  };
  // Additional fields that might contain vision info
  capabilities?: {
    image_processing?: boolean;
    max_image_resolution?: number;
  };
  config?: {
    vision_encoder?: any;
    image_processor?: any;
    modalities?: string[];
  };
  parameters?: Record<string, any>;
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
      // Step 1: Get basic model info (fast)
      logger.debug(`📊 Fetching model info for: ${model}`);
      const modelInfo = await this.getModelInfo(model, ollamaHost);
      
      // Step 2: Quick vision detection (pattern matching - fast)
      logger.debug(`👁️ Detecting vision capabilities for: ${model}`);
      const hasVision = await this.hasVisionSupport(model, modelInfo);
      
      // Step 3: Quick tool detection (skip actual testing for performance)
      logger.debug(`🔧 Detecting tool capabilities for: ${model}`);
      const hasTools = hasVision ? false : await this.hasToolSupportFast(model, modelInfo);
      
      // Step 4: Quick reasoning detection (pattern matching - fast)
      logger.debug(`🧠 Detecting reasoning capabilities for: ${model}`);
      const hasReasoning = hasVision ? false : await this.hasReasoningSupportFast(model, modelInfo);
      
      // Parse capabilities from modelfile and metadata
      const capability: ModelCapability = {
        name: model,
        vision: hasVision,
        tools: hasTools,
        reasoning: hasReasoning,
        maxTokens: this.parseMaxTokens(modelInfo.modelfile || '') || 4096,
        contextWindow: this.parseContextWindow(modelInfo.modelfile || '') || 128000,
        description: modelInfo.description,
      };

      const detectionTime = Date.now() - startTime;
      
      // Enhanced logging for capability detection debugging
      logger.info(`✅ Capability detection completed for model '${model}' in ${detectionTime}ms:`, {
        hasVision: capability.vision,
        hasTools: capability.tools,
        hasReasoning: capability.reasoning,
        maxTokens: capability.maxTokens,
        contextWindow: capability.contextWindow,
        detectionTimeMs: detectionTime
      });

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
    }, 15000); // 15 second timeout

    try {
      logger.debug(`📡 Requesting model info from: ${ollamaHost}/api/show`);
      const response = await fetch(`${ollamaHost}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      const modelInfo = await response.json() as OllamaModelInfo;
      logger.debug(`📋 Successfully retrieved model info for: ${model}`);
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
    logger.debug(`👁️ Starting vision detection for model: ${model}`);
    
    const detectionResults = {
      modalities: false,
      architecture: false,
      families: false,
      modelfile: false,
      capabilities: false,
      config: false,
      namePattern: false
    };

    try {
      // Method 1: Check modalities field (most reliable according to the document)
      if (modelInfo.modalities && Array.isArray(modelInfo.modalities)) {
        const visionModalityPatterns = ['vision', 'multimodal', 'image', 'visual'];
        detectionResults.modalities = modelInfo.modalities.some(modality => 
          visionModalityPatterns.some(pattern => 
            modality.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (detectionResults.modalities) {
          logger.info(`✓ Vision detected via modalities for '${model}': [${modelInfo.modalities.join(', ')}]`);
          return true;
        }
      }

      // Method 2: Check config modalities (alternative location)
      if (modelInfo.config?.modalities && Array.isArray(modelInfo.config.modalities)) {
        const visionModalityPatterns = ['vision', 'multimodal', 'image', 'visual'];
        detectionResults.config = modelInfo.config.modalities.some(modality => 
          visionModalityPatterns.some(pattern => 
            modality.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (detectionResults.config) {
          logger.info(`✓ Vision detected via config modalities for '${model}': [${modelInfo.config.modalities.join(', ')}]`);
          return true;
        }
      }

      // Method 3: Check capabilities field
      if (modelInfo.capabilities?.image_processing === true) {
        detectionResults.capabilities = true;
        logger.info(`✓ Vision detected via capabilities.image_processing for '${model}'`);
        return true;
      }

      // Method 4: Check for vision encoder and image processor in config
      if (modelInfo.config?.vision_encoder || modelInfo.config?.image_processor) {
        detectionResults.config = true;
        logger.info(`✓ Vision detected via config vision components for '${model}'`);
        return true;
      }

      // Method 5: Enhanced architecture detection
      if (modelInfo.model_info?.architecture) {
        const architecture = modelInfo.model_info.architecture.toLowerCase();
        const visionArchPatterns = [
          'vision', 'clip', 'vit', 'llava', 'bakllava', 'moondream', 
          'multimodal', 'image', 'visual', 'cogvlm', 'instructblip',
          'blip', 'flamingo', 'kosmos', 'gpt4v', 'dalle'
        ];
        detectionResults.architecture = visionArchPatterns.some(pattern => 
          architecture.includes(pattern)
        );
        if (detectionResults.architecture) {
          logger.info(`✓ Vision detected via architecture for '${model}': ${architecture}`);
          return true;
        }
      }

      // Method 6: Enhanced model families detection
      if (modelInfo.details?.families && Array.isArray(modelInfo.details.families)) {
        const visionFamilyPatterns = [
          'llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'moondream', 
          'vision', 'multimodal', 'cogvlm', 'instructblip', 'blip',
          'minicpm-v', 'qwen-vl', 'internvl', 'deepseek-vl'
        ];
        detectionResults.families = modelInfo.details.families.some(family =>
          visionFamilyPatterns.some(pattern => 
            family.toLowerCase().includes(pattern.toLowerCase())
          )
        );
        if (detectionResults.families) {
          logger.info(`✓ Vision detected via families for '${model}': [${modelInfo.details.families.join(', ')}]`);
          return true;
        }
      }

      // Method 7: More specific modelfile inspection (avoid false positives)
      const modelfile = modelInfo.modelfile || '';
      if (modelfile) {
        // Be more specific to avoid false positives - look for actual vision configuration
        const specificVisionPatterns = [
          'vision_encoder', 'image_processor', 'clip_model', 'vision_tower',
          'PARAMETER.*vision', 'vision.*true', 'multimodal.*true',
          'image_size.*\\d+', 'patch_size.*\\d+', 'vision_config',
          'image_token_index', 'vision_feature', 'visual_encoder'
        ];
        detectionResults.modelfile = specificVisionPatterns.some(pattern => {
          const regex = new RegExp(pattern, 'i');
          return regex.test(modelfile);
        });
        if (detectionResults.modelfile) {
          logger.info(`✓ Vision detected via specific modelfile patterns for '${model}'`);
          return true;
        }
      }

      // Method 8: Enhanced and more specific name pattern matching (fallback)
      const visionNamePatterns = [
        'llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'llava-v1.6',
        'llama3.2-vision', 'moondream', 'cogvlm', 'instructblip', 'blip',
        'minicpm-v', 'qwen.*vl', 'qwen.*vision', 'internvl', 'deepseek-vl', 
        'yi-vl', 'phi.*vision', 'phi-3-vision', 'vision', 'multimodal'
      ];
      
      detectionResults.namePattern = visionNamePatterns.some(pattern => {
        const regex = new RegExp(pattern, 'i');
        return regex.test(model);
      });
      
      if (detectionResults.namePattern) {
        logger.info(`✓ Vision detected via name pattern for '${model}'`);
        return true;
      }

    } catch (error) {
      logger.error(`Error during vision detection for model '${model}':`, error);
    }

    logger.info(`✗ No vision capability detected for '${model}' after comprehensive analysis`);
    return false;
  }

  // Fast tool detection without actual API testing
  private async hasToolSupportFast(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`🔧 Fast tool detection for model: ${model}`);
    
    // Check known tool-capable models by name patterns
    const knownToolModels = [
      'mistral', 'mixtral', 'llama3.1', 'llama-3.1', 'llama3.2', 
      'qwen2.5', 'gemma2', 'command-r', 'firefunction', 'hermes',
      'dolphin', 'codegemma', 'codellama', 'deepseek-coder'
    ];
    
    const modelLower = model.toLowerCase();
    const hasKnownToolSupport = knownToolModels.some(tm => modelLower.includes(tm));
    
    if (hasKnownToolSupport) {
      logger.info(`✓ Tool capability detected via known model pattern for '${model}'`);
      return true;
    }
    
    // Check modelfile for tool/function indicators
    const modelfile = modelInfo.modelfile || '';
    const hasToolsInModelfile = modelfile.includes('TOOLS') || 
                                modelfile.includes('function') ||
                                modelfile.includes('tool_use') ||
                                modelfile.includes('function_calling');
    
    if (hasToolsInModelfile) {
      logger.info(`✓ Tool capability detected via modelfile for '${model}'`);
      return true;
    }
    
    // Check description for tool/function mentions
    const description = modelInfo.description || '';
    const hasToolsInDescription = description.toLowerCase().includes('function') ||
                                  description.toLowerCase().includes('tool') ||
                                  description.toLowerCase().includes('api');
    
    if (hasToolsInDescription) {
      logger.info(`✓ Tool capability detected via description for '${model}'`);
      return true;
    }
    
    logger.debug(`✗ No tool capability patterns detected for '${model}'`);
    return false;
  }

  // Original tool testing method (for when thorough testing is needed)
  private async hasToolSupport(model: string, modelfile: string): Promise<boolean> {
    const ollamaHost = this.getOllamaHost();
    
    // First check known tool-capable models
    const knownToolModels = [
      'mistral', 'mixtral', 'llama3.1', 'llama-3.1', 'llama3.2', 
      'qwen2.5', 'gemma2', 'command-r', 'firefunction'
    ];
    
    const modelLower = model.toLowerCase();
    const hasKnownToolSupport = knownToolModels.some(tm => modelLower.includes(tm));
    
    // Check modelfile for tool/function indicators
    const hasToolsInModelfile = modelfile.includes('TOOLS') || 
                                modelfile.includes('function') ||
                                modelfile.includes('tool_use');
    
    if (!hasKnownToolSupport && !hasToolsInModelfile) {
      logger.debug(`Model '${model}' not in known tool-capable list and no tool indicators in modelfile`);
      return false;
    }
    
    // Perform actual tool capability test
    logger.info(`Testing tool capability for model '${model}'`);
    
    const testTool = {
      type: "function",
      function: {
        name: "generate_random_number",
        description: "Get a random integer between 1-10",
        parameters: {
          type: "object",
          properties: {
            min: { type: "integer", const: 1 },
            max: { type: "integer", const: 10 }
          },
          required: ["min", "max"]
        }
      }
    };
    
    const testPrompt = "[SYSTEM] You MUST use the provided tool. Generate a random number between 1 and 10.";
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: testPrompt }],
          tools: [testTool],
          tool_choice: {
            type: "function",
            function: { name: "generate_random_number" }
          },
          options: { temperature: 0 },
          stream: false
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        logger.debug(`Tool test request failed for model '${model}': ${response.statusText}`);
        return false;
      }
      
      const data = await response.json() as OllamaToolTestResponse;
      const toolCalls = data.message?.tool_calls || [];
      
      // Validation checks
      if (toolCalls.length !== 1) {
        logger.debug(`Model '${model}' returned ${toolCalls.length} tool calls instead of 1`);
        return false;
      }
      
      const call = toolCalls[0];
      if (call.function.name !== "generate_random_number" ||
          !call.function.arguments ||
          call.function.arguments.min !== 1 ||
          call.function.arguments.max !== 10) {
        logger.debug(`Model '${model}' tool call validation failed`, call);
        return false;
      }
      
      logger.info(`✓ Tool capability confirmed for model '${model}'`);
      return true;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn(`⏱️ Tool test timed out for model '${model}'`);
      } else {
        logger.error(`Error testing tool capability for model '${model}':`, error);
      }
      return false;
    }
  }

  // Fast reasoning detection without actual API testing
  private async hasReasoningSupportFast(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`🧠 Fast reasoning detection for model: ${model}`);
    
    // Known reasoning models
    const knownReasoningModels = [
      'deepseek-r1', 'llama3.1-intuitive-thinker', 'qwen-qwq', 
      'o1', 'o1-mini', 'claude-3-opus', 'gpt-4-turbo',
      'gemini-1.5-pro', 'mistral-large', 'qwq'
    ];
    
    const modelLower = model.toLowerCase();
    
    // Check if model is in known reasoning models list
    if (knownReasoningModels.some(rm => modelLower.includes(rm.toLowerCase()))) {
      logger.info(`✓ Model '${model}' is a known reasoning model`);
      return true;
    }
    
    // Check for reasoning indicators in model metadata
    const reasoningIndicators = [
      'reasoning', 'chain-of-thought', 'cot', 'step-by-step',
      'logical', 'analytical', 'problem-solving', 'nonlinear-thinking'
    ];
    
    // Check families
    if (modelInfo.details?.families) {
      const hasReasoningFamily = modelInfo.details.families.some(family =>
        reasoningIndicators.some(indicator => 
          family.toLowerCase().includes(indicator)
        )
      );
      if (hasReasoningFamily) {
        logger.info(`✓ Reasoning detected via families for '${model}'`);
        return true;
      }
    }
    
    // Check description
    if (modelInfo.description) {
      const hasReasoningDescription = reasoningIndicators.some(indicator =>
        modelInfo.description!.toLowerCase().includes(indicator)
      );
      if (hasReasoningDescription) {
        logger.info(`✓ Reasoning detected via description for '${model}'`);
        return true;
      }
    }
    
    logger.debug(`✗ No reasoning capability patterns detected for '${model}'`);
    return false;
  }

  // Original reasoning testing method (for when thorough testing is needed)
  private async hasReasoningSupport(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    const ollamaHost = this.getOllamaHost();
    
    logger.debug(`Starting reasoning detection for model: ${model}`);
    
    // Known reasoning models
    const knownReasoningModels = [
      'deepseek-r1', 'llama3.1-intuitive-thinker', 'qwen-qwq', 
      'o1', 'o1-mini', 'claude-3-opus', 'gpt-4-turbo',
      'gemini-1.5-pro', 'mistral-large'
    ];
    
    const modelLower = model.toLowerCase();
    
    // Check if model is in known reasoning models list
    if (knownReasoningModels.some(rm => modelLower.includes(rm.toLowerCase()))) {
      logger.info(`✓ Model '${model}' is a known reasoning model`);
      return true;
    }
    
    // Check for reasoning indicators in model metadata
    const reasoningIndicators = [
      'reasoning', 'chain-of-thought', 'cot', 'step-by-step',
      'logical', 'analytical', 'problem-solving', 'nonlinear-thinking'
    ];
    
    // Check families
    if (modelInfo.details?.families) {
      const hasReasoningFamily = modelInfo.details.families.some(family =>
        reasoningIndicators.some(indicator => 
          family.toLowerCase().includes(indicator)
        )
      );
      if (hasReasoningFamily) {
        logger.info(`✓ Reasoning detected via families for '${model}'`);
        return true;
      }
    }
    
    // Check description
    if (modelInfo.description) {
      const hasReasoningDescription = reasoningIndicators.some(indicator =>
        modelInfo.description!.toLowerCase().includes(indicator)
      );
      if (hasReasoningDescription) {
        logger.info(`✓ Reasoning detected via description for '${model}'`);
        return true;
      }
    }
    
    // Test reasoning capability with a simple logic problem
    logger.info(`Testing reasoning capability for model '${model}'`);
    
    const testPrompt = "If 5 shirts take 4 hours to dry on a clothesline, how long would 20 shirts take to dry? Think step by step.";
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: testPrompt }],
          stream: false,
          options: { 
            temperature: 0.1,
            max_tokens: 500
          }
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        logger.debug(`Reasoning test request failed for model '${model}': ${response.statusText}`);
        return false;
      }
      
      const data = await response.json() as OllamaChatResponse;
      const responseContent = data.message?.content || '';
      
      // Check for reasoning patterns in the response
      const reasoningPatterns = [
        'same clothesline',
        'parallel',
        'simultaneously',
        'at the same time',
        'still 4 hours',
        '4 hours',
        'drying time remains',
        'doesn\'t change'
      ];
      
      const showsReasoning = reasoningPatterns.some(pattern =>
        responseContent.toLowerCase().includes(pattern)
      );
      
      // Also check for step-by-step thinking
      const hasStepByStep = responseContent.includes('step') || 
                           responseContent.includes('Step') ||
                           responseContent.includes('First') ||
                           responseContent.includes('Therefore');
      
      if (showsReasoning && hasStepByStep) {
        logger.info(`✓ Reasoning capability confirmed for model '${model}'`);
        return true;
      }
      
      logger.debug(`Model '${model}' reasoning test response did not show clear reasoning patterns`);
      return false;
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn(`⏱️ Reasoning test timed out for model '${model}'`);
      } else {
        logger.error(`Error testing reasoning capability for model '${model}':`, error);
      }
      return false;
    }
  }

  private parseMaxTokens(modelfile: string): number | null {
    const match = modelfile.match(/num_predict\s+(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private parseContextWindow(modelfile: string): number | null {
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
      
      logger.info(`🔍 Checking ${models.length} models for vision capabilities...`);
      
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
      
      logger.info(`✅ Vision capability detection complete: Found ${visionModels.length} vision-capable models out of ${models.length} total models`);
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
      
      logger.info(`🔍 Getting capabilities for ${models.length} models...`);
      
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
      
      logger.info(`✅ Retrieved capabilities for ${capabilities.length} models`);
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
