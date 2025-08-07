import { ArtifactCoordinationService } from './ArtifactCoordinationService';
import { ArtifactPerformanceService } from './ArtifactPerformanceService';
import { ArtifactMonitoringService } from './ArtifactMonitoringService';
import { DatabaseService } from './DatabaseService';

/**
 * Multi-host initialization service for coordinating startup of all artifact services
 * Ensures proper initialization order and dependency management
 */
export class MultiHostInitializationService {
  private static instance: MultiHostInitializationService;
  private initialized = false;
  private services: {
    coordination: ArtifactCoordinationService;
    performance: ArtifactPerformanceService;
    monitoring: ArtifactMonitoringService;
    database: DatabaseService;
  };

  private constructor() {
    this.services = {
      coordination: ArtifactCoordinationService.getInstance(),
      performance: ArtifactPerformanceService.getInstance(),
      monitoring: ArtifactMonitoringService.getInstance(),
      database: DatabaseService.getInstance(),
    };
  }

  public static getInstance(): MultiHostInitializationService {
    if (!MultiHostInitializationService.instance) {
      MultiHostInitializationService.instance = new MultiHostInitializationService();
    }
    return MultiHostInitializationService.instance;
  }

  /**
   * Initialize all multi-host services in proper order
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('⚠️ [MultiHostInit] Services already initialized, skipping...');
      return;
    }

    console.log('🚀 [MultiHostInit] Starting multi-host service initialization...');
    
    try {
      // Phase 1: Database preparation
      await this.initializeDatabase();
      
      // Phase 2: Redis coordination
      await this.initializeCoordination();
      
      // Phase 3: Performance optimizations
      await this.initializePerformance();
      
      // Phase 4: Monitoring and health checks
      await this.initializeMonitoring();
      
      // Phase 5: Setup cleanup handlers
      this.setupCleanupHandlers();
      
      this.initialized = true;
      console.log('✅ [MultiHostInit] All multi-host services initialized successfully!');
      
    } catch (error) {
      console.error('❌ [MultiHostInit] Failed to initialize multi-host services:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Initialize database with artifact collections and schemas
   */
  private async initializeDatabase(): Promise<void> {
    console.log('📊 [MultiHostInit] Phase 1: Initializing database...');
    
    try {
      // Ensure database is connected
      if (!this.services.database.isConnected()) {
        throw new Error('Database must be connected before initializing multi-host services');
      }
      
      // Initialize artifacts collection with proper schema
      await this.services.database.initializeArtifactsWithSchema();
      
      // Perform artifacts health check
      const artifactsHealth = await this.services.database.checkArtifactsHealth();
      
      if (!artifactsHealth.isHealthy) {
        console.warn('⚠️ [MultiHostInit] Artifacts collection health issues detected:', artifactsHealth.issues);
        // Continue initialization but log warnings
      }
      
      console.log(`✅ [MultiHostInit] Database ready - ${artifactsHealth.totalCount} artifacts, ${artifactsHealth.indexes.length} indexes`);
      
    } catch (error) {
      console.error('❌ [MultiHostInit] Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Redis-based coordination
   */
  private async initializeCoordination(): Promise<void> {
    console.log('🔗 [MultiHostInit] Phase 2: Initializing coordination service...');
    
    try {
      await this.services.coordination.initialize();
      
      // Wait for coordination to be fully connected
      if (!this.services.coordination.connected) {
        throw new Error('Coordination service failed to connect');
      }
      
      console.log(`✅ [MultiHostInit] Coordination ready - Instance ID: ${this.services.coordination.instanceId}`);
      
    } catch (error) {
      console.error('❌ [MultiHostInit] Coordination initialization failed:', error);
      
      // Check if Redis is optional for this deployment
      const redisOptional = process.env.REDIS_OPTIONAL === 'true';
      
      if (redisOptional) {
        console.warn('⚠️ [MultiHostInit] Redis coordination disabled, running in single-instance mode');
      } else {
        throw error;
      }
    }
  }

  /**
   * Initialize performance optimizations
   */
  private async initializePerformance(): Promise<void> {
    console.log('⚡ [MultiHostInit] Phase 3: Initializing performance service...');
    
    try {
      // Performance service is ready immediately (no async initialization required)
      const metrics = await this.services.performance.getPerformanceMetrics();
      
      console.log(`✅ [MultiHostInit] Performance service ready - ${metrics.totalArtifacts} artifacts tracked`);
      
    } catch (error) {
      console.error('❌ [MultiHostInit] Performance initialization failed:', error);
      throw error;
    }
  }

  /**
   * Initialize monitoring and diagnostics
   */
  private async initializeMonitoring(): Promise<void> {
    console.log('📊 [MultiHostInit] Phase 4: Initializing monitoring service...');
    
    try {
      await this.services.monitoring.initialize();
      
      // Perform initial health check
      
      console.log(`✅ [MultiHostInit] Monitoring ready - Health score: ${healthResult.score}/100`);
      
      if (!healthResult.healthy) {
        console.warn('⚠️ [MultiHostInit] Initial health check indicates issues:', 
          healthResult.issues.slice(0, 3).map(i => i.type));
      }
      
    } catch (error) {
      console.error('❌ [MultiHostInit] Monitoring initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    console.log('🛡️ [MultiHostInit] Setting up cleanup handlers...');
    
    const cleanup = async () => {
      console.log('🧹 [MultiHostInit] Graceful shutdown initiated...');
      await this.cleanup();
      process.exit(0);
    };

    // Handle various shutdown signals
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGUSR2', cleanup); // For nodemon restarts
    
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', async (error) => {
      console.error('❌ [MultiHostInit] Uncaught exception:', error);
      await this.cleanup();
      process.exit(1);
    });
    
    process.on('unhandledRejection', async (reason, promise) => {
      console.error('❌ [MultiHostInit] Unhandled rejection at:', promise, 'reason:', reason);
      await this.cleanup();
      process.exit(1);
    });
  }

  /**
   * Get initialization status
   */
  getStatus(): {
    initialized: boolean;
    services: {
      database: boolean;
      coordination: boolean;
      performance: boolean;
      monitoring: boolean;
    };
  } {
    return {
      initialized: this.initialized,
      services: {
        database: this.services.database.isConnected(),
        coordination: this.services.coordination.connected,
        performance: true, // Always ready
        monitoring: this.initialized, // Ready when initialized
      }
    };
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(): Promise<any> {
    try {
      const [
        dbHealth,
        coordinationHealth,
        performanceMetrics,
        monitoringHealth
      ] = await Promise.all([
        this.services.database.checkArtifactsHealth(),
        this.services.performance.getPerformanceMetrics(),
      ]);

      return {
        overall: {
          status: dbHealth.isHealthy && coordinationHealth.healthy && monitoringHealth.healthy,
          score: monitoringHealth.score
        },
        database: dbHealth,
        coordination: coordinationHealth,
        performance: performanceMetrics,
        monitoring: monitoringHealth,
        timestamp: new Date()
      };
      
    } catch (error) {
      // Fix: Properly handle unknown error type
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        overall: {
          status: false,
          score: 0,
          error: errorMessage
        },
        timestamp: new Date()
      };
    }
  }

  /**
   * Restart specific service
   */
  async restartService(serviceName: 'coordination' | 'performance' | 'monitoring'): Promise<void> {
    console.log(`🔄 [MultiHostInit] Restarting ${serviceName} service...`);
    
    try {
      switch (serviceName) {
        case 'coordination':
          await this.services.coordination.cleanup();
          await this.services.coordination.initialize();
          break;
          
        case 'performance':
          // Performance service doesn't need restart (stateless)
          console.log('✅ [MultiHostInit] Performance service is stateless, no restart needed');
          break;
          
        case 'monitoring':
          await this.services.monitoring.cleanup();
          await this.services.monitoring.initialize();
          break;
          
        default:
          throw new Error(`Unknown service: ${serviceName}`);
      }
      
      console.log(`✅ [MultiHostInit] ${serviceName} service restarted successfully`);
      
    } catch (error) {
      // Fix: Properly handle unknown error type
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during service restart';
      console.error(`❌ [MultiHostInit] Failed to restart ${serviceName} service:`, errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Cleanup all services
   */
  async cleanup(): Promise<void> {
    console.log('🧹 [MultiHostInit] Cleaning up multi-host services...');
    
    try {
      // Cleanup in reverse order
      await Promise.all([
        this.services.monitoring.cleanup().catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : 'Unknown monitoring cleanup error';
          console.error('❌ [MultiHostInit] Monitoring cleanup error:', errorMessage);
        }),
        this.services.coordination.cleanup().catch((err: unknown) => {
          const errorMessage = err instanceof Error ? err.message : 'Unknown coordination cleanup error';
          console.error('❌ [MultiHostInit] Coordination cleanup error:', errorMessage);
        })
      ]);
      
      this.initialized = false;
      console.log('✅ [MultiHostInit] Cleanup completed');
      
    } catch (error) {
      // Fix: Properly handle unknown error type
      const errorMessage = error instanceof Error ? error.message : 'Unknown cleanup error';
      console.error('❌ [MultiHostInit] Cleanup failed:', errorMessage);
    }
  }

  /**
   * Get service instances (for testing or advanced usage)
   */
  getServices() {
    return {
      coordination: this.services.coordination,
      performance: this.services.performance,
      monitoring: this.services.monitoring,
      database: this.services.database,
    };
  }
}

// Export singleton instance
export const multiHostInit = MultiHostInitializationService.getInstance();
