import { Artifact, ArtifactDocument } from '@olympian/shared';
import { DatabaseService } from './DatabaseService';
import { ArtifactCoordinationService } from './ArtifactCoordinationService';
import zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Performance enhancement service for multi-host artifact management
 * Handles lazy loading, compression, CDN integration, and optimization strategies
 */
export class ArtifactPerformanceService {
  private static instance: ArtifactPerformanceService;
  private db = DatabaseService.getInstance();
  private coordination = ArtifactCoordinationService.getInstance();
  
  // Performance configuration
  private readonly COMPRESSION_THRESHOLD = 1024; // Compress content > 1KB
  private readonly LAZY_LOAD_THRESHOLD = 5120; // Lazy load content > 5KB
  private readonly CDN_ENABLED = process.env.CDN_ENABLED === 'true';
  private readonly CDN_BASE_URL = process.env.CDN_BASE_URL || '';
  
  // Content type mappings for CDN optimization
  private readonly CONTENT_TYPE_MAP = {
    'html': 'text/html',
    'css': 'text/css',
    'javascript': 'application/javascript',
    'json': 'application/json',
    'svg': 'image/svg+xml',
    'markdown': 'text/markdown'
  };

  private constructor() {}

  public static getInstance(): ArtifactPerformanceService {
    if (!ArtifactPerformanceService.instance) {
      ArtifactPerformanceService.instance = new ArtifactPerformanceService();
    }
    return ArtifactPerformanceService.instance;
  }

  /**
   * Store artifact with performance optimizations
   */
  async storeArtifact(artifact: Artifact): Promise<Artifact> {
    console.log(`🚀 [ArtifactPerformance] Storing artifact ${artifact.id} with optimizations`);

    try {
      // Apply performance optimizations
      const optimizedArtifact = await this.optimizeArtifactForStorage(artifact);
      
      // Store in database
      const storedArtifact = await this.storeInDatabase(optimizedArtifact);
      
      // Cache in Redis for cross-instance sharing
      await this.coordination.cacheArtifact(storedArtifact);
      
      // Upload to CDN if enabled and appropriate
      if (this.shouldUseCDN(storedArtifact)) {
        await this.uploadToCDN(storedArtifact);
      }

      console.log(`✅ [ArtifactPerformance] Successfully stored artifact ${artifact.id}`);
      return storedArtifact;
      
    } catch (error) {
      console.error(`❌ [ArtifactPerformance] Failed to store artifact ${artifact.id}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve artifact with lazy loading and caching
   */
  async retrieveArtifact(artifactId: string, options: {
    includeContent?: boolean;
    preferCDN?: boolean;
  } = {}): Promise<Artifact | null> {
    console.log(`🔍 [ArtifactPerformance] Retrieving artifact ${artifactId}`, options);

    try {
      // Try cache first for fast retrieval
      let artifact = await this.coordination.getCachedArtifact(artifactId);
      
      if (!artifact) {
        // Cache miss - load from database
        console.log(`💾 [ArtifactPerformance] Cache miss for ${artifactId}, loading from database`);
        artifact = await this.loadFromDatabase(artifactId);
        
        if (artifact) {
          // Cache for future requests
          await this.coordination.cacheArtifact(artifact);
        }
      } else {
        console.log(`⚡ [ArtifactPerformance] Cache hit for ${artifactId}`);
      }

      if (!artifact) {
        return null;
      }

      // Handle lazy loading
      if (options.includeContent !== false) {
        artifact = await this.ensureContentLoaded(artifact, options);
      } else {
        // Return lightweight version without content
        artifact = this.createLightweightVersion(artifact);
      }

      return artifact;
      
    } catch (error) {
      console.error(`❌ [ArtifactPerformance] Failed to retrieve artifact ${artifactId}:`, error);
      return null;
    }
  }

  /**
   * Retrieve all artifacts for a conversation with performance optimizations
   */
  async retrieveConversationArtifacts(conversationId: string, options: {
    includeContent?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<Artifact[]> {
    console.log(`📦 [ArtifactPerformance] Retrieving artifacts for conversation ${conversationId}`, options);

    try {
      // Try cache first
      let artifacts = await this.coordination.getCachedArtifactsForConversation(conversationId);
      
      if (artifacts.length === 0) {
        // Cache miss - load from database
        console.log(`💾 [ArtifactPerformance] No cached artifacts for conversation ${conversationId}, loading from database`);
        artifacts = await this.loadConversationArtifactsFromDatabase(conversationId, options);
        
        // Cache individual artifacts
        for (const artifact of artifacts) {
          await this.coordination.cacheArtifact(artifact);
        }
      }

      // Apply pagination if specified
      if (options.offset || options.limit) {
        const start = options.offset || 0;
        const end = options.limit ? start + options.limit : undefined;
        artifacts = artifacts.slice(start, end);
      }

      // Handle content loading based on options
      if (options.includeContent === false) {
        artifacts = artifacts.map(artifact => this.createLightweightVersion(artifact));
      } else {
        // Ensure content is loaded for all artifacts
        artifacts = await Promise.all(
          artifacts.map(artifact => this.ensureContentLoaded(artifact, { preferCDN: true }))
        );
      }

      console.log(`✅ [ArtifactPerformance] Retrieved ${artifacts.length} artifacts for conversation ${conversationId}`);
      return artifacts;
      
    } catch (error) {
      console.error(`❌ [ArtifactPerformance] Failed to retrieve artifacts for conversation ${conversationId}:`, error);
      return [];
    }
  }

  /**
   * Update artifact with performance optimizations
   */
  async updateArtifact(artifactId: string, updates: Partial<Artifact>): Promise<Artifact | null> {
    console.log(`🔄 [ArtifactPerformance] Updating artifact ${artifactId}`);

    // Acquire distributed lock for safe updates
    const lockAcquired = await this.coordination.acquireArtifactLock(artifactId);
    if (!lockAcquired) {
      throw new Error(`Cannot acquire lock for artifact ${artifactId} - another instance is updating it`);
    }

    try {
      // Load current artifact
      const currentArtifact = await this.loadFromDatabase(artifactId);
      if (!currentArtifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }

      // Apply updates with optimizations
      const updatedArtifact = { ...currentArtifact, ...updates, updatedAt: new Date() };
      const optimizedArtifact = await this.optimizeArtifactForStorage(updatedArtifact);

      // Update in database
      await this.updateInDatabase(optimizedArtifact);

      // Invalidate cache across all instances
      await this.coordination.invalidateArtifactCache(artifactId);

      // Re-cache the updated version
      await this.coordination.cacheArtifact(optimizedArtifact);

      // Update CDN if applicable
      if (this.shouldUseCDN(optimizedArtifact)) {
        await this.uploadToCDN(optimizedArtifact);
      }

      console.log(`✅ [ArtifactPerformance] Successfully updated artifact ${artifactId}`);
      return optimizedArtifact;
      
    } finally {
      // Always release the lock
      await this.coordination.releaseArtifactLock(artifactId);
    }
  }

  /**
   * Optimize artifact for storage (compression, etc.)
   */
  private async optimizeArtifactForStorage(artifact: Artifact): Promise<Artifact> {
    const optimized = { ...artifact };

    // Initialize metadata if not present
    if (!optimized.metadata) {
      optimized.metadata = {
        syncStatus: 'synced',
        codeBlocksRemoved: false,
        detectionStrategy: 'automatic',
        originalContent: artifact.content,
        reconstructionHash: '',
        contentSize: artifact.content.length
      };
    }

    // Compress large content
    if (artifact.content.length > this.COMPRESSION_THRESHOLD) {
      console.log(`🗜️ [ArtifactPerformance] Compressing content for artifact ${artifact.id} (${artifact.content.length} bytes)`);
      
      const compressed = await gzip(artifact.content);
      const compressionRatio = compressed.length / artifact.content.length;
      
      // Only use compression if it provides significant savings
      if (compressionRatio < 0.8) {
        optimized.content = compressed.toString('base64');
        optimized.metadata = {
          ...optimized.metadata,
          compressed: true,
          originalSize: artifact.content.length,
          compressedSize: compressed.length,
          compressionRatio,
          syncStatus: optimized.metadata.syncStatus || 'synced'
        };
        console.log(`✅ [ArtifactPerformance] Compressed content by ${Math.round((1 - compressionRatio) * 100)}%`);
      }
    }

    // Mark for lazy loading if content is large
    if (artifact.content.length > this.LAZY_LOAD_THRESHOLD) {
      optimized.metadata = {
        ...optimized.metadata,
        lazyLoad: true,
        contentSize: artifact.content.length,
        syncStatus: optimized.metadata.syncStatus || 'synced'
      };
    }

    return optimized;
  }

  /**
   * Ensure content is loaded (decompress if needed, fetch from CDN if applicable)
   */
  private async ensureContentLoaded(artifact: Artifact, options: { preferCDN?: boolean } = {}): Promise<Artifact> {
    // Check if content is compressed
    if (artifact.metadata?.compressed) {
      console.log(`🗜️ [ArtifactPerformance] Decompressing content for artifact ${artifact.id}`);
      try {
        const compressedBuffer = Buffer.from(artifact.content, 'base64');
        const decompressed = await gunzip(compressedBuffer);
        artifact.content = decompressed.toString();
        
        // Remove compression metadata for client
        const cleanMetadata = { ...artifact.metadata };
        delete cleanMetadata.compressed;
        delete cleanMetadata.originalSize;
        delete cleanMetadata.compressedSize;
        delete cleanMetadata.compressionRatio;
        artifact.metadata = cleanMetadata;
        
      } catch (error) {
        console.error(`❌ [ArtifactPerformance] Failed to decompress content for artifact ${artifact.id}:`, error);
      }
    }

    // Try CDN if enabled and preferred
    if (options.preferCDN && this.CDN_ENABLED && this.shouldUseCDN(artifact)) {
      const cdnContent = await this.fetchFromCDN(artifact);
      if (cdnContent) {
        artifact.content = cdnContent;
      }
    }

    return artifact;
  }

  /**
   * Create lightweight version without content for list views
   */
  private createLightweightVersion(artifact: Artifact): Artifact {
    return {
      ...artifact,
      content: '', // Remove content for lightweight version
      metadata: {
        ...artifact.metadata,
        lightweight: true,
        contentSize: artifact.content.length,
        syncStatus: artifact.metadata?.syncStatus || 'synced',
        codeBlocksRemoved: artifact.metadata?.codeBlocksRemoved || false,
        detectionStrategy: artifact.metadata?.detectionStrategy || 'automatic',
        originalContent: artifact.metadata?.originalContent || artifact.content,
        reconstructionHash: artifact.metadata?.reconstructionHash || ''
      }
    };
  }

  /**
   * Database operations
   */
  private async storeInDatabase(artifact: Artifact): Promise<Artifact> {
    const result = await this.db.artifacts.insertOne(artifact as any);
    return { ...artifact, id: result.insertedId.toString() };
  }

  private async loadFromDatabase(artifactId: string): Promise<Artifact | null> {
    const artifact = await this.db.artifacts.findOne({ id: artifactId } as any);
    return artifact ? this.formatArtifact(artifact) : null;
  }

  private async loadConversationArtifactsFromDatabase(conversationId: string, options: any): Promise<Artifact[]> {
    const query: any = { conversationId };
    const mongoOptions: any = { sort: { createdAt: 1 } };
    
    if (options.limit) mongoOptions.limit = options.limit;
    if (options.offset) mongoOptions.skip = options.offset;

    const artifacts = await this.db.artifacts.find(query, mongoOptions).toArray();
    return artifacts.map(artifact => this.formatArtifact(artifact));
  }

  private async updateInDatabase(artifact: Artifact): Promise<void> {
    await this.db.artifacts.updateOne(
      { id: artifact.id } as any,
      { $set: artifact as any }
    );
  }

  /**
   * Format artifact from database
   */
  private formatArtifact(doc: any): Artifact {
    return {
      ...doc,
      id: doc.id || doc._id?.toString(),
      createdAt: doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt),
      updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt),
    };
  }

  /**
   * CDN operations
   */
  private shouldUseCDN(artifact: Artifact): boolean {
    if (!this.CDN_ENABLED) return false;
    
    // Use CDN for static content types and large artifacts
    const isStaticContent = ['html', 'css', 'javascript', 'svg'].includes(artifact.type);
    const isLargeContent = artifact.content.length > this.LAZY_LOAD_THRESHOLD;
    
    return isStaticContent || isLargeContent;
  }

  private async uploadToCDN(artifact: Artifact): Promise<string | null> {
    if (!this.CDN_ENABLED) return null;

    try {
      // This would integrate with your CDN provider (AWS CloudFront, Cloudflare, etc.)
      // For now, we'll simulate the upload
      console.log(`☁️ [ArtifactPerformance] Uploading artifact ${artifact.id} to CDN`);
      
      const cdnPath = `artifacts/${artifact.conversationId}/${artifact.id}`;
      const contentType = this.CONTENT_TYPE_MAP[artifact.type as keyof typeof this.CONTENT_TYPE_MAP] || 'text/plain';
      
      // Simulate CDN upload (replace with actual CDN integration)
      const cdnUrl = `${this.CDN_BASE_URL}/${cdnPath}`;
      
      // Store CDN reference in artifact metadata
      await this.db.artifacts.updateOne(
        { id: artifact.id } as any,
        { 
          $set: { 
            'metadata.cdnUrl': cdnUrl,
            'metadata.cdnPath': cdnPath,
            'metadata.contentType': contentType 
          } 
        }
      );

      console.log(`✅ [ArtifactPerformance] Uploaded artifact ${artifact.id} to CDN: ${cdnUrl}`);
      return cdnUrl;
      
    } catch (error) {
      console.error(`❌ [ArtifactPerformance] Failed to upload artifact ${artifact.id} to CDN:`, error);
      return null;
    }
  }

  private async fetchFromCDN(artifact: Artifact): Promise<string | null> {
    const cdnUrl = artifact.metadata?.cdnUrl;
    if (!cdnUrl) return null;

    try {
      console.log(`☁️ [ArtifactPerformance] Fetching artifact ${artifact.id} from CDN`);
      
      // Simulate CDN fetch (replace with actual CDN integration)
      // const response = await fetch(cdnUrl);
      // return await response.text();
      
      // For now, return null to fallback to database content
      return null;
      
    } catch (error) {
      console.error(`❌ [ArtifactPerformance] Failed to fetch artifact ${artifact.id} from CDN:`, error);
      return null;
    }
  }

  /**
   * Performance analytics
   */
  async getPerformanceMetrics(): Promise<any> {
    try {
      const [
        totalArtifacts,
        compressedArtifacts,
        lazyLoadArtifacts,
        cdnArtifacts,
        averageSize,
        compressionStats
      ] = await Promise.all([
        this.db.artifacts.countDocuments({}),
        this.db.artifacts.countDocuments({ 'metadata.compressed': true } as any),
        this.db.artifacts.countDocuments({ 'metadata.lazyLoad': true } as any),
        this.db.artifacts.countDocuments({ 'metadata.cdnUrl': { $exists: true } } as any),
        this.calculateAverageArtifactSize(),
        this.calculateCompressionStats()
      ]);

      return {
        totalArtifacts,
        optimizations: {
          compressed: compressedArtifacts,
          lazyLoad: lazyLoadArtifacts,
          cdn: cdnArtifacts
        },
        performance: {
          averageSize,
          compressionStats
        },
        thresholds: {
          compressionThreshold: this.COMPRESSION_THRESHOLD,
          lazyLoadThreshold: this.LAZY_LOAD_THRESHOLD
        }
      };
    } catch (error) {
      console.error('❌ [ArtifactPerformance] Failed to get performance metrics:', error);
      return {};
    }
  }

  private async calculateAverageArtifactSize(): Promise<number> {
    const pipeline = [
      { $project: { contentSize: { $strLenCP: '$content' } } },
      { $group: { _id: null, avgSize: { $avg: '$contentSize' } } }
    ];
    
    const result = await this.db.artifacts.aggregate(pipeline).toArray();
    return result[0]?.avgSize || 0;
  }

  private async calculateCompressionStats(): Promise<any> {
    const pipeline = [
      { $match: { 'metadata.compressed': true } },
      { 
        $group: { 
          _id: null, 
          avgCompressionRatio: { $avg: '$metadata.compressionRatio' },
          totalOriginalSize: { $sum: '$metadata.originalSize' },
          totalCompressedSize: { $sum: '$metadata.compressedSize' }
        } 
      }
    ];
    
    const result = await this.db.artifacts.aggregate(pipeline).toArray();
    const stats = result[0];
    
    if (!stats) return {};
    
    return {
      averageCompressionRatio: stats.avgCompressionRatio,
      totalSpaceSaved: stats.totalOriginalSize - stats.totalCompressedSize,
      spaceSavingsPercent: ((stats.totalOriginalSize - stats.totalCompressedSize) / stats.totalOriginalSize) * 100
    };
  }
}
