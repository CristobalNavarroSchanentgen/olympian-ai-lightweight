import { Router } from 'express';
import { DatabaseService } from '../services/DatabaseService';
import { getDeploymentConfig } from '../config/deployment';
import { MongoClient } from 'mongodb';

const router = Router();
const db = DatabaseService.getInstance();

// Basic health check
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    deploymentMode: process.env.DEPLOYMENT_MODE || 'multi-host',
  });
});

// Service health check
router.get('/services', async (_req, res) => {
  const deploymentConfig = getDeploymentConfig();
  const services: Record<string, any> = {};

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
  }

  // Check Ollama
  const ollamaChecks = [];
  const hostsToCheck = deploymentConfig.ollama.hosts.length > 0 
    ? deploymentConfig.ollama.hosts 
    : [deploymentConfig.ollama.host];

  for (const host of hostsToCheck) {
    try {
      const response = await fetch(`${host}/api/version`, {
        signal: AbortSignal.timeout(2000),
      });
      
      if (response.ok) {
        const version = await response.json();
        ollamaChecks.push({
          host,
          status: 'healthy',
          version: version.version,
        });
      } else {
        ollamaChecks.push({
          host,
          status: 'unhealthy',
          error: `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      ollamaChecks.push({
        host,
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  services.ollama = {
    deploymentMode: deploymentConfig.mode,
    loadBalancer: deploymentConfig.ollama.loadBalancer,
    hosts: ollamaChecks,
  };

  // Overall health
  const isHealthy = 
    services.mongodb.status === 'healthy' &&
    ollamaChecks.some(check => check.status === 'healthy');

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    deploymentMode: deploymentConfig.mode,
    services,
    timestamp: new Date(),
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
    },
    network: {
      serviceDiscovery: deploymentConfig.network.serviceDiscoveryEnabled,
      subnet: deploymentConfig.network.subnet,
    },
    timestamp: new Date(),
  });
});

export { router as healthRouter };