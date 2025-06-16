import { logger } from '../utils/logger';
import { getDeploymentConfig } from '../config/deployment';

export interface OllamaHealthStatus {
  connected: boolean;
  host: string;
  modelCount: number;
  visionModelCount: number;
  error?: string;
  models?: string[];
  visionModels?: string[];
}

export class OllamaHealthCheck {
  private deploymentConfig = getDeploymentConfig();

  async checkHealth(): Promise<OllamaHealthStatus> {
    const ollamaHost = this.deploymentConfig.ollama.host;
    
    try {
      // Test basic connectivity
      logger.info(`Checking Ollama health at ${ollamaHost}`);
      
      const response = await fetch(`${ollamaHost}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];
      
      // Check for vision models using name patterns
      const visionPatterns = [
        /llava/i, /bakllava/i, /llava-llama3/i, /llava-phi3/i,
        /llama3\.2-vision/i, /moondream/i, /cogvlm/i, /instructblip/i,
        /minicpm-v/i, /qwen.*vl/i, /vision/i, /multimodal/i
      ];
      
      const visionModels = models.filter((model: string) => 
        visionPatterns.some(pattern => pattern.test(model))
      );

      return {
        connected: true,
        host: ollamaHost,
        modelCount: models.length,
        visionModelCount: visionModels.length,
        models: models.slice(0, 10), // First 10 models
        visionModels
      };
    } catch (error) {
      logger.error(`Ollama health check failed for ${ollamaHost}:`, error);
      
      return {
        connected: false,
        host: ollamaHost,
        modelCount: 0,
        visionModelCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async ensureVisionModelsAvailable(): Promise<void> {
    const health = await this.checkHealth();
    
    if (!health.connected) {
      logger.error('Cannot ensure vision models - Ollama not connected');
      return;
    }

    if (health.visionModelCount === 0) {
      logger.warn('No vision models detected in Ollama. Vision features will be limited.');
      logger.info('To enable vision features, install a vision model like:');
      logger.info('  ollama pull llava:13b');
      logger.info('  ollama pull bakllava');
      logger.info('  ollama pull moondream');
    } else {
      logger.info(`Found ${health.visionModelCount} vision models: ${health.visionModels?.join(', ')}`);
    }
  }
}
