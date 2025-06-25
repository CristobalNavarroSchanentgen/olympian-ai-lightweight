import { createClient, RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import { Artifact } from '@olympian/shared';
import { DatabaseService } from './DatabaseService';

/**
 * Redis-based artifact coordination service for multi-host deployments
 * Handles cross-instance artifact caching, synchronization, and event coordination
 */
export class ArtifactCoordinationService extends EventEmitter {
  private static instance: ArtifactCoordinationService;
  private redisClient: RedisClientType | null = null;
  private publishClient: RedisClientType | null = null;
  private subscribeClient: RedisClientType | null = null;
  private isConnected = false;
  private serverInstanceId: string;
  private readonly CACHE_PREFIX = 'olympian:artifacts:';
  private readonly EVENT_CHANNEL = 'olympian:artifact-events';
  private readonly LOCK_PREFIX = 'olympian:locks:artifact:';
  private readonly INSTANCE_PREFIX = 'olympian:instances:';
  private readonly TTL_SECONDS = 3600; // 1 hour cache TTL
  private readonly LOCK_TTL_SECONDS = 30; // 30 second lock TTL

  private constructor() {
    super();
    this.serverInstanceId = `${process.env.HOSTNAME || 'unknown'}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  public static getInstance(): ArtifactCoordinationService {
    if (!ArtifactCoordinationService.instance) {
      ArtifactCoordinationService.instance = new ArtifactCoordinationService();
    }
    return ArtifactCoordinationService.instance;
  }

  /**
   * Initialize Redis connections for coordination
   */
  async initialize(): Promise<void> {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    
    try {
      console.log('🔄 [ArtifactCoordination] Initializing Redis connections...');
      
      // Main client for cache operations
      this.redisClient = createClient({ url: redisUrl });
      this.redisClient.on('error', (err) => {
        console.error('❌ [ArtifactCoordination] Redis client error:', err);
        this.emit('error', err);
      });
      await this.redisClient.connect();

      // Dedicated publish client
      this.publishClient = createClient({ url: redisUrl });
      this.publishClient.on('error', (err) => {
        console.error('❌ [ArtifactCoordination] Redis publish client error:', err);
      });
      await this.publishClient.connect();

      // Dedicated subscribe client
      this.subscribeClient = createClient({ url: redisUrl });
      this.subscribeClient.on('error', (err) => {
        console.error('❌ [ArtifactCoordination] Redis subscribe client error:', err);
      });
      await this.subscribeClient.connect();

      // Subscribe to artifact events
      await this.subscribeClient.subscribe(this.EVENT_CHANNEL, this.handleArtifactEvent.bind(this));

      // Register this server instance
      await this.registerInstance();

      this.isConnected = true;
      console.log('✅ [ArtifactCoordination] Redis coordination initialized successfully');
      this.emit('connected');

    } catch (error) {
      console.error('❌ [ArtifactCoordination] Failed to initialize Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Register this server instance in Redis
   */
  private async registerInstance(): Promise<void> {
    if (!this.redisClient) return;

    const instanceKey = `${this.INSTANCE_PREFIX}${this.serverInstanceId}`;
    const instanceData = {
      id: this.serverInstanceId,
      startTime: Date.now(),
      lastHeartbeat: Date.now(),
      hostname: process.env.HOSTNAME || 'unknown',
      pid: process.pid
    };

    await this.redisClient.setEx(instanceKey, 60, JSON.stringify(instanceData));
    
    // Set up heartbeat interval
    setInterval(async () => {
      if (this.redisClient) {
        instanceData.lastHeartbeat = Date.now();
        await this.redisClient.setEx(instanceKey, 60, JSON.stringify(instanceData)).catch(() => {});
      }
    }, 30000); // Heartbeat every 30 seconds
  }

  /**
   * Cache artifact with cross-instance coordination
   */
  async cacheArtifact(artifact: Artifact): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      console.warn('⚠️ [ArtifactCoordination] Redis not connected, skipping cache');
      return;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${artifact.id}`;
      const artifactData = {
        ...artifact,
        _cached_at: Date.now(),
        _cached_by: this.serverInstanceId,
        _checksum: this.calculateChecksum(artifact.content)
      };

      await this.redisClient.setEx(cacheKey, this.TTL_SECONDS, JSON.stringify(artifactData));

      // Publish event to other instances
      await this.publishArtifactEvent('artifact:cached', {
        artifactId: artifact.id,
        conversationId: artifact.conversationId,
        instanceId: this.serverInstanceId,
        checksum: artifactData._checksum
      });

      console.log(`✅ [ArtifactCoordination] Cached artifact ${artifact.id} with checksum ${artifactData._checksum}`);
    } catch (error) {
      console.error('❌ [ArtifactCoordination] Failed to cache artifact:', error);
    }
  }

  /**
   * Retrieve artifact from cache with validation
   */
  async getCachedArtifact(artifactId: string): Promise<Artifact | null> {
    if (!this.isConnected || !this.redisClient) {
      return null;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${artifactId}`;
      const cachedData = await this.redisClient.get(cacheKey);
      
      if (!cachedData) {
        return null;
      }

      const artifact = JSON.parse(cachedData);
      
      // Validate checksum
      const currentChecksum = this.calculateChecksum(artifact.content);
      if (artifact._checksum !== currentChecksum) {
        console.warn(`⚠️ [ArtifactCoordination] Checksum mismatch for artifact ${artifactId}, invalidating cache`);
        await this.invalidateArtifactCache(artifactId);
        return null;
      }

      // Remove internal cache metadata
      delete artifact._cached_at;
      delete artifact._cached_by;
      delete artifact._checksum;

      // Convert date strings back to Date objects
      artifact.createdAt = new Date(artifact.createdAt);
      artifact.updatedAt = new Date(artifact.updatedAt);

      console.log(`✅ [ArtifactCoordination] Retrieved cached artifact ${artifactId}`);
      return artifact;
    } catch (error) {
      console.error(`❌ [ArtifactCoordination] Failed to get cached artifact ${artifactId}:`, error);
      return null;
    }
  }

  /**
   * Invalidate artifact cache across all instances
   */
  async invalidateArtifactCache(artifactId: string): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      return;
    }

    try {
      const cacheKey = `${this.CACHE_PREFIX}${artifactId}`;
      await this.redisClient.del(cacheKey);

      // Publish invalidation event
      await this.publishArtifactEvent('artifact:invalidated', {
        artifactId,
        instanceId: this.serverInstanceId
      });

      console.log(`✅ [ArtifactCoordination] Invalidated cache for artifact ${artifactId}`);
    } catch (error) {
      console.error(`❌ [ArtifactCoordination] Failed to invalidate cache for artifact ${artifactId}:`, error);
    }
  }

  /**
   * Acquire distributed lock for artifact operations
   */
  async acquireArtifactLock(artifactId: string): Promise<boolean> {
    if (!this.isConnected || !this.redisClient) {
      return false;
    }

    try {
      const lockKey = `${this.LOCK_PREFIX}${artifactId}`;
      const lockValue = `${this.serverInstanceId}:${Date.now()}`;
      
      const result = await this.redisClient.setNX(lockKey, lockValue);
      if (result) {
        await this.redisClient.expire(lockKey, this.LOCK_TTL_SECONDS);
        console.log(`🔒 [ArtifactCoordination] Acquired lock for artifact ${artifactId}`);
        return true;
      }
      
      console.log(`⏳ [ArtifactCoordination] Failed to acquire lock for artifact ${artifactId} (already locked)`);
      return false;
    } catch (error) {
      console.error(`❌ [ArtifactCoordination] Failed to acquire lock for artifact ${artifactId}:`, error);
      return false;
    }
  }

  /**
   * Release distributed lock for artifact operations
   */
  async releaseArtifactLock(artifactId: string): Promise<void> {
    if (!this.isConnected || !this.redisClient) {
      return;
    }

    try {
      const lockKey = `${this.LOCK_PREFIX}${artifactId}`;
      const lockValue = await this.redisClient.get(lockKey);
      
      if (lockValue && lockValue.startsWith(this.serverInstanceId)) {
        await this.redisClient.del(lockKey);
        console.log(`🔓 [ArtifactCoordination] Released lock for artifact ${artifactId}`);
      }
    } catch (error) {
      console.error(`❌ [ArtifactCoordination] Failed to release lock for artifact ${artifactId}:`, error);
    }
  }

  /**
   * Get all cached artifacts for a conversation
   */
  async getCachedArtifactsForConversation(conversationId: string): Promise<Artifact[]> {
    if (!this.isConnected || !this.redisClient) {
      return [];
    }

    try {
      const pattern = `${this.CACHE_PREFIX}*`;
      const keys = await this.redisClient.keys(pattern);
      const artifacts: Artifact[] = [];

      for (const key of keys) {
        const cachedData = await this.redisClient.get(key);
        if (cachedData) {
          const artifact = JSON.parse(cachedData);
          if (artifact.conversationId === conversationId) {
            // Remove cache metadata and convert dates
            delete artifact._cached_at;
            delete artifact._cached_by;
            delete artifact._checksum;
            artifact.createdAt = new Date(artifact.createdAt);
            artifact.updatedAt = new Date(artifact.updatedAt);
            artifacts.push(artifact);
          }
        }
      }

      console.log(`✅ [ArtifactCoordination] Retrieved ${artifacts.length} cached artifacts for conversation ${conversationId}`);
      return artifacts;
    } catch (error) {
      console.error(`❌ [ArtifactCoordination] Failed to get cached artifacts for conversation ${conversationId}:`, error);
      return [];
    }
  }

  /**
   * Publish artifact event to other instances
   */
  private async publishArtifactEvent(eventType: string, data: any): Promise<void> {
    if (!this.publishClient) return;

    try {
      const event = {
        type: eventType,
        data,
        instanceId: this.serverInstanceId,
        timestamp: Date.now()
      };

      await this.publishClient.publish(this.EVENT_CHANNEL, JSON.stringify(event));
    } catch (error) {
      console.error('❌ [ArtifactCoordination] Failed to publish event:', error);
    }
  }

  /**
   * Handle artifact events from other instances
   */
  private async handleArtifactEvent(message: string): Promise<void> {
    try {
      const event = JSON.parse(message);
      
      // Ignore events from this instance
      if (event.instanceId === this.serverInstanceId) {
        return;
      }

      console.log(`📡 [ArtifactCoordination] Received event: ${event.type} from ${event.instanceId}`);

      switch (event.type) {
        case 'artifact:cached':
          this.emit('artifactCached', event.data);
          break;
        case 'artifact:invalidated':
          // Remove from local cache if present
          if (this.redisClient) {
            const cacheKey = `${this.CACHE_PREFIX}${event.data.artifactId}`;
            await this.redisClient.del(cacheKey);
          }
          this.emit('artifactInvalidated', event.data);
          break;
        case 'artifact:updated':
          this.emit('artifactUpdated', event.data);
          break;
      }
    } catch (error) {
      console.error('❌ [ArtifactCoordination] Failed to handle artifact event:', error);
    }
  }

  /**
   * Calculate content checksum for integrity validation
   */
  private calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * Get active server instances
   */
  async getActiveInstances(): Promise<any[]> {
    if (!this.redisClient) return [];

    try {
      const pattern = `${this.INSTANCE_PREFIX}*`;
      const keys = await this.redisClient.keys(pattern);
      const instances = [];

      for (const key of keys) {
        const instanceData = await this.redisClient.get(key);
        if (instanceData) {
          const instance = JSON.parse(instanceData);
          // Consider instance active if last heartbeat was within 2 minutes
          if (Date.now() - instance.lastHeartbeat < 120000) {
            instances.push(instance);
          }
        }
      }

      return instances;
    } catch (error) {
      console.error('❌ [ArtifactCoordination] Failed to get active instances:', error);
      return [];
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      if (this.subscribeClient) {
        await this.subscribeClient.unsubscribe(this.EVENT_CHANNEL);
        await this.subscribeClient.disconnect();
      }
      
      if (this.publishClient) {
        await this.publishClient.disconnect();
      }
      
      if (this.redisClient) {
        // Remove instance registration
        const instanceKey = `${this.INSTANCE_PREFIX}${this.serverInstanceId}`;
        await this.redisClient.del(instanceKey);
        await this.redisClient.disconnect();
      }

      this.isConnected = false;
      console.log('✅ [ArtifactCoordination] Cleanup completed');
    } catch (error) {
      console.error('❌ [ArtifactCoordination] Cleanup error:', error);
    }
  }

  /**
   * Health check for coordination service
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    const details = {
      redisConnected: this.isConnected,
      instanceId: this.serverInstanceId,
      activeInstances: 0,
      cacheKeys: 0,
      errors: []
    };

    try {
      if (this.redisClient) {
        // Test Redis connectivity
        await this.redisClient.ping();
        
        // Count active instances
        const instances = await this.getActiveInstances();
        details.activeInstances = instances.length;
        
        // Count cached artifacts
        const cacheKeys = await this.redisClient.keys(`${this.CACHE_PREFIX}*`);
        details.cacheKeys = cacheKeys.length;
      }
    } catch (error) {
      details.errors.push(`Redis error: ${error.message}`);
    }

    return {
      healthy: this.isConnected && details.errors.length === 0,
      details
    };
  }

  get instanceId(): string {
    return this.serverInstanceId;
  }

  get connected(): boolean {
    return this.isConnected;
  }
}
