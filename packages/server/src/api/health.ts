import { Router } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { getDeploymentConfig } from '../config/deployment';
import { OllamaHealthCheck } from '../services/OllamaHealthCheck';
import { MongoClient } from 'mongodb';

interface OllamaVersionResponse {
  version?: string;
}

const router = Router();
const db = DatabaseService.getInstance();
const ollamaHealthCheck = new OllamaHealthCheck();

// Basic health check - always returns 200 if server is running
// This is used by Docker health checks and should remain simple
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    deploymentMode: process.env.DEPLOYMENT_MODE || 'multi-host',
    uptime: process.uptime(),
  });
});

// Service health check - comprehensive status of all services
router.get('/services', async (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  const services: Record<string, any> = {};
  let overallHealthy = true;

  // Check MongoDB
  try {
    const client = new MongoClient(deploymentConfig.mongodb.uri, {
      serverSelectionTimeoutMS: 2000,
    });
    await client.connect();
    await client.db().admin().ping();
    await client.close();
    
    services.mongodb = {
      status: 'healthy',
      uri: deploymentConfig.mongodb.uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'), // Hide credentials
      deploymentMode: deploymentConfig.mode,
    };
  } catch (error) {
    services.mongodb = {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      deploymentMode: deploymentConfig.mode,
    };
    overallHealthy = false;
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
        signal: AbortSignal.timeout(deploymentConfig.mode === 'multi-host' ? 8000 : 2000),
      });
      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const version = await response.json() as OllamaVersionResponse;
        ollamaChecks.push({
          host,
          status: 'healthy',
          version: version.version || 'unknown',
          responseTime,
        });
        ollamaHealthy = true;
      } else {
        ollamaChecks.push({
          host,
          status: 'unhealthy',
          error: `HTTP ${response.status}`,
          responseTime,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      let diagnosticInfo = '';
      
      if (deploymentConfig.mode === 'multi-host') {
        if (errorMessage.includes('timeout')) {
          diagnosticInfo = 'External host timeout - check network connectivity and firewall';
        } else if (errorMessage.includes('ENOTFOUND')) {
          diagnosticInfo = 'DNS resolution failed - verify hostname is correct';
        } else if (errorMessage.includes('ECONNREFUSED')) {
          diagnosticInfo = 'Connection refused - check if Ollama is running on port 11434';
        }
      }
      
      ollamaChecks.push({
        host,
        status: 'unhealthy',
        error: errorMessage,
        diagnostic: diagnosticInfo,
      });
    }
  }

  if (!ollamaHealthy) {
    overallHealthy = false;
  }

  services.ollama = {
    deploymentMode: deploymentConfig.mode,
    loadBalancer: deploymentConfig.ollama.loadBalancer,
    hosts: ollamaChecks,
    troubleshooting: deploymentConfig.mode === 'multi-host' && !ollamaHealthy ? {
      tips: [
        'Verify external Ollama service is running and accessible',
        'Check firewall rules allow connections on port 11434',
        'Test connectivity: curl -f ' + deploymentConfig.ollama.host + '/api/version',
        'Ensure Docker container can reach external network'
      ]
    } : null
  };

  // Overall health status
  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'degraded',
    deploymentMode: deploymentConfig.mode,
    services,
    timestamp: new Date(),
    summary: {
      mongodb: services.mongodb.status,
      ollama: ollamaHealthy ? 'healthy' : 'degraded',
      overallHealthy
    }
  });
});

// Deployment configuration info
router.get('/config', (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  
  res.json({
    deploymentMode: deploymentConfig.mode,
    mongodb: {
      configured: !!deploymentConfig.mongodb.uri,
      hasReplicaSet: !!deploymentConfig.mongodb.options.replicaSet,
    },
    ollama: {
      multiHost: deploymentConfig.ollama.hosts.length > 0,
      hostCount: Math.max(1, deploymentConfig.ollama.hosts.length),
      loadBalancer: deploymentConfig.ollama.loadBalancer,
      primaryHost: deploymentConfig.ollama.host,
    },
    network: {
      serviceDiscovery: deploymentConfig.network.serviceDiscoveryEnabled,
      subnet: deploymentConfig.network.subnet,
    },
    runtime: {
      nodeEnv: process.env.NODE_ENV,
      dockerized: process.env.RUNNING_IN_DOCKER === 'true',
      uptime: process.uptime(),
    },
    timestamp: new Date(),
  });
});

// Vision-specific health check endpoint with enhanced multi-host diagnostics
router.get('/vision', async (_req, res) => {
  try {
    const health = await ollamaHealthCheck.checkHealth();
    
    const diagnostics = {
      ...health,
      deploymentMode: process.env.DEPLOYMENT_MODE || 'multi-host',
      timestamp: new Date(),
      recommendations: (() => {
        if (!health.connected) {
          if (process.env.DEPLOYMENT_MODE === 'multi-host') {
            return {
              type: 'connectivity',
              message: 'External Ollama service not reachable',
              steps: [
                'Verify Ollama is running on the external host',
                'Check network connectivity from container to external host',
                'Verify firewall allows port 11434',
                `Test manually: curl -f ${health.host}/api/version`,
                'Check Docker network settings and DNS resolution'
              ]
            };
          } else {
            return {
              type: 'service',
              message: 'Ollama service not available',
              steps: [
                'Check if Ollama container is running',
                'Verify Docker network connectivity',
                'Check container logs for errors'
              ]
            };
          }
        } else if (health.visionModelCount === 0) {
          return {
            type: 'models',
            message: 'No vision models detected',
            steps: [
              '1. Connect to the Ollama host',
              '2. Install a vision model: ollama pull llava:13b',
              '3. Verify with: ollama list',
              '4. Restart backend service to refresh model cache'
            ]
          };
        } else {
          return {
            type: 'success',
            message: `Found ${health.visionModelCount} vision models`,
            models: health.visionModels
          };
        }
      })()
    };

    res.status(health.connected ? 200 : 503).json(diagnostics);
  } catch (error) {
    res.status(500).json({
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      deploymentMode: process.env.DEPLOYMENT_MODE || 'multi-host',
      timestamp: new Date(),
      recommendations: {
        type: 'error',
        message: 'Health check failed with unexpected error',
        steps: [
          'Check server logs for detailed error information',
          'Verify server configuration',
          'Restart backend service if issues persist'
        ]
      }
    });
  }
});

export { router as healthRouter };
