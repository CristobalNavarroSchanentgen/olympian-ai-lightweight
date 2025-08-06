import { customModelCapabilityService } from "./customModelCapabilityServiceStub";
// Stub for removed customModelCapabilityService
import { ChatRequest, ProcessedRequest, ModelCapability, VisionError, parseThinkingFromContent, ThinkingProcessingResult, ToolCall, ToolResult } from '@olympian/shared';
// Stub for removed customModelCapabilityService
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
  // Official capabilities field from Ollama API - MOST RELIABLE
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
  done?: boolean;
  done_reason?: string;
  // Additional fields for error handling
  error?: string;
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
    content?: string;
  };
  error?: string;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
    tool_calls?: Array<{
      function: {
        name: string;
        arguments: Record<string, any>;
      };
    }>;
  };
  error?: string;
}

// ENHANCED: Interface for streaming results with thinking data
interface StreamResult {
  fullContent: string;
  thinking?: ThinkingProcessingResult;
}

export class OllamaStreamliner {
  // Only models known to support tools
  private static readonly COMPATIBLE_MODELS = [
    'qwen2.5', 'qwen3', 'llama3.1', 'llama3.2', 'mistral', 'deepseek-r1'
  ];
  
  // Simple compatibility check - no detection needed
  isCompatibleModel(model: string): boolean {
    const baseModel = model.split(':')[0];
    return OllamaStreamliner.COMPATIBLE_MODELS.includes(baseModel);
  }
  // Only models known to support tools
  private deploymentConfig = getDeploymentConfig();
  private loadBalancer?: OllamaLoadBalancer;
  private memoryService: ChatMemoryService;
  // NEW: MCP integration services for subproject 3
  constructor() {
    // Initialize load balancer if multiple hosts are configured
    if (this.deploymentConfig.ollama.hosts.length > 0) {
      this.loadBalancer = new OllamaLoadBalancer(
        this.deploymentConfig.ollama.hosts,
        this.deploymentConfig.ollama.loadBalancer
      );
      logger.info(`Initialized Ollama load balancer with ${this.deploymentConfig.ollama.hosts.length} hosts for subproject 3 (Multi-host deployment)`);
    }
    
    // Initialize memory service
    this.memoryService = ChatMemoryService.getInstance();
    
    // NEW: Initialize MCP integration services for subproject 3
    // Log Ollama configuration for debugging
    logger.info(`Ollama configuration for Multi-host deployment: ${JSON.stringify({
      host: this.deploymentConfig.ollama.host,
      deploymentMode: this.deploymentConfig.mode,
      hosts: this.deploymentConfig.ollama.hosts,
      modelCapabilityMode: this.deploymentConfig.modelCapability.mode,
      subproject: 'Multi-host deployment',      mcpEnabled: true
    })}`);
  }

  // NEW: Initialize MCP services on startup

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
      logger.info(`Cleared capability cache for model: ${model}`);
    } else {
      logger.info('Cleared all model capability cache');
    }
  }

  /**
   * Enhanced model capability detection with support for custom mode
   * Uses either:
   * 1. Custom predefined capabilities (fast, no testing) - when MODEL_CAPABILITY_MODE=custom
   * 2. Automatic detection via API testing (slow, accurate) - when MODEL_CAPABILITY_MODE=automatic
   */
  async detectCapabilities(model: string): Promise<ModelCapability> {
    // Capability detection disabled - use StreamlinerFactory instead
    return {
      name: "default",
      vision: false,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 8192
    };
  }

  private async detectCapabilitiesOriginal(model: string): Promise<ModelCapability> {    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      return this.getCustomCapability(model);
    }

    // Automatic mode - existing enhanced detection logic
  }

  /**
   * Get capability using custom predefined list
   */
  private async getCustomCapability(model: string): Promise<ModelCapability> {
    logger.debug(`[DEBUG] Getting custom predefined capability for model: ${model}`);
    
    const customCapability = customModelCapabilityService.getModelCapability(model);
    
    if (customCapability) {
      logger.debug(`[SUCCESS] Found custom capability for model: ${model}`, {
        vision: customCapability.vision,
        tools: customCapability.tools,
        reasoning: customCapability.reasoning,
        mode: 'custom'
      });
      return customCapability;
    }

    // Model not in predefined list, return default base capability
    logger.debug(`[ERROR] No custom capability defined for model: ${model}, using default base capability`);
    const defaultCapability: ModelCapability = {
      name: model,
      vision: false,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 8192,
      description: `${model} - Base model (not in predefined capability list)`
    };

    return defaultCapability;
  }

  /**
   * IMPROVED: Comprehensive model capability detection using:
   * 1. Official Ollama capabilities field (highest priority)
   * 2. Programmatic testing via API calls (medium priority)
   * 3. Enhanced metadata analysis (fallback)
   * NO hardcoded patterns or model name assumptions
   */

  private async getModelInfo(model: string): Promise<OllamaModelInfo> {
    const ollamaHost = this.getOllamaHost();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn(`⏱️ Model info request timeout for: ${model}`);
      controller.abort();
    }, 25000); // Increased timeout for multi-host

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
        if (this.loadBalancer) {
          this.loadBalancer.reportFailure(ollamaHost);
        }
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      const modelInfo = await response.json() as OllamaModelInfo;
      
      // Report success to load balancer
      if (this.loadBalancer) {
        this.loadBalancer.reportSuccess(ollamaHost);
      }
      
      logger.debug(`[LIST] Successfully retrieved comprehensive model info for: ${model}`, {
        hasCapabilities: !!modelInfo.capabilities,
        capabilitiesCount: modelInfo.capabilities?.length || 0,
        hasModalities: !!modelInfo.modalities,
        hasFamilies: !!modelInfo.details?.families,
        hasModelInfo: !!modelInfo.model_info,
        parameterSize: modelInfo.details?.parameter_size,
        host: ollamaHost
      });
      return modelInfo;
    } catch (error) {
      clearTimeout(timeoutId);
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn(`⏱️ Model info request timed out for: ${model}`);
        throw new Error(`Model info request timed out for: ${model}`);
      }
      throw error;
    }
  }

  /**
   * Parse official vision capability from Ollama capabilities array
   */
  private parseOfficialVisionCapability(capabilities: string[]): boolean {
    const visionCapabilityKeywords = ['vision', 'multimodal', 'image', 'visual'];
    return capabilities.some(cap => 
      visionCapabilityKeywords.some(keyword => 
        cap.toLowerCase().includes(keyword)
      )
    );
  }

  /**
   * Parse official tools capability from Ollama capabilities array
   */
  private parseOfficialToolsCapability(capabilities: string[]): boolean {
    const toolsCapabilityKeywords = ['tools', 'functions', 'function_calling', 'tool_use'];
    return capabilities.some(cap => 
      toolsCapabilityKeywords.some(keyword => 
        cap.toLowerCase().includes(keyword)
      )
    );
  }

  /**
   * Parse official reasoning capability from Ollama capabilities array
   */
  private parseOfficialReasoningCapability(capabilities: string[]): boolean {
    const reasoningCapabilityKeywords = ['reasoning', 'thinking', 'analysis', 'logic'];
    return capabilities.some(cap => 
      reasoningCapabilityKeywords.some(keyword => 
        cap.toLowerCase().includes(keyword)
      )
    );
  }

  /**
   * PROGRAMMATIC TESTING: Actually test if model can use tools via API call
   */
  private async testToolCapabilityProgrammatically(model: string): Promise<boolean> {
    const ollamaHost = this.getOllamaHost();
    logger.debug(`[DEBUG] PROGRAMMATICALLY testing tool capability for model: ${model}`);
    
    try {
      const testToolDefinition = {
        type: 'function',
        function: {
          name: 'test_function',
          description: 'A simple test function to check tool capability',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'A test message'
              }
            },
            required: ['message']
          }
        }
      };

      const requestBody = {
        model: model,
        messages: [
          {
            role: 'user',
            content: 'Please call the test_function with the message "capability_test"'
          }
        ],
        tools: [testToolDefinition],
        stream: false
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (this.loadBalancer) {
          this.loadBalancer.reportFailure(ollamaHost);
        }
        logger.debug(`Tool test request failed for ${model}: ${response.status}`);
        return false;
      }

      const result = await response.json() as OllamaToolTestResponse;
      
      // Report success to load balancer
      if (this.loadBalancer) {
        this.loadBalancer.reportSuccess(ollamaHost);
      }

      if (result.error) {
        logger.debug(`Tool test returned error for ${model}: ${result.error}`);
        return false;
      }

      // Check if model responded with tool_calls
      const hasToolCalls = result.message?.tool_calls && result.message.tool_calls.length > 0;
      
      if (hasToolCalls) {
        logger.info(`[SUCCESS] PROGRAMMATIC tool capability confirmed for '${model}' - Model successfully used tools`);
        return true;
      } else {
        logger.debug(`✗ PROGRAMMATIC tool test failed for '${model}' - No tool_calls in response`);
        return false;
      }
    } catch (error) {
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      logger.debug(`Error during programmatic tool testing for model '${model}':`, error);
      return false;
    }
  }

  /**
   * PROGRAMMATIC TESTING: Actually test if model can do step-by-step reasoning
   */
  private async testReasoningCapabilityProgrammatically(model: string): Promise<boolean> {
    const ollamaHost = this.getOllamaHost();
    logger.debug(`[BRAIN] PROGRAMMATICALLY testing reasoning capability for model: ${model}`);
    
    try {
      const requestBody = {
        model: model,
        messages: [
          {
            role: 'user',
            content: 'Please solve this step by step: If a train travels 60 miles in 2 hours, what is its speed? Show your reasoning process.'
          }
        ],
        stream: false,
        options: {
          temperature: 0.1,
          max_tokens: 200
        }
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout

      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (this.loadBalancer) {
          this.loadBalancer.reportFailure(ollamaHost);
        }
        logger.debug(`Reasoning test request failed for ${model}: ${response.status}`);
        return false;
      }

      const result = await response.json() as OllamaChatResponse;
      
      // Report success to load balancer
      if (this.loadBalancer) {
        this.loadBalancer.reportSuccess(ollamaHost);
      }

      if (result.error || !result.message?.content) {
        logger.debug(`Reasoning test returned error for ${model}:`, result.error);
        return false;
      }

      const responseText = result.message.content.toLowerCase();
      
      // Check for step-by-step reasoning indicators
      const reasoningIndicators = [
        'step', 'first', 'then', 'therefore', 'because', 'since',
        'given', 'solution', 'calculate', 'divide', 'miles per hour',
        'speed = distance', 'reasoning', 'process'
      ];
      
      const reasoningScore = reasoningIndicators.filter(indicator => 
        responseText.includes(indicator)
      ).length;
      
      // Also check for mathematical correctness (30 mph)
      const hasCorrectAnswer = responseText.includes('30') && 
                              (responseText.includes('mph') || responseText.includes('miles per hour'));
      
      // Model shows reasoning capability if it has multiple reasoning indicators and correct answer
      const hasReasoning = reasoningScore >= 3 && hasCorrectAnswer;
      
      if (hasReasoning) {
        logger.info(`[SUCCESS] PROGRAMMATIC reasoning capability confirmed for '${model}' - Model showed step-by-step thinking (score: ${reasoningScore})`);
        return true;
      } else {
        logger.debug(`✗ PROGRAMMATIC reasoning test inconclusive for '${model}' - Score: ${reasoningScore}, Correct answer: ${hasCorrectAnswer}`);
        return false;
      }
    } catch (error) {
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      logger.debug(`Error during programmatic reasoning testing for model '${model}':`, error);
      return false;
    }
  }

  /**
   * Enhanced vision detection using only Ollama API data (NO hardcoded patterns)
   */
  private async detectVisionCapabilityEnhanced(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`👁️ Enhanced vision detection for model: ${model}`);
    
    try {
      // Method 1: Check modalities field (most reliable)
      if (modelInfo.modalities && Array.isArray(modelInfo.modalities)) {
        const visionModalityKeywords = ['vision', 'multimodal', 'image', 'visual'];
        const hasVisionModality = modelInfo.modalities.some(modality => 
          visionModalityKeywords.some(keyword => 
            modality.toLowerCase().includes(keyword.toLowerCase())
          )
        );
        if (hasVisionModality) {
          logger.info(`✓ Vision detected via modalities for '${model}': [${modelInfo.modalities.join(', ')}]`);
          return true;
        }
      }

      // Method 2: Check config modalities
      if (modelInfo.config?.modalities && Array.isArray(modelInfo.config.modalities)) {
        const visionModalityKeywords = ['vision', 'multimodal', 'image', 'visual'];
        const hasConfigVision = modelInfo.config.modalities.some(modality => 
          visionModalityKeywords.some(keyword => 
            modality.toLowerCase().includes(keyword.toLowerCase())
          )
        );
        if (hasConfigVision) {
          logger.info(`✓ Vision detected via config modalities for '${model}': [${modelInfo.config.modalities.join(', ')}]`);
          return true;
        }
      }

      // Method 3: Architecture detection
      if (modelInfo.model_info?.['general.architecture']) {
        const architecture = modelInfo.model_info['general.architecture'].toLowerCase();
        const visionArchKeywords = [
          'llava', 'clip', 'vit', 'bakllava', 'moondream', 
          'multimodal', 'vision', 'cogvlm', 'instructblip'
        ];
        const hasVisionArch = visionArchKeywords.some(keyword => 
          architecture.includes(keyword)
        );
        if (hasVisionArch) {
          logger.info(`✓ Vision detected via architecture for '${model}': ${architecture}`);
          return true;
        }
      }

      // Method 4: Check model families
      if (modelInfo.details?.families && Array.isArray(modelInfo.details.families)) {
        const visionFamilyKeywords = [
          'llava', 'bakllava', 'moondream', 'vision', 'multimodal', 
          'cogvlm', 'instructblip', 'blip', 'minicpm-v', 'qwen-vl', 
          'internvl', 'deepseek-vl'
        ];
        const hasVisionFamily = modelInfo.details.families.some(family =>
          visionFamilyKeywords.some(keyword => 
            family.toLowerCase().includes(keyword.toLowerCase())
          )
        );
        if (hasVisionFamily) {
          logger.info(`✓ Vision detected via families for '${model}': [${modelInfo.details.families.join(', ')}]`);
          return true;
        }
      }

      // Method 5: Check description for vision keywords
      if (modelInfo.description) {
        const visionDescriptorKeywords = [
          'vision', 'visual', 'image', 'multimodal', 'see', 'picture',
          'photograph', 'visual understanding', 'image analysis'
        ];
        const hasVisionDescription = visionDescriptorKeywords.some(keyword =>
          modelInfo.description!.toLowerCase().includes(keyword.toLowerCase())
        );
        if (hasVisionDescription) {
          logger.info(`✓ Vision detected via description for '${model}'`);
          return true;
        }
      }

    } catch (error) {
      logger.error(`Error during enhanced vision detection for model '${model}':`, error);
    }

    logger.debug(`✗ No vision capability detected for '${model}' via enhanced detection`);
    return false;
  }

  /**
   * Enhanced tool detection using metadata analysis (NO hardcoded patterns)
   */
  private async detectToolCapabilityEnhanced(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`[DEBUG] Enhanced tool detection for model: ${model}`);
    
    // Method 1: Check modelfile for tool indicators
    const modelfile = modelInfo.modelfile || '';
    const toolKeywords = [
      'TOOLS', 'function', 'tool_use', 'function_calling',
      'tools_available', 'can_use_tools', 'function_call'
    ];
    const hasToolsInModelfile = toolKeywords.some(keyword =>
      modelfile.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasToolsInModelfile) {
      logger.info(`✓ Tool capability detected via modelfile for '${model}'`);
      return true;
    }
    
    // Method 2: Check description for tool mentions
    const description = modelInfo.description || '';
    const descriptionKeywords = [
      'function', 'tool', 'api', 'execute', 'call functions',
      'tool use', 'function calling', 'external tools'
    ];
    const hasToolsInDescription = descriptionKeywords.some(keyword =>
      description.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasToolsInDescription) {
      logger.info(`✓ Tool capability detected via description for '${model}'`);
      return true;
    }
    
    // Method 3: Check template for tool support patterns
    const template = modelInfo.template || '';
    const templateToolKeywords = ['tool_calls', 'function_call', 'tools', '<tool_call>'];
    const hasToolTemplate = templateToolKeywords.some(keyword => {
      return template.toLowerCase().includes(keyword.toLowerCase());
    });
    
    if (hasToolTemplate) {
      logger.info(`✓ Tool capability detected via template for '${model}'`);
      return true;
    }
    
    logger.debug(`✗ No tool capability patterns detected for '${model}'`);
    return false;
  }

  /**
   * Enhanced reasoning detection using metadata analysis (NO hardcoded patterns)
   */
  private async detectReasoningCapabilityEnhanced(model: string, modelInfo: OllamaModelInfo): Promise<boolean> {
    logger.debug(`[BRAIN] Enhanced reasoning detection for model: ${model}`);
    
    // Method 1: Check description for explicit reasoning indicators
    if (modelInfo.description) {
      const reasoningKeywords = [
        'reasoning', 'chain of thought', 'step-by-step thinking', 
        'logical reasoning', 'problem solving', 'analytical thinking',
        'complex reasoning', 'multi-step reasoning', 'critical thinking'
      ];
      const hasReasoningDescription = reasoningKeywords.some(keyword =>
        modelInfo.description!.toLowerCase().includes(keyword.toLowerCase())
      );
      if (hasReasoningDescription) {
        logger.info(`✓ Reasoning detected via description for '${model}'`);
        return true;
      }
    }
    
    // Method 2: Check modelfile for reasoning indicators
    const modelfile = modelInfo.modelfile || '';
    const modelfileReasoningKeywords = [
      'reasoning', 'think step by step', 'chain of thought',
      'analytical', 'problem solving', 'logical thinking'
    ];
    const hasReasoningInModelfile = modelfileReasoningKeywords.some(keyword =>
      modelfile.toLowerCase().includes(keyword.toLowerCase())
    );
    
    if (hasReasoningInModelfile) {
      logger.info(`✓ Reasoning detected via modelfile for '${model}'`);
      return true;
    }

    // Method 3: Check template for sophisticated patterns
    const template = modelInfo.template || '';
    const templateReasoningKeywords = [
      'chain of thought', 'step by step', 'reasoning', 'think through',
      'analyze', 'problem', 'solution'
    ];
    const hasReasoningTemplate = templateReasoningKeywords.some(keyword =>
      template.toLowerCase().includes(keyword)
    );
    
    if (hasReasoningTemplate) {
      logger.info(`✓ Reasoning detected via template for '${model}'`);
      return true;
    }
    
    // Method 4: Check families for reasoning indicators
    if (modelInfo.details?.families && Array.isArray(modelInfo.details.families)) {
      const reasoningFamilyKeywords = [
        'reasoning', 'thinking', 'analytical', 'logic', 'problem'
      ];
      const hasReasoningFamily = modelInfo.details.families.some(family =>
        reasoningFamilyKeywords.some(keyword => 
          family.toLowerCase().includes(keyword)
        )
      );
      if (hasReasoningFamily) {
        logger.info(`✓ Reasoning detected via families for '${model}': [${modelInfo.details.families.join(', ')}]`);
        return true;
      }
    }
    
    // Method 5: Check architecture for reasoning architectures
    if (modelInfo.model_info?.['general.architecture']) {
      const architecture = modelInfo.model_info['general.architecture'].toLowerCase();
      const reasoningArchKeywords = ['reasoning', 'thinking', 'analytical', 'logic'];
      const hasReasoningArch = reasoningArchKeywords.some(keyword => 
        architecture.includes(keyword)
      );
      if (hasReasoningArch) {
        logger.info(`✓ Reasoning detected via architecture for '${model}': ${architecture}`);
        return true;
      }
    }
    
    logger.debug(`✗ No reasoning capability indicators detected for '${model}'`);
    return false;
  }

  private parseMaxTokens(modelInfo: OllamaModelInfo): number | null {
    // Check model_info first (more reliable)
    if (modelInfo.model_info?.['llama.context_length']) {
      return modelInfo.model_info['llama.context_length'];
    }
    
    // Fallback to modelfile parsing
    const modelfile = modelInfo.modelfile || '';
    const match = modelfile.match(/num_predict\\s+(\\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private parseContextWindow(modelInfo: OllamaModelInfo): number | null {
    // Check model_info first (more reliable)
    if (modelInfo.model_info?.['llama.context_length']) {
      return modelInfo.model_info['llama.context_length'];
    }
    
    // Fallback to modelfile parsing
    const modelfile = modelInfo.modelfile || '';
    const match = modelfile.match(/num_ctx\\s+(\\d+)/);
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
        if (this.loadBalancer) {
          this.loadBalancer.reportFailure(ollamaHost);
        }
        throw new Error(`Vision model request failed: ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as OllamaGenerateResponse;
      
      if (this.loadBalancer) {
        this.loadBalancer.reportSuccess(ollamaHost);
      }
      
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
    // Check if we're in custom mode
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      const customVisionModels = customModelCapabilityService.getCustomVisionModels();
      logger.info(`[DEBUG] Using custom predefined vision models: [${customVisionModels.join(', ')}]`);
      return customVisionModels;
    }

    // Automatic mode - existing detection logic
    try {
      const models = await this.listModels();
      const visionModels: string[] = [];
      
      logger.info(`[SEARCH] Checking ${models.length} models for vision capabilities using ENHANCED detection...`);
      
      // Check each model for vision capabilities using our enhanced detection
      for (const model of models) {
        try {
          const capabilities = this.isCompatibleModel(model);
          if (false) {
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
      
      logger.info(`[SUCCESS] ENHANCED vision capability detection complete: Found ${visionModels.length} vision-capable models out of ${models.length} total models`);
      logger.info(`Vision models: [${visionModels.join(', ')}]`);
      
      return visionModels;
    } catch (error) {
      logger.error('Failed to get available vision models:', error);
      return [];
    }
  }

  async getModelCapabilities(): Promise<ModelCapability[]> {
    // Capability detection disabled
    return [];
  }

  async processRequest(
    request: ChatRequest,
    memoryConfig?: MemoryConfig
  ): Promise<ProcessedRequest> {
    const capabilities = await this.detectCapabilities(request.model);

    // NEW: Tool description injection for MCP integration (subproject 3)
    let availableTools: any[] = [];
    if (capabilities.tools && !capabilities.vision) {
      try {
        logger.info('[DEBUG] [OllamaStreamliner] Detected tool-capable model, injecting MCP tools...');
        
        if (availableTools.length > 0) {
          logger.info(`[SUCCESS] [OllamaStreamliner] Found ${availableTools.length} MCP tools for injection`);
        } else {
          logger.debug('[DEBUG] [OllamaStreamliner] No MCP tools available for injection');
        }
      } catch (error) {
        logger.error('[ERROR] [OllamaStreamliner] Failed to get MCP tools:', error);
        // Continue without tools if MCP fails
      }
    }

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
    return this.formatTextRequest(request, messages, availableTools);
  }

  private async formatHybridVisionRequest(
    request: ChatRequest,
    history: Array<{ role: string; content: string; images?: string[] }>, availableTools?: any[]
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
      const enhancedContent = `${request.content}\\n\\n[Image Analysis: ${imageDescription}]`;
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
    history: Array<{ role: string; content: string; images?: string[] }>, availableTools?: any[]
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
    history: Array<{ role: string; content: string; images?: string[] }>, availableTools?: any[]
  ): ProcessedRequest {
    // Build messages with tool descriptions in system prompt
    let messages = [...history];
    
    // NEW: Inject tool descriptions into system prompt for tool-capable models
    if (availableTools && availableTools.length > 0) {
      const toolDescriptions = availableTools.map(tool => 
        `- ${tool.name}: ${tool.description}`
      ).join('\n');
      
      const toolSystemPrompt = `You have access to the following tools:\n\n${toolDescriptions}\n\nWhen you need to use a tool, respond with the appropriate tool call.`;
      
      // Check if there's already a system message
      if (messages.length > 0 && messages[0].role === 'system') {
        // Append to existing system message
        messages[0].content += `\n\n${toolSystemPrompt}`;
      } else {
        // Insert new system message at the beginning
        messages.unshift({
          role: 'system',
          content: toolSystemPrompt
        });
      }
      
      logger.debug(`[DEBUG] [OllamaStreamliner] Injected ${availableTools.length} tool descriptions into system prompt`);
    }
    
    // Add current message to history
    messages.push({
      role: 'user',
      content: request.content
    });


    // NEW: Format tools for Ollama if available
    let formattedTools: any[] = [];
    if (availableTools && availableTools.length > 0) {
      logger.debug(`[DEBUG] [OllamaStreamliner] Formatted ${formattedTools.length} tools for Ollama`);
    }

    return {
      model: request.model,
      messages,
      stream: true,
      tools: formattedTools.length > 0 ? formattedTools : undefined,
      tool_choice: formattedTools.length > 0 ? 'auto' : undefined
    };
  }

  // ENHANCED: streamChat method with improved thinking processing and better error handling
  async streamChat(
    processedRequest: ProcessedRequest,
    onToken: (token: string) => void,
    onComplete?: (result: StreamResult) => void,
    clientIp?: string
  ): Promise<void> {
    const ollamaHost = this.getOllamaHost(clientIp);
    
    logger.info(`Starting stream chat with model: ${processedRequest.model} (Multi-host)`);
    logger.debug(`Request preview: ${JSON.stringify({
      model: processedRequest.model,
      messageCount: processedRequest.messages.length,
      lastMessagePreview: processedRequest.messages[processedRequest.messages.length - 1]?.content?.substring(0, 100) + '...',
      host: ollamaHost
    })}`);
    
    // Create AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      logger.warn(`Stream timeout reached for model ${processedRequest.model}, aborting...`);
      controller.abort();
    }, 120000); // 2 minutes timeout for streaming
    
    // Buffer to accumulate full response content
    let fullResponseContent = '';
    
    try {
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processedRequest),
        signal: controller.signal, // Add abort signal for timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Ollama chat request failed: ${response.status} ${response.statusText}`, { errorText, host: ollamaHost });
        if (this.loadBalancer) {
          this.loadBalancer.reportFailure(ollamaHost);
        }
        throw new AppError(response.status, `Ollama request failed: ${response.statusText} - ${errorText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let tokenCount = 0;
      let incompleteJsonBuffer = ''; // Buffer for handling incomplete JSON objects

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

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;
          
          // Split by newlines to process complete lines
          const lines = buffer.split('\n');
          
          // Keep the last line in buffer if it's incomplete
          buffer = lines.pop() || '';

          for (let line of lines) {
            line = line.trim();
            if (!line) continue;

            // Handle incomplete JSON from previous iterations
            if (incompleteJsonBuffer) {
              line = incompleteJsonBuffer + line;
              incompleteJsonBuffer = '';
            }

            try {
              const json = JSON.parse(line) as OllamaStreamResponse;
              
              // Check for errors in the response
              if (json.error) {
                logger.error(`Ollama returned error in stream: ${json.error}`);
                throw new Error(`Ollama stream error: ${json.error}`);
              }
              
              // Process content if available
              if (json.message?.content) {
                const token = json.message.content;
                tokenCount++;
                
                // Accumulate full content for thinking processing
                fullResponseContent += token;
                
                // Send token to client
                onToken(token);
                
                // TODO: Add tool call processing here for MCP integration
                // Log progress
                if (tokenCount === 1) {
                  logger.info('First token received and sent to client');
                }
                if (tokenCount % 50 === 0) {
                  logger.debug(`Streamed ${tokenCount} tokens so far`);
                }
              }
              
              // Check if stream is complete
              if (json.done) {
                logger.info(`Stream marked as done. Total tokens: ${tokenCount}`);
                if (json.done_reason) {
                  logger.debug(`Stream done reason: ${json.done_reason}`);
                }
              }
            } catch (parseError) {
              // If JSON parsing fails, it might be an incomplete object
              // Save it for the next iteration
              if (parseError instanceof SyntaxError) {
                // Check if it looks like the start of a JSON object
                if (line.startsWith('{')) {
                  incompleteJsonBuffer = line;
                  logger.debug('Buffering incomplete JSON object for next iteration');
                } else {
                  logger.error('Failed to parse Ollama response line:', { 
                    line: line.substring(0, 200), // Truncate for logging
                    error: parseError.message,
                    lineLength: line.length
                  });
                }
              } else {
                throw parseError;
              }
            }
          }
        }
        
        // Process any remaining buffered content
        if (buffer.trim() || incompleteJsonBuffer.trim()) {
          const remainingLine = (incompleteJsonBuffer + buffer).trim();
          if (remainingLine) {
            try {
              const json = JSON.parse(remainingLine) as OllamaStreamResponse;
              if (json.message?.content) {
                const token = json.message.content;
                tokenCount++;
                fullResponseContent += token;
                onToken(token);
                
                // TODO: Add tool call processing here for MCP integration
              }            } catch (error) {
              logger.debug('Failed to parse final buffered content:', { 
                content: remainingLine.substring(0, 200),
                error: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          }
        }
        
        logger.info(`Stream completed successfully with ${tokenCount} tokens from ${ollamaHost}`);
        
        // ENHANCED: Process thinking content after stream completion
        if (fullResponseContent && onComplete) {
          logger.debug('[BRAIN] Processing thinking content from completed response...');
          
          try {
            const thinkingResult = parseThinkingFromContent(fullResponseContent);
            
            if (thinkingResult.hasThinking) {
              logger.info(`[SUCCESS] Thinking content detected and parsed (${thinkingResult.thinkingContent.length} chars)`);
              logger.debug(`Thinking preview: ${thinkingResult.thinkingContent.substring(0, 100)}...`);
              
              // ENHANCED: Ensure thinking data has correct structure
              if (thinkingResult.thinkingData) {
                // Validate and ensure correct structure
                thinkingResult.thinkingData.hasThinking = true;
                thinkingResult.thinkingData.content = thinkingResult.thinkingContent;
                thinkingResult.thinkingData.processedAt = new Date();
                
                logger.debug('[BRAIN] Enhanced thinking data structure:', {
                  hasThinking: thinkingResult.thinkingData.hasThinking,
                  contentLength: thinkingResult.thinkingData.content.length,
                  processedAt: thinkingResult.thinkingData.processedAt
                });
              }
            } else {
              logger.debug('[BRAIN] No thinking content detected in response');
            }
            
            const streamResult: StreamResult = {
              fullContent: fullResponseContent,
              thinking: thinkingResult.hasThinking ? thinkingResult : undefined
            };
            
            onComplete(streamResult);
          } catch (error) {
            logger.error('Error processing thinking content:', error);
            // Still call onComplete with basic result
            onComplete({
              fullContent: fullResponseContent
            });
          }
        }
        
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
      
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      
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
      
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    // CRITICAL: In custom mode, return predefined model list WITHOUT any API calls
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      const customModels = customModelCapabilityService.getAvailableModelNames();
      logger.info(`[DEBUG] Using custom predefined model list (NO API calls): [${customModels.join(', ')}]`);
      return customModels;
    }

    // Automatic mode - make API call to list models
    const ollamaHost = this.getOllamaHost();
    
    try {
      logger.debug(`[SEARCH] Attempting to fetch models from ${ollamaHost}/api/tags (Multi-host deployment)`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout for multi-host
      
      const response = await fetch(`${ollamaHost}/api/tags`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Olympian-AI-Lightweight/1.0-MultiHost'
        }
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        if (this.loadBalancer) {
          this.loadBalancer.reportFailure(ollamaHost);
        }
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
      }

      const data = await response.json() as OllamaModelListResponse;
      const models = data.models?.map((m) => m.name) || [];
      
      if (this.loadBalancer) {
        this.loadBalancer.reportSuccess(ollamaHost);
      }
      
      logger.info(`Successfully connected to Ollama at ${ollamaHost} (Multi-host deployment)`);
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
        timestamp: new Date().toISOString(),
        deployment: 'multi-host'
      };

      if (errorDetails.isNetworkError) {
        logger.error('🔗 Network connection failed to Ollama server (Multi-host):', {
          ...errorDetails,
          possibleCauses: [
            'Ollama server is not running',
            'Network connectivity issues',
            'DNS resolution failure',
            'Firewall blocking the connection',
            'Incorrect hostname/IP address',
            'Load balancer configuration issue'
          ],
          troubleshooting: [
            `Try: curl -v ${ollamaHost}/api/tags`,
            'Check if Ollama is running on the target host',
            'Verify network connectivity between containers',
            'Check firewall rules and security groups',
            'Verify load balancer health checks'
          ]
        });
      } else if (errorDetails.isTimeoutError) {
        logger.error('⏱️ Connection timeout to Ollama server (Multi-host):', {
          ...errorDetails,
          possibleCauses: [
            'Ollama server is overloaded',
            'Network latency too high',
            'Server is starting up',
            'Load balancer routing issue'
          ]
        });
      } else {
        logger.error('[ERROR] Failed to list Ollama models (Multi-host):', errorDetails);
      }
      
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      
      return [];
    }
  }

  // Get load balancer statistics (useful for monitoring multi-host deployment)
  getLoadBalancerStats(): Map<string, any> | null {
    return this.loadBalancer?.getStats() || null;
  }

  /**
   * Initialize the streamliner
   */
  async initialize(): Promise<void> {
    logger.info('[OllamaStreamliner] Initializing streamliner');
  }

  /**
   * Stream method for yielding responses
   */
  async *stream(request: any, memoryConfig?: any): AsyncGenerator<any, void, unknown> {
    const chunks: any[] = [];
    await this.streamChat(
      request,
      (chunk) => chunks.push(chunk),
      () => {},
      memoryConfig
    );
    for (const chunk of chunks) {
      yield chunk;
    }
  }

  /**
   * Get debug information
   */
  getDebugInfo(): any {
    return {
      deploymentConfig: this.deploymentConfig,
      memoryServiceStats: this.memoryService ? "Memory service active" : "No memory service"
    };
  }
}
