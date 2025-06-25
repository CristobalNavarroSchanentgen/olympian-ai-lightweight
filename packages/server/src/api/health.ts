import { Router } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { getDeploymentConfig } from '../config/deployment';
import { OllamaHealthCheck } from '../services/OllamaHealthCheck';
import { customModelCapabilityService } from '../services/CustomModelCapabilityService';
import { MongoClient } from 'mongodb';

interface OllamaVersionResponse {
  version?: string;
}

const router = Router();
const db = DatabaseService.getInstance();
const ollamaHealthCheck = OllamaHealthCheck.getInstance(); // Fix: Use singleton pattern

// Basic health check - always returns 200 if server is running
// This is used by Docker health checks and should remain simple
router.get('/', (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  
  res.json({
    status: 'ok',
    timestamp: new Date(),
    deploymentMode: deploymentConfig.mode,
    modelCapabilityMode: deploymentConfig.modelCapability.mode,
    uptime: process.uptime(),
    message: 'Server is running and accepting requests',
  });
});

// Service health check - comprehensive status of all services
router.get('/services', async (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  const services: Record<string, any> = {};
  let overallHealthy = true;

  // Check MongoDB with enhanced error handling
  try {
    const isHealthy = await db.isHealthy();
    if (isHealthy) {
      services.mongodb = {
        status: 'healthy',
        uri: deploymentConfig.mongodb.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // Hide credentials
        deploymentMode: deploymentConfig.mode,
        message: 'MongoDB connection active',
      };
    } else {
      throw new Error('Database health check failed');
    }
  } catch (error) {
    services.mongodb = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      deploymentMode: deploymentConfig.mode,
      message: 'MongoDB connection issues detected',
      troubleshooting: deploymentConfig.mode === 'multi-host' ? [
        'Verify MongoDB container is running and healthy',
        'Check Docker network connectivity',
        'Ensure MongoDB service is accessible via service name'
      ] : [
        'Check if MongoDB service is running',
        'Verify connection string and credentials',
        'Check network connectivity'
      ]
    };
    
    // For multi-host deployments, database issues are not always critical
    if (deploymentConfig.mode !== 'multi-host') {
      overallHealthy = false;
    }
  }

  // Check Ollama with enhanced multi-host diagnostics
  const ollamaChecks = [];
  const hostsToCheck = deploymentConfig.ollama.hosts.length > 0 
    ? deploymentConfig.ollama.hosts 
    : [deploymentConfig.ollama.host];

  let ollamaHealthy = false;

  for (const host of hostsToCheck) {
    try {
      const startTime = Date.now();
      const response = await fetch(`${host}/api/version`, {
        signal: AbortSignal.timeout(deploymentConfig.mode === 'multi-host' ? 8000 : 3000),
      });
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const version = await response.json() as OllamaVersionResponse;
        ollamaChecks.push({
          host,
          status: 'healthy',
          version: version.version || 'unknown',
          responseTime,
          message: 'Ollama service accessible',
        });
        ollamaHealthy = true;
      } else {
        ollamaChecks.push({
          host,
          status: 'unhealthy',
          error: `HTTP ${response.status}`,
          responseTime,
          message: 'Ollama service returned error response',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let diagnosticInfo = '';
      let troubleshootingSteps: string[] = [];
      
      if (deploymentConfig.mode === 'multi-host') {
        if (errorMessage.includes('timeout')) {
          diagnosticInfo = 'External host timeout - check network connectivity and firewall';
          troubleshootingSteps = [
            'Verify external Ollama service is running',
            'Check network connectivity from container to external host',
            'Verify firewall allows connections on port 11434',
            `Test manually: curl -f ${host}/api/version`,
          ];
        } else if (errorMessage.includes('ENOTFOUND')) {
          diagnosticInfo = 'DNS resolution failed - verify hostname is correct';
          troubleshootingSteps = [
            'Check hostname/IP address is correct',
            'Verify DNS resolution from container',
            'Test connectivity: ping ' + host.replace(/^https?:\/\//, ''),
          ];
        } else if (errorMessage.includes('ECONNREFUSED')) {
          diagnosticInfo = 'Connection refused - check if Ollama is running on port 11434';
          troubleshootingSteps = [
            'Verify Ollama service is running on the external host',
            'Check if port 11434 is open and accessible',
            'Verify no firewall blocking the connection',
          ];
        }
      } else {
        troubleshootingSteps = [
          'Check if Ollama container is running',
          'Verify Docker network connectivity',
          'Check container logs for errors',
        ];
      }
      
      ollamaChecks.push({
        host,
        status: 'unhealthy',
        error: errorMessage,
        diagnostic: diagnosticInfo,
        troubleshooting: troubleshootingSteps,
        message: 'Cannot connect to Ollama service',
      });
    }
  }

  // For multi-host deployments, Ollama unavailability is not critical for basic functionality
  if (!ollamaHealthy && deploymentConfig.mode !== 'multi-host') {
    overallHealthy = false;
  }

  services.ollama = {
    deploymentMode: deploymentConfig.mode,
    loadBalancer: deploymentConfig.ollama.loadBalancer,
    hosts: ollamaChecks,
    overallStatus: ollamaHealthy ? 'healthy' : 'degraded',
    message: ollamaHealthy ? 'Ollama service accessible' : 'Ollama connectivity issues',
    troubleshooting: deploymentConfig.mode === 'multi-host' && !ollamaHealthy ? {
      summary: 'External Ollama service connectivity issues detected',
      tips: [
        'Verify external Ollama service is running and accessible',
        'Check firewall rules allow connections on port 11434',
        'Test connectivity: curl -f ' + deploymentConfig.ollama.host + '/api/version',
        'Ensure Docker container can reach external network',
        'Check DNS resolution and network routing',
      ]
    } : null
  };

  // Add model capability service health
  services.modelCapabilities = {
    mode: deploymentConfig.modelCapability.mode,
    status: 'healthy',
    message: `Using ${deploymentConfig.modelCapability.mode} capability detection mode`,
    details: deploymentConfig.modelCapability.mode === 'custom' ? {
      predefinedModels: customModelCapabilityService.getCapabilityStats(),
      availableModels: customModelCapabilityService.getAvailableModelNames().length,
      visionModels: customModelCapabilityService.getCustomVisionModels().length,
      toolsModels: customModelCapabilityService.getCustomToolsModels().length,
      reasoningModels: customModelCapabilityService.getCustomReasoningModels().length,
    } : {
      description: 'Dynamic capability detection via API testing',
      performance: 'Slower but more accurate',
      note: 'Capabilities detected by testing each model'
    }
  };

  // Overall health status - more lenient for multi-host deployments
  const statusCode = overallHealthy ? 200 : (deploymentConfig.mode === 'multi-host' ? 200 : 503);
  
  res.status(statusCode).json({
    status: overallHealthy ? 'healthy' : 'degraded',
    deploymentMode: deploymentConfig.mode,
    modelCapabilityMode: deploymentConfig.modelCapability.mode,
    services,
    timestamp: new Date(),
    summary: {
      httpServer: 'running',
      mongodb: services.mongodb.status,
      ollama: ollamaHealthy ? 'healthy' : 'degraded',
      modelCapabilities: 'healthy',
      overallHealthy,
      note: deploymentConfig.mode === 'multi-host' ? 
        'Multi-host deployments can operate with limited external service availability' : 
        'All services required for full functionality'
    }
  });
});

// Deployment configuration info
router.get('/config', (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  
  res.json({
    deploymentMode: deploymentConfig.mode,
    modelCapabilityMode: deploymentConfig.modelCapability.mode,
    mongodb: {
      configured: !!deploymentConfig.mongodb.uri,
      hasReplicaSet: !!deploymentConfig.mongodb.options.replicaSet,
      uri: deploymentConfig.mongodb.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'),
    },
    ollama: {
      multiHost: deploymentConfig.ollama.hosts.length > 0,
      hostCount: Math.max(1, deploymentConfig.ollama.hosts.length),
      loadBalancer: deploymentConfig.ollama.loadBalancer,
      primaryHost: deploymentConfig.ollama.host,
    },
    modelCapabilities: {
      mode: deploymentConfig.modelCapability.mode,
      description: deploymentConfig.modelCapability.mode === 'custom' 
        ? 'Using predefined model capabilities (faster, no testing)'
        : 'Using automatic capability detection (slower, more accurate)',
      benefits: deploymentConfig.modelCapability.mode === 'custom'
        ? ['Faster startup', 'No API testing required', 'Predictable performance', 'Reduced server load']
        : ['More accurate detection', 'Supports new models', 'Dynamic capability discovery', 'No configuration needed'],
      stats: deploymentConfig.modelCapability.mode === 'custom' 
        ? customModelCapabilityService.getCapabilityStats()
        : null
    },
    network: {
      serviceDiscovery: deploymentConfig.network.serviceDiscoveryEnabled,
      subnet: deploymentConfig.network.subnet,
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      dockerized: process.env.RUNNING_IN_DOCKER === 'true',
      uptime: process.uptime(),
      port: process.env.PORT || 4000,
    },
    timestamp: new Date(),
  });
});

// Vision-specific health check endpoint with enhanced multi-host diagnostics
router.get('/vision', async (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  
  try {
    const health = await ollamaHealthCheck.checkHealth();
    
    const diagnostics = {
      ...health,
      deploymentMode: deploymentConfig.mode,
      modelCapabilityMode: deploymentConfig.modelCapability.mode,
      timestamp: new Date(),
      capabilityDetection: {
        mode: deploymentConfig.modelCapability.mode,
        visionModelsSource: deploymentConfig.modelCapability.mode === 'custom' 
          ? 'predefined list' 
          : 'dynamic detection',
        predefinedVisionModels: deploymentConfig.modelCapability.mode === 'custom'
          ? customModelCapabilityService.getCustomVisionModels()
          : null
      },
      recommendations: (() => {
        if (!health.connected) {
          if (deploymentConfig.mode === 'multi-host') {
            return {
              type: 'connectivity',
              severity: 'warning',
              message: 'External Ollama service not reachable',
              impact: 'Vision features will be unavailable until connectivity is restored',
              steps: [
                'Verify Ollama is running on the external host',
                'Check network connectivity from container to external host',
                'Verify firewall allows port 11434',
                `Test manually: curl -f ${health.host}/api/version`,
                'Check Docker network settings and DNS resolution',
                'Consider using health check endpoint: /api/health/services',
              ]
            };
          } else {
            return {
              type: 'service',
              severity: 'error',
              message: 'Ollama service not available',
              impact: 'Vision features completely unavailable',
              steps: [
                'Check if Ollama container is running',
                'Verify Docker network connectivity',
                'Check container logs for errors',
                'Restart Ollama service if necessary',
              ]
            };
          }
        } else if (health.visionModelCount === 0) {
          if (deploymentConfig.modelCapability.mode === 'custom') {
            return {
              type: 'models',
              severity: 'info',
              message: 'Using predefined vision model list',
              impact: 'Vision features available if predefined models are installed',
              steps: [
                'Install predefined vision models:',
                '  - ollama pull llama3.2-vision:11b',
                '  - ollama pull granite3.2-vision:2b',
                'Verify models are available: ollama list',
                'No need to restart - predefined capabilities will be used',
              ],
              predefinedModels: customModelCapabilityService.getCustomVisionModels()
            };
          } else {
            return {
              type: 'models',
              severity: 'warning',
              message: 'No vision models detected via automatic detection',
              impact: 'Vision features available but no models installed',
              steps: [
                '1. Connect to the Ollama host',
                '2. Install a vision model: ollama pull llava:13b',
                '3. Verify with: ollama list',
                '4. Restart backend service to refresh model cache',
                'Alternative models: bakllava, moondream, llava-phi3',
              ]
            };
          }
        } else {
          return {
            type: 'success',
            severity: 'info',
            message: `Found ${health.visionModelCount} vision models via ${deploymentConfig.modelCapability.mode} detection`,
            impact: 'Full vision functionality available',
            models: health.visionModels,
            performance: health.responseTime ? `Response time: ${health.responseTime}ms` : 'Performance metrics available',
            detectionMode: deploymentConfig.modelCapability.mode
          };
        }
      })()
    };

    const statusCode = health.connected ? 200 : (deploymentConfig.mode === 'multi-host' ? 200 : 503);
    res.status(statusCode).json(diagnostics);
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      deploymentMode: deploymentConfig.mode,
      modelCapabilityMode: deploymentConfig.modelCapability.mode,
      timestamp: new Date(),
      recommendations: {
        type: 'error',
        severity: 'error',
        message: 'Health check failed with unexpected error',
        impact: 'Cannot determine vision service status',
        steps: [
          'Check server logs for detailed error information',
          'Verify server configuration',
          'Check system resources (memory, CPU)',
          'Restart backend service if issues persist',
          'Contact support if problem continues',
        ]
      }
    });
  }
});

export { router as healthRouter };
