import { logger } from '../utils/logger';
import { customModelCapabilityService } from "./customModelCapabilityServiceStub";
import { getDeploymentConfig } from '../config/deployment';

export interface OllamaHealthStatus {
  connected: boolean;
  host: string;
  modelCount: number;
  visionModelCount: number;
  error?: string;
  models?: string[];
  visionModels?: string[];
  responseTime?: number;
}

interface OllamaModel {
  name: string;
  // Add other properties if needed
}

interface OllamaTagsResponse {
  models?: OllamaModel[];
}

export class OllamaHealthCheck {
  private static instance: OllamaHealthCheck;
  private deploymentConfig = getDeploymentConfig();

  private constructor() {}

  // NEW: Add singleton pattern for multi-host deployment (Subproject 3)
  public static getInstance(): OllamaHealthCheck {
    if (!OllamaHealthCheck.instance) {
      OllamaHealthCheck.instance = new OllamaHealthCheck();
    }
    return OllamaHealthCheck.instance;
  }

  public async initialize(): Promise<void> {
    // Initialization logic for multi-host deployment
    logger.info('🏥 [OllamaHealthCheck] Initialized for multi-host deployment');
  }

  async checkHealth(): Promise<OllamaHealthStatus> {
    // CRITICAL: In custom mode, skip all API calls and return predefined data
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      logger.info('🔧 Custom mode enabled - skipping Ollama health check (NO API calls)');
      
      const customModels = customModelCapabilityService.getAvailableModelNames();
      const customVisionModels = customModelCapabilityService.getCustomVisionModels();
      
      return {
        connected: true, // Always "connected" in custom mode
        host: 'CUSTOM_MODE_NO_HOST',
        modelCount: customModels.length,
        visionModelCount: customVisionModels.length,
        models: customModels,
        visionModels: customVisionModels,
        responseTime: 0, // No API call made
        error: undefined
      };
    }

    // Automatic mode - proceed with normal health check
    const ollamaHost = this.deploymentConfig.ollama.host;
    const startTime = Date.now();
    
    try {
      // Test basic connectivity with extended timeout for external hosts
      logger.info(`Checking Ollama health at ${ollamaHost}`);
      
      // Use longer timeout for multi-host deployments as external services may be slower
      const timeoutMs = this.deploymentConfig.mode === 'multi-host' ? 10000 : 5000;
      
      const response = await fetch(`${ollamaHost}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as OllamaTagsResponse;
      const models = data.models?.map((m) => m.name) || [];
      
      // Check for vision models using name patterns
      const visionPatterns = [
        /llava/i, /bakllava/i, /llava-llama3/i, /llava-phi3/i,
        /llama3\.2-vision/i, /moondream/i, /cogvlm/i, /instructblip/i,
        /minicpm-v/i, /qwen.*vl/i, /vision/i, /multimodal/i
      ];
      
      const visionModels = models.filter((model: string) => 
        visionPatterns.some(pattern => pattern.test(model))
      );

      const responseTime = Date.now() - startTime;
      
      return {
        connected: true,
        host: ollamaHost,
        modelCount: models.length,
        visionModelCount: visionModels.length,
        models: models.slice(0, 10), // First 10 models
        visionModels,
        responseTime
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      logger.error(`Ollama health check failed for ${ollamaHost}:`, error);
      
      // Provide more detailed error information for troubleshooting
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
          errorMessage = `Connection timeout (${responseTime}ms) - Check if ${ollamaHost} is accessible`;
        } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          errorMessage = `Cannot reach ${ollamaHost} - Check hostname/IP and firewall settings`;
        } else {
          errorMessage = error.message;
        }
      }
      
      return {
        connected: false,
        host: ollamaHost,
        modelCount: 0,
        visionModelCount: 0,
        error: errorMessage,
        responseTime
      };
    }
  }

  async ensureVisionModelsAvailable(): Promise<void> {
    // CRITICAL: In custom mode, skip all checks since we use predefined models
    if (this.deploymentConfig.modelCapability.mode === 'custom') {
      const customVisionModels = customModelCapabilityService.getCustomVisionModels();
      logger.info(`🔧 Custom mode - Using ${customVisionModels.length} predefined vision models: ${customVisionModels.join(', ')}`);
      logger.info('📋 No Ollama connectivity check required in custom mode');
      return;
    }

    // Automatic mode - proceed with normal health check
    const health = await this.checkHealth();
    
    if (!health.connected) {
      logger.error('Cannot ensure vision models - Ollama not connected');
      
      if (this.deploymentConfig.mode === 'multi-host') {
        logger.error('Multi-host deployment troubleshooting:');
        logger.error(`1. Verify Ollama is running at: ${health.host}`);
        logger.error('2. Check network connectivity from container to external host');
        logger.error('3. Verify firewall settings allow connections on port 11434');
        logger.error('4. Test manually: curl -f ' + health.host + '/api/tags');
      }
      
      // In multi-host mode, log the error but don't throw - let the application continue
      if (this.deploymentConfig.mode === 'multi-host') {
        logger.warn('Continuing startup despite Ollama connectivity issues in multi-host mode');
        return;
      }
      
      // For same-host deployments, this might indicate a more serious configuration issue
      throw new Error(`Ollama connectivity failed: ${health.error}`);
    }

    if (health.visionModelCount === 0) {
      logger.warn('No vision models detected in Ollama. Vision features will be limited.');
      logger.info('To enable vision features, install a vision model like:');
      logger.info('  ollama pull llava:13b');
      logger.info('  ollama pull bakllava');
      logger.info('  ollama pull moondream');
      
      if (this.deploymentConfig.mode === 'multi-host') {
        logger.info(`Remember to install models on the external Ollama host: ${health.host}`);
      }
    } else {
      logger.info(`Found ${health.visionModelCount} vision models: ${health.visionModels?.join(', ')}`);
      logger.info(`Ollama response time: ${health.responseTime}ms`);
    }
  }
}
