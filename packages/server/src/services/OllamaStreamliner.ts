import { ChatRequest, ProcessedRequest, ModelCapability, VisionError } from '@olympian/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { getDeploymentConfig, OllamaLoadBalancer } from '../config/deployment';
import { ChatMemoryService, MemoryConfig } from './ChatMemoryService';

interface OllamaModelInfo {
  modelfile?: string;
  description?: string;
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
}

export class OllamaStreamliner {
  private modelCapabilities: Map<string, ModelCapability> = new Map();
  private deploymentConfig = getDeploymentConfig();
  private loadBalancer?: OllamaLoadBalancer;
  private memoryService: ChatMemoryService;
  private visionModels = ['llava:13b', 'llava:7b', 'llama3.2-vision:11b', 'bakllava', 'llava-llama3', 'llava-phi3'];

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
      
      // Parse capabilities from modelfile
      const capability: ModelCapability = {
        name: model,
        vision: this.hasVisionSupport(model, modelfile),
        tools: this.hasToolSupport(model, modelfile),
        maxTokens: this.parseMaxTokens(modelfile) || 4096,
        contextWindow: this.parseContextWindow(modelfile) || 128000,
        description: modelInfo.description,
      };

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

  private hasVisionSupport(model: string, modelfile: string): boolean {
    // Known vision models
    const visionModels = ['llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'llama3.2-vision'];
    return visionModels.some(vm => model.toLowerCase().includes(vm)) ||
           modelfile.toLowerCase().includes('vision') ||
           modelfile.toLowerCase().includes('image');
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
    
    try {
      // Use the vision model to describe the images
      const response = await fetch(`${ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: visionModel,
          prompt: `Describe the following image(s) in detail: ${content}`,
          images: await Promise.all(images.map(img => this.encodeImage(img))),
          stream: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Vision model request failed: ${response.statusText}`);
      }

      const result = await response.json() as OllamaGenerateResponse;
      return result.response || 'Unable to process image';
    } catch (error) {
      logger.error('Failed to process image with vision model:', error);
      throw error;
    }
  }

  async getAvailableVisionModels(): Promise<string[]> {
    const models = await this.listModels();
    return models.filter(model => 
      this.visionModels.some(vm => model.toLowerCase().includes(vm.toLowerCase()))
    );
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
      // If a vision model is specified, use hybrid processing
      if (request.visionModel) {
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
      const response = await fetch(`${ollamaHost}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json() as OllamaModelListResponse;
      return data.models?.map((m) => m.name) || [];
    } catch (error) {
      logger.error('Failed to list Ollama models:', error);
      
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