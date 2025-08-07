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
  issues: ConsistencyIssue[];
  metrics: {
    totalArtifacts: number;
    activeArtifacts: number;
    corruptedArtifacts: number;
    missingArtifacts: number;
    cacheHitRate: number;
    averageResponseTime: number;
  };
  instances: {
    id: string;
    status: boolean;
    lastSeen: Date;
    artifactCount: number;
  }[];
}

/**
 * Comprehensive monitoring and diagnostics service for multi-host artifact management
 * Comprehensive monitoring and diagnostics service for multi-host artifact management
 
export class ArtifactMonitoringService extends EventEmitter {
  private static instance: ArtifactMonitoringService;
  private db = DatabaseService.getInstance();
  private coordination = ArtifactCoordinationService.getInstance();
  private performance = ArtifactPerformanceService.getInstance();
  
  private issues: ConsistencyIssue[] = [];
  private lastHealthCheck: Date | null = null;
  private validationInterval: NodeJS.Timeout | null = null;
  
  // Monitoring configuration
  private readonly HEALTH_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly VALIDATION_INTERVAL = 900000; // 15 minutes
  private readonly MAX_STORED_ISSUES = 1000;
  private readonly CRITICAL_THRESHOLD = 90; // Health score threshold for critical alerts

  private constructor() {
    super();
  }

  public static getInstance(): ArtifactMonitoringService {
    if (!ArtifactMonitoringService.instance) {
      ArtifactMonitoringService.instance = new ArtifactMonitoringService();
    }
    return ArtifactMonitoringService.instance;
  }

  /**
   * Initialize monitoring service
   * Initialize monitoring service
   
  async initialize(): Promise<void> {
    console.log('🔄 [ArtifactMonitoring] Initializing monitoring service...');

    try {
      // Start periodic health checks
      this.startHealthChecks();
      
      // Start periodic validation
      this.startValidation();
      
      // Listen to coordination events
      this.coordination.on('artifactCached', this.handleArtifactCached.bind(this));
      this.coordination.on('artifactInvalidated', this.handleArtifactInvalidated.bind(this));
      
      // Run initial health check
      
      console.log(' [ArtifactMonitoring] Monitoring service initialized successfully');
      this.emit('initialized');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown initialization error';
      console.error(' [ArtifactMonitoring] Failed to initialize monitoring service:', errorMessage);
      throw error;
    }
  }

  /**
   * Check consistency across database, cache, and instances
   
  async checkConsistency(): Promise<ConsistencyIssue[]> {   
    console.log('🔍 [ArtifactMonitoring] Checking artifact consistency...');
    const issues: ConsistencyIssue[] = [];

    try {
      // Check database artifacts
      const databaseArtifacts = await this.getAllDatabaseArtifacts();
      
      for (const artifact of databaseArtifacts) {
        // Check content integrity
        const contentIssues = await this.validateArtifactContent(artifact);
        issues.push(...contentIssues);
        
        // Check cache consistency
        const cacheIssues = await this.validateCacheConsistency(artifact);
        issues.push(...cacheIssues);
        
        // Check metadata consistency
        const metadataIssues = await this.validateMetadata(artifact);
        issues.push(...metadataIssues);
      }

      // Check for orphaned cache entries
      const orphanedCacheIssues = await this.checkOrphanedCacheEntries();
      issues.push(...orphanedCacheIssues);

      console.log(`🔍 [ArtifactMonitoring] Consistency check complete. Found ${issues.length} issues`);
      return issues;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown consistency check error';
      console.error(' [ArtifactMonitoring] Consistency check failed:', errorMessage);
      return [{
        type: 'corrupted_content',
        artifactId: 'consistency-check',
        severity: 'critical',
        details: { error: errorMessage },
        detectedAt: new Date()
      }];
    }
  }

  /**
   * Validate individual artifact content
   * Validate individual artifact content
   
  private async validateArtifactContent(artifact: Artifact): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];

    try {
      // Check if content exists and is not empty
      if (!artifact.content || artifact.content.trim().length === 0) {
        issues.push({
          type: 'corrupted_content',
          artifactId: artifact.id,
          conversationId: artifact.conversationId,
          severity: 'high',
          details: { reason: 'Empty or missing content' },
          detectedAt: new Date()
        });
      }

      // Validate compressed content if marked as compressed
      if (artifact.metadata?.compressed) {
        try {
          const compressedBuffer = Buffer.from(artifact.content, 'base64');
          if (compressedBuffer.length === 0) {
            issues.push({
              type: 'corrupted_content',
              artifactId: artifact.id,
              conversationId: artifact.conversationId,
              severity: 'high',
              details: { reason: 'Invalid compressed content' },
              detectedAt: new Date()
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown compression validation error';
          issues.push({
            type: 'corrupted_content',
            artifactId: artifact.id,
            conversationId: artifact.conversationId,
            severity: 'high',
            details: { reason: 'Corrupted compression data', error: errorMessage },
            detectedAt: new Date()
          });
        }
      }

      // Validate artifact type and content consistency
      if (!this.isContentValidForType(artifact.content, artifact.type)) {
        issues.push({
          type: 'metadata_mismatch',
          artifactId: artifact.id,
          conversationId: artifact.conversationId,
          severity: 'medium',
          details: { reason: 'Content does not match declared type', type: artifact.type },
          detectedAt: new Date()
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      issues.push({
        type: 'corrupted_content',
        artifactId: artifact.id,
        conversationId: artifact.conversationId,
        severity: 'critical',
        details: { reason: 'Validation error', error: errorMessage },
        detectedAt: new Date()
      });
    }

    return issues;
  }

  /**
   * Validate cache consistency
   * Validate cache consistency
   
  private async validateCacheConsistency(artifact: Artifact): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];

    try {
      const cachedArtifact = await this.coordination.getCachedArtifact(artifact.id);
      
      if (cachedArtifact) {
        // Compare checksums
        const dbChecksum = this.calculateChecksum(artifact.content);
        const cacheChecksum = this.calculateChecksum(cachedArtifact.content);
        
        if (dbChecksum !== cacheChecksum) {
          issues.push({
            type: 'cache_inconsistency',
            artifactId: artifact.id,
            conversationId: artifact.conversationId,
            severity: 'medium',
            details: { 
              reason: 'Cache content differs from database',
              dbChecksum,
              cacheChecksum
            },
            detectedAt: new Date()
          });
        }

        // Compare metadata
        if (artifact.updatedAt.getTime() !== cachedArtifact.updatedAt.getTime()) {
          issues.push({
            type: 'cache_inconsistency',
            artifactId: artifact.id,
            conversationId: artifact.conversationId,
            severity: 'low',
            details: { 
              reason: 'Cache timestamp differs from database',
              dbTimestamp: artifact.updatedAt,
              cacheTimestamp: cachedArtifact.updatedAt
            },
            detectedAt: new Date()
          });
        }
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown cache validation error';
      issues.push({
        type: 'cache_inconsistency',
        artifactId: artifact.id,
        conversationId: artifact.conversationId,
        severity: 'low',
        details: { reason: 'Cache validation error', error: errorMessage },
        detectedAt: new Date()
      });
    }

    return issues;
  }

  /**
   * Validate artifact metadata
   * Validate artifact metadata
   
  private async validateMetadata(artifact: Artifact): Promise<ConsistencyIssue[]> {
    const issues: ConsistencyIssue[] = [];

    // Check required fields
    if (!artifact.id || !artifact.conversationId || !artifact.title || !artifact.type) {
      issues.push({
        type: 'metadata_mismatch',
        artifactId: artifact.id || 'unknown',
        conversationId: artifact.conversationId,
        severity: 'high',
        details: { reason: 'Missing required metadata fields' },
        detectedAt: new Date()
      });
    }

    // Validate dates
    if (artifact.createdAt > artifact.updatedAt) {
      issues.push({
        type: 'metadata_mismatch',
        artifactId: artifact.id,
        conversationId: artifact.conversationId,
        severity: 'medium',
        details: { reason: 'Created date is after updated date' },
        detectedAt: new Date()
      });
    }

    // Validate version
    if (artifact.version < 1) {
      issues.push({
        type: 'metadata_mismatch',
        artifactId: artifact.id,
        conversationId: artifact.conversationId,
        severity: 'medium',
        details: { reason: 'Invalid version number' },
        detectedAt: new Date()
      });
    }

    return issues;
  }

  /**
   * Check for orphaned cache entries
   * Check for orphaned cache entries
   
  private async checkOrphanedCacheEntries(): Promise<ConsistencyIssue[]> {
    // This would require coordination service to expose cache keys
    // For now, return empty array as this is complex to implement
    return [];
  }

  /**
   * Automated recovery procedures
   * Automated recovery procedures
   
  async performAutomaticRecovery(issues: ConsistencyIssue[]): Promise<void> {
    console.log(`🔧 [ArtifactMonitoring] Starting automatic recovery for ${issues.length} issues...`);

    for (const issue of issues) {
      try {
        await this.recoverFromIssue(issue);
        issue.resolved = true;
        issue.resolvedAt = new Date();
        console.log(` [ArtifactMonitoring] Recovered from issue: ${issue.type} for artifact ${issue.artifactId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown recovery error';
        console.error(` [ArtifactMonitoring] Failed to recover from issue ${issue.type} for artifact ${issue.artifactId}:`, errorMessage);
      }
    }

    this.emit('recoveryComplete', { resolvedIssues: issues.filter(i => i.resolved) });
  }

  /**
   * Recover from specific issue
   * Recover from specific issue
   
  private async recoverFromIssue(issue: ConsistencyIssue): Promise<void> {
    switch (issue.type) {
      case 'cache_inconsistency':
        // Invalidate cache to force refresh from database
        await this.coordination.invalidateArtifactCache(issue.artifactId);
        break;
        
      case 'corrupted_content':
        // Try to recover from backup or invalidate
        console.warn(`⚠️ [ArtifactMonitoring] Cannot auto-recover corrupted content for ${issue.artifactId}`);
        break;
        
      case 'metadata_mismatch':
        // Try to fix metadata if possible
        await this.fixMetadata(issue);
        break;
        
      case 'missing_artifact':
        // Mark as unrecoverable
        console.warn(`⚠️ [ArtifactMonitoring] Cannot auto-recover missing artifact ${issue.artifactId}`);
        break;
    }
  }

  /**
   * Fix metadata issues
   * Fix metadata issues
   
  private async fixMetadata(issue: ConsistencyIssue): Promise<void> {
    // Load artifact and apply fixes
    const artifacts = await this.db.artifacts.findOne({ id: issue.artifactId } as any);
    if (!artifacts) return;

    const updates: any = {};
    
    // Fix date inconsistencies
    if (issue.details.reason === 'Created date is after updated date') {
      updates.updatedAt = new Date();
    }
    
    // Fix version issues
    if (issue.details.reason === 'Invalid version number') {
      updates.version = 1;
    }

    if (Object.keys(updates).length > 0) {
      await this.db.artifacts.updateOne(
        { id: issue.artifactId } as any,
        { $set: updates }
      );
    }
  }


  /**
   * Utility methods
   * Utility methods
   
  private async getDatabaseMetrics(): Promise<any> {
    try {
      const totalArtifacts = await this.db.artifacts.countDocuments({});
      return {
        connected: true,
        totalArtifacts
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown database error';
      return {
        connected: false,
        totalArtifacts: 0,
        error: errorMessage
      };
    }
  }

  private async checkInstanceHealth(): Promise<any[]> {
    const instances = await this.coordination.getActiveInstances();
    return instances.map(instance => ({
      id: instance.id,
      status: Date.now() - instance.lastHeartbeat < 120000, // 2 minutes
      lastSeen: new Date(instance.lastHeartbeat),
      artifactCount: 0 // Would need to be calculated
    }));
  }

  private async getAllDatabaseArtifacts(): Promise<Artifact[]> {
    const artifacts = await this.db.artifacts.find({}).toArray();
    return artifacts.map(artifact => ({
      ...artifact,
      _id: artifact._id?.toString ? artifact._id.toString() : artifact._id,
      createdAt: artifact.createdAt instanceof Date ? artifact.createdAt : new Date(artifact.createdAt),
      updatedAt: artifact.updatedAt instanceof Date ? artifact.updatedAt : new Date(artifact.updatedAt),
    }));
  }

  private isContentValidForType(content: string, type: string): boolean {
    // Basic content validation based on type
    switch (type) {
      case 'json':
        try {
          JSON.parse(content);
          return true;
        } catch {
          return false;
        }
      case 'html':
        return content.includes('<') && content.includes('>');
      case 'css':
        return content.includes('{') && content.includes('}');
      case 'javascript':
        return content.length > 0; // Basic check
      default:
        return content.length > 0;
    }
  }

  private calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  private storeIssues(issues: ConsistencyIssue[]): void {
    this.issues.push(...issues);
    
    // Keep only the latest issues
    if (this.issues.length > this.MAX_STORED_ISSUES) {
      this.issues = this.issues.slice(-this.MAX_STORED_ISSUES);
    }
  }

  private startHealthChecks(): void {
  }

  private startValidation(): void {
    this.validationInterval = setInterval(async () => {
      try {
        const issues = await this.checkConsistency();
        if (issues.length > 0) {
          await this.performAutomaticRecovery(issues);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown scheduled validation error';
        console.error(' [ArtifactMonitoring] Scheduled validation failed:', errorMessage);
      }
    }, this.VALIDATION_INTERVAL);
  }

  private handleArtifactCached(data: any): void {
    console.log(` [ArtifactMonitoring] Artifact cached: ${data.artifactId}`);
  }

  private handleArtifactInvalidated(data: any): void {
    console.log(` [ArtifactMonitoring] Artifact invalidated: ${data.artifactId}`);
  }



  /**
   * Get monitoring dashboard data
   */
  async getStatus(): Promise<any> {
    return {
      lastHealthCheck: this.lastHealthCheck,
      score: 0,
      totalIssues: this.issues.length,
      criticalIssues: this.issues.filter(i => i.severity === "critical" && !i.resolved).length,
      recentIssues: this.issues.slice(-10),
      activeInstances: await this.coordination.getActiveInstances(),
      metrics: {}
    };
  }

  /**
   * Cleanup monitoring service
   */
  async cleanup(): Promise<void> {
    
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }
    
    console.log(' [ArtifactMonitoring] Monitoring service cleaned up');
  }
}
