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

export class OllamaStreamliner {
  private modelCapabilities: Map<string, ModelCapability> = new Map();
  private deploymentConfig = getDeploymentConfig();
  private loadBalancer?: OllamaLoadBalancer;
  private memoryService: ChatMemoryService;

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
      return this.modelCapabilities.get(model)!;
    }

    const ollamaHost = this.getOllamaHost();

    try {
      // Query model info from Ollama
      const response = await fetch(`${ollamaHost}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.statusText}`);
      }

      const modelInfo = await response.json() as OllamaModelInfo;
      const modelfile = modelInfo.modelfile || '';
      
      // Parse capabilities from modelfile and metadata
      const capability: ModelCapability = {
        name: model,
        vision: this.hasVisionSupport(model, modelInfo),
        tools: this.hasToolSupport(model, modelfile),
        maxTokens: this.parseMaxTokens(modelfile) || 4096,
        contextWindow: this.parseContextWindow(modelfile) || 128000,
        description: modelInfo.description,
      };

      // Log vision detection details for debugging
      logger.debug(`Vision detection for model ${model}:`, {
        modalities: modelInfo.modalities,
        architecture: modelInfo.model_info?.architecture,
        families: modelInfo.details?.families,
        hasVision: capability.vision,
        modelfile: modelfile.substring(0, 200) + '...' // Truncate for logging
      });

      // Cache the result
      this.modelCapabilities.set(model, capability);
      
      return capability;
    } catch (error) {
      logger.error(`Failed to detect capabilities for model ${model}:`, error);
      
      if (this.loadBalancer) {
        this.loadBalancer.reportFailure(ollamaHost);
      }
      
      // Return default capabilities
      return {
        name: model,
        vision: false,
        tools: false,
        maxTokens: 4096,
        contextWindow: 8192,
      };
    }
  }

  private hasVisionSupport(model: string, modelInfo: OllamaModelInfo): boolean {
    // Method 1: Check modalities field (most reliable)
    if (modelInfo.modalities && Array.isArray(modelInfo.modalities)) {
      const hasVisionModality = modelInfo.modalities.some(modality => 
        ['vision', 'multimodal'].includes(modality.toLowerCase())
      );
      if (hasVisionModality) {
        logger.debug(`Vision detected via modalities for ${model}: ${modelInfo.modalities.join(', ')}`);
        return true;
      }
    }

    // Method 2: Check architecture for vision components
    if (modelInfo.model_info?.architecture) {
      const architecture = modelInfo.model_info.architecture.toLowerCase();
      if (architecture.includes('vision') || 
          architecture.includes('clip') ||
          architecture.includes('vit') ||
          architecture.includes('llava')) {
        logger.debug(`Vision detected via architecture for ${model}: ${architecture}`);
        return true;
      }
    }

    // Method 3: Check model families
    if (modelInfo.details?.families && Array.isArray(modelInfo.details.families)) {
      const hasVisionFamily = modelInfo.details.families.some(family =>
        ['llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'moondream', 'vision'].includes(family.toLowerCase())
      );
      if (hasVisionFamily) {
        logger.debug(`Vision detected via families for ${model}: ${modelInfo.details.families.join(', ')}`);
        return true;
      }
    }

    // Method 4: Check modelfile for vision-related configurations
    const modelfile = modelInfo.modelfile || '';
    if (modelfile.toLowerCase().includes('vision') ||
        modelfile.toLowerCase().includes('image') ||
        modelfile.toLowerCase().includes('clip') ||
        modelfile.includes('vision_encoder') ||
        modelfile.includes('image_processor')) {
      logger.debug(`Vision detected via modelfile for ${model}`);
      return true;
    }

    // Method 5: Fallback to name pattern matching (least reliable)
    const visionPatterns = [
      'llava', 'bakllava', 'llava-llama3', 'llava-phi3', 
      'llama3.2-vision', 'moondream', 'vision', 'multimodal'
    ];
    const hasVisionPattern = visionPatterns.some(pattern => 
      model.toLowerCase().includes(pattern.toLowerCase())
    );
    
    if (hasVisionPattern) {
      logger.debug(`Vision detected via name pattern for ${model}`);
      return true;
    }

    logger.debug(`No vision capability detected for ${model}`);
    return false;
  }

  private hasToolSupport(model: string, modelfile: string): boolean {
    // Models that support function calling
    const toolModels = ['mistral', 'mixtral', 'llama3', 'llama-3.1'];
    return toolModels.some(tm => model.toLowerCase().includes(tm)) ||
           modelfile.includes('TOOLS') ||
           modelfile.includes('function');
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
      
      // Check each model for vision capabilities using our robust detection
      for (const model of models) {
        try {
          const capabilities = await this.detectCapabilities(model);
          if (capabilities.vision) {
            visionModels.push(model);
          }
        } catch (error) {
          logger.debug(`Failed to check vision capability for model ${model}:`, error);
          // Continue checking other models
        }
      }
      
      logger.info(`Found ${visionModels.length} vision-capable models: ${visionModels.join(', ')}`);
      return visionModels;
    } catch (error) {
      logger.error('Failed to get available vision models:', error);
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
    // Process images with vision model first
    const imageDescription = await this.processImageWithVisionModel(
      request.images!,
      request.content,
      request.visionModel!
    );

    // Add the processed content to history
    const messages = [
      ...history,
      {
        role: 'user',
        content: `${request.content} [Image Description: ${imageDescription}]`,
      },
    ];

    return {
      model: request.model,
      messages,
      stream: true,
    };
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
    
    try {
      const response = await fetch(`${ollamaHost}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processedRequest),
      });

      if (!response.ok) {
        throw new AppError(response.status, `Ollama request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const json = JSON.parse(line) as OllamaStreamResponse;
                if (json.message?.content) {
                  onToken(json.message.content);
                }
              } catch (error) {
                logger.error('Failed to parse Ollama response:', error);
              }
            }
          }
        }
        
        // Report success to load balancer
        if (this.loadBalancer) {
          this.loadBalancer.reportSuccess(ollamaHost);
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
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
      logger.debug(`Fetching models from ${ollamaHost}/api/tags`);
      const response = await fetch(`${ollamaHost}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json() as OllamaModelListResponse;
      const models = data.models?.map((m) => m.name) || [];
      logger.debug(`Found ${models.length} models: ${models.join(', ')}`);
      return models;
    } catch (error) {
      logger.error('Failed to list Ollama models:', {
        error: error instanceof Error ? error.message : error,
        host: ollamaHost
      });
      
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