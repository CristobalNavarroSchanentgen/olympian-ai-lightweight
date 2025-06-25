import { Router } from 'express';
import { ArtifactCoordinationService } from '../services/ArtifactCoordinationService';
import { ArtifactPerformanceService } from '../services/ArtifactPerformanceService';
import { ArtifactMonitoringService } from '../services/ArtifactMonitoringService';
import { AppError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();

// Get service instances
const coordination = ArtifactCoordinationService.getInstance();
const performance = ArtifactPerformanceService.getInstance();
const monitoring = ArtifactMonitoringService.getInstance();

// Input validation schemas
const artifactQuerySchema = z.object({
  includeContent: z.boolean().optional(),
  preferCDN: z.boolean().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const performanceQuerySchema = z.object({
  detailed: z.boolean().optional(),
});

/**
 * ARTIFACT COORDINATION ENDPOINTS
 */

// Get cached artifact
router.get('/artifacts/:id/cache', async (req, res, next) => {
  try {
    const artifactId = req.params.id;
    const cachedArtifact = await coordination.getCachedArtifact(artifactId);
    
    if (!cachedArtifact) {
      throw new AppError(404, 'Cached artifact not found');
    }
    
    res.json({
      success: true,
      data: cachedArtifact,
      cached: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Invalidate artifact cache
router.delete('/artifacts/:id/cache', async (req, res, next) => {
  try {
    const artifactId = req.params.id;
    await coordination.invalidateArtifactCache(artifactId);
    
    res.json({
      success: true,
      message: `Cache invalidated for artifact ${artifactId}`,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get cached artifacts for conversation
router.get('/conversations/:id/artifacts/cache', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const validation = artifactQuerySchema.safeParse(req.query);
    
    if (!validation.success) {
      throw new AppError(400, 'Invalid query parameters');
    }
    
    const cachedArtifacts = await coordination.getCachedArtifactsForConversation(conversationId);
    
    res.json({
      success: true,
      data: cachedArtifacts,
      count: cachedArtifacts.length,
      cached: true,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get active server instances
router.get('/instances', async (req, res, next) => {
  try {
    const instances = await coordination.getActiveInstances();
    
    res.json({
      success: true,
      data: instances,
      count: instances.length,
      currentInstance: coordination.instanceId,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Coordination service health check
router.get('/coordination/health', async (req, res, next) => {
  try {
    const health = await coordination.healthCheck();
    
    res.json({
      success: true,
      ...health,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PERFORMANCE OPTIMIZATION ENDPOINTS
 */

// Get artifact with performance optimizations
router.get('/artifacts/:id/optimized', async (req, res, next) => {
  try {
    const artifactId = req.params.id;
    const validation = artifactQuerySchema.safeParse(req.query);
    
    if (!validation.success) {
      throw new AppError(400, 'Invalid query parameters');
    }
    
    const options = validation.data;
    const artifact = await performance.retrieveArtifact(artifactId, options);
    
    if (!artifact) {
      throw new AppError(404, 'Artifact not found');
    }
    
    res.json({
      success: true,
      data: artifact,
      optimized: true,
      contentIncluded: options.includeContent !== false,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get conversation artifacts with performance optimizations
router.get('/conversations/:id/artifacts/optimized', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const validation = artifactQuerySchema.safeParse(req.query);
    
    if (!validation.success) {
      throw new AppError(400, 'Invalid query parameters');
    }
    
    const options = validation.data;
    const artifacts = await performance.retrieveConversationArtifacts(conversationId, options);
    
    res.json({
      success: true,
      data: artifacts,
      count: artifacts.length,
      optimized: true,
      contentIncluded: options.includeContent !== false,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: options.limit ? artifacts.length === options.limit : false
      },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get performance metrics
router.get('/performance/metrics', async (req, res, next) => {
  try {
    const validation = performanceQuerySchema.safeParse(req.query);
    
    if (!validation.success) {
      throw new AppError(400, 'Invalid query parameters');
    }
    
    const metrics = await performance.getPerformanceMetrics();
    
    res.json({
      success: true,
      data: metrics,
      detailed: validation.data.detailed || false,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * MONITORING & DIAGNOSTICS ENDPOINTS
 */

// Perform health check
router.get('/health', async (req, res, next) => {
  try {
    const healthResult = await monitoring.performHealthCheck();
    
    res.status(healthResult.healthy ? 200 : 503).json({
      success: healthResult.healthy,
      ...healthResult,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Get monitoring dashboard data
router.get('/monitoring/dashboard', async (req, res, next) => {
  try {
    const dashboardData = await monitoring.getDashboardData();
    
    res.json({
      success: true,
      data: dashboardData,
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Check consistency
router.get('/monitoring/consistency', async (req, res, next) => {
  try {
    const issues = await monitoring.checkConsistency();
    
    res.json({
      success: true,
      data: {
        issues,
        totalIssues: issues.length,
        criticalIssues: issues.filter(i => i.severity === 'critical').length,
        highIssues: issues.filter(i => i.severity === 'high').length,
        mediumIssues: issues.filter(i => i.severity === 'medium').length,
        lowIssues: issues.filter(i => i.severity === 'low').length,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

// Trigger recovery
router.post('/monitoring/recovery', async (req, res, next) => {
  try {
    // First check for issues
    const issues = await monitoring.checkConsistency();
    
    if (issues.length === 0) {
      res.json({
        success: true,
        message: 'No issues found, recovery not needed',
        timestamp: new Date(),
      });
      return;
    }
    
    // Perform recovery
    await monitoring.performAutomaticRecovery(issues);
    
    res.json({
      success: true,
      message: `Recovery completed for ${issues.length} issues`,
      data: {
        totalIssues: issues.length,
        resolvedIssues: issues.filter(i => i.resolved).length,
        unresolvedIssues: issues.filter(i => !i.resolved).length,
      },
      timestamp: new Date(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * LOAD BALANCER HEALTH ENDPOINT
 */

// Simple health endpoint for load balancers
router.get('/health/simple', async (req, res) => {
  try {
    // Quick connectivity checks
    const coordinationConnected = coordination.connected;
    
    if (coordinationConnected) {
      res.status(200).json({ 
        status: 'healthy',
        instance: coordination.instanceId,
        timestamp: new Date()
      });
    } else {
      res.status(503).json({ 
        status: 'unhealthy',
        instance: coordination.instanceId,
        timestamp: new Date()
      });
    }
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date()
    });
  }
});

/**
 * DEBUGGING ENDPOINTS (Development Only)
 */

if (process.env.NODE_ENV === 'development') {
  // Force cache refresh for testing
  router.post('/debug/refresh-cache', async (req, res, next) => {
    try {
      // This would implement cache refresh logic
      res.json({
        success: true,
        message: 'Cache refresh initiated',
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });
  
  // Get detailed instance information
  router.get('/debug/instance-info', async (req, res, next) => {
    try {
      const info = {
        instanceId: coordination.instanceId,
        connected: coordination.connected,
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        env: {
          NODE_ENV: process.env.NODE_ENV,
          REDIS_URL: process.env.REDIS_URL ? 'configured' : 'not configured',
          CDN_ENABLED: process.env.CDN_ENABLED,
          HOSTNAME: process.env.HOSTNAME,
        }
      };
      
      res.json({
        success: true,
        data: info,
        timestamp: new Date(),
      });
    } catch (error) {
      next(error);
    }
  });
}

export { router as multiHostRouter };
