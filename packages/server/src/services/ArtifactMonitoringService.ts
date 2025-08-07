import { Artifact } from '@olympian/shared';
import { DatabaseService } from './DatabaseService';
import { ArtifactCoordinationService } from './ArtifactCoordinationService';
import { ArtifactPerformanceService } from './ArtifactPerformanceService';
import { EventEmitter } from 'events';

interface ConsistencyIssue {
  type: 'missing_artifact' | 'corrupted_content' | 'metadata_mismatch' | 'cache_inconsistency';
  artifactId: string;
  conversationId?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
  detectedAt: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

interface HealthCheckResult {
  status: boolean;
  score: number; // 0-100
}

export class ArtifactMonitoringService extends EventEmitter {
  private static instance: ArtifactMonitoringService;
  private database: DatabaseService;
  private coordination: ArtifactCoordinationService;
  private performance: ArtifactPerformanceService;
  private issues: ConsistencyIssue[] = [];
  private lastHealthCheck: Date = new Date();
  private validationInterval: NodeJS.Timeout | null = null;

  private readonly VALIDATION_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor(
    database: DatabaseService,
    coordination: ArtifactCoordinationService,
    performance: ArtifactPerformanceService
  ) {
    super();
    this.database = database;
    this.coordination = coordination;
    this.performance = performance;
  }

  static getInstance(
    database?: DatabaseService,
    coordination?: ArtifactCoordinationService,
    performance?: ArtifactPerformanceService
  ): ArtifactMonitoringService {
    if (!ArtifactMonitoringService.instance) {
      if (!database || !coordination || !performance) {
        throw new Error('Services required for first instantiation');
      }
      ArtifactMonitoringService.instance = new ArtifactMonitoringService(
        database,
        coordination,
        performance
      );
    }
    return ArtifactMonitoringService.instance;
  }

  async getStatus(): Promise<any> {
    return {
      lastHealthCheck: this.lastHealthCheck,
      score: 0,
      totalIssues: this.issues.length,
      criticalIssues: this.issues.filter(i => i.severity === 'critical' && !i.resolved).length,
      recentIssues: this.issues.slice(-10),
      activeInstances: [],
      metrics: {}
    };
  }

  async cleanup(): Promise<void> {
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }
    console.log('[ArtifactMonitoring] Monitoring service cleaned up');
  }
}
