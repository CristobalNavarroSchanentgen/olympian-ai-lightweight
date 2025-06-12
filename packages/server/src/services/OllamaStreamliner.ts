import { ChatRequest, ProcessedRequest, ModelCapability } from '@olympian/shared';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

export class OllamaStreamliner {
  private modelCapabilities: Map<string, ModelCapability> = new Map();
  private ollamaHost: string;

  constructor(ollamaHost: string = process.env.OLLAMA_HOST || 'http://localhost:11434') {
    this.ollamaHost = ollamaHost;
  }

  async detectCapabilities(model: string): Promise<ModelCapability> {
    // Check cache first
    if (this.modelCapabilities.has(model)) {
      return this.modelCapabilities.get(model)!;
    }

    try {
      // Query model info from Ollama
      const response = await fetch(`${this.ollamaHost}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.statusText}`);
      }

      const modelInfo = await response.json();
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
    const visionModels = ['llava', 'bakllava', 'llava-llama3', 'llava-phi3'];
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

  async processRequest(request: ChatRequest): Promise<ProcessedRequest> {
    const capabilities = await this.detectCapabilities(request.model);

    // Vision handling
    if (request.images && request.images.length > 0) {
      if (!capabilities.vision) {
        throw new AppError(
          400,
          `The selected model '${request.model}' doesn't support images. Please choose a vision-capable model like llava or bakllava.`,
          'MODEL_CAPABILITY_ERROR'
        );
      }
      return this.formatVisionRequest(request);
    }

    // Standard text handling
    return this.formatTextRequest(request);
  }

  private formatVisionRequest(request: ChatRequest): ProcessedRequest {
    return {
      model: request.model,
      messages: [{
        role: 'user',
        content: request.content,
        images: request.images,
      }],
      stream: true,
    };
  }

  private formatTextRequest(request: ChatRequest): ProcessedRequest {
    return {
      model: request.model,
      messages: [{
        role: 'user',
        content: request.content,
      }],
      stream: true,
    };
  }

  async streamChat(processedRequest: ProcessedRequest, onToken: (token: string) => void): Promise<void> {
    const response = await fetch(`${this.ollamaHost}/api/chat`, {
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
              const json = JSON.parse(line);
              if (json.message?.content) {
                onToken(json.message.content);
              }
            } catch (error) {
              logger.error('Failed to parse Ollama response:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.ollamaHost}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.statusText}`);
      }

      const data = await response.json();
      return data.models?.map((m: any) => m.name) || [];
    } catch (error) {
      logger.error('Failed to list Ollama models:', error);
      return [];
    }
  }
}