import { 
  Artifact,
  ArtifactDocument, 
  CreateArtifactRequest, 
  UpdateArtifactRequest, 
  ArtifactOperationResponse,
  ArtifactSyncData,
  ArtifactConflictResolution,
  ArtifactHealthCheck,
  ArtifactMigrationData,
  Message,
  MessageMetadata
} from '@olympian/shared';
import { DatabaseService } from './DatabaseService';
import { ArtifactVersionService, ArtifactVersion } from './ArtifactVersionService';
import { ArtifactNamingService } from './ArtifactNamingService';
import { ObjectId, ClientSession, WithId } from 'mongodb';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { gzipSync, gunzipSync } from 'zlib';

interface CreateArtifactWithNamingRequest extends CreateArtifactRequest {
  userPrompt?: string;
  isPartOfFamily?: boolean;
  familyIndex?: number;
  totalInFamily?: number;
}

/**
 * Atomic Artifact Persistence Service for Multi-host Deployments
 * 
 * Handles all artifact persistence operations with:
 * - Atomic transactions with message linking
 * - AI-powered semantic naming
 * - Multi-host coordination and conflict resolution
 * - Content integrity verification
 * - Performance optimization with caching
 * - Comprehensive error handling and recovery
 */
export class ArtifactService {
  private static instance: ArtifactService;
  private db: DatabaseService;
  private versionService: ArtifactVersionService;
  private namingService: ArtifactNamingService;
  private serverInstance: string;

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.versionService = ArtifactVersionService.getInstance();
    this.namingService = ArtifactNamingService.getInstance();
    this.serverInstance = process.env.SERVER_INSTANCE_ID || `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log(`🎨 [ArtifactService] Initialized with server instance: ${this.serverInstance}`);
  }

  public static getInstance(): ArtifactService {
    if (!ArtifactService.instance) {
      ArtifactService.instance = new ArtifactService();
    }
    return ArtifactService.instance;
  }

  /**
   * Create artifact with AI-powered naming and atomic message linking
   */
  public async createArtifact(
    request: CreateArtifactRequest, 
    messageContent?: string
  ): Promise<ArtifactOperationResponse> {
    // Use enhanced naming if user prompt available
    if (messageContent) {
      return this.createArtifactWithNaming({
        ...request,
        userPrompt: messageContent
      }, messageContent);
    }
    
    return this.createArtifactLegacy(request, messageContent);
  }

  /**
   * Create artifact with AI-powered naming
   */
  public async createArtifactWithNaming(
    request: CreateArtifactWithNamingRequest, 
    messageContent?: string
  ): Promise<ArtifactOperationResponse> {
    const session = this.db.getClient().startSession();
    
    try {
      let result: ArtifactOperationResponse = { 
        success: false, 
        operation: 'create', 
        timestamp: new Date() 
      };
      
      await session.withTransaction(async () => {
        console.log(`🎨 [ArtifactService] Creating artifact with AI naming for conversation: ${request.conversationId}`);
        
        // Generate unique artifact ID
        const artifactId = uuidv4();
        const now = new Date();
        
        // Calculate content metrics
        const contentBuffer = Buffer.from(request.content, 'utf8');
        const contentSize = contentBuffer.length;
        const checksum = this.calculateChecksum(request.content);
        const reconstructionHash = this.calculateReconstructionHash(request.metadata?.originalContent || request.content);
        
        // Generate AI-powered name
        let finalTitle = request.title;
        if (request.userPrompt) {
          try {
            const namingResult = await this.namingService.generateName({
              content: request.content,
              type: request.type,
              language: request.language,
              userPrompt: request.userPrompt,
              isPartOfFamily: request.isPartOfFamily,
              familyIndex: request.familyIndex,
              totalInFamily: request.totalInFamily
            });
            
            finalTitle = namingResult.title;
            console.log(`🏷️ [ArtifactService] Generated name: "${finalTitle}" (source: ${namingResult.source}${namingResult.cached ? ', cached' : ''})`);
          } catch (namingError) {
            console.warn(`🏷️ [ArtifactService] Naming failed, using original title:`, namingError);
          }
        }
        
        // Prepare artifact document
        const artifactDoc: ArtifactDocument = {
          id: artifactId,
          conversationId: request.conversationId,
          messageId: request.messageId,
          title: finalTitle,
          type: request.type,
          content: request.content,
          language: request.language,
          version: 1,
          checksum,
          serverInstance: this.serverInstance,
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
          metadata: {
            detectionStrategy: request.metadata?.detectionStrategy || 'automatic',
            originalContent: request.metadata?.originalContent || request.content,
            processedContent: request.metadata?.processedContent,
            codeBlocksRemoved: request.metadata?.codeBlocksRemoved || false,
            reconstructionHash,
            syncStatus: 'synced',
            lastSyncedAt: now,
            contentSize,
            compressionType: contentSize > 10000 ? 'gzip' : 'none',
            cacheKey: `artifact:${artifactId}:${checksum}`,
            // Add naming metadata
            aiNamed: request.userPrompt ? true : false,
            partOfMultiArtifact: request.isPartOfFamily || false,
            artifactIndex: request.familyIndex,
            totalArtifactsInMessage: request.totalInFamily,
            ...request.metadata
          }
        };

        // Compress large content
        if (contentSize > 10000) {
          try {
            const compressed = gzipSync(Buffer.from(request.content, 'utf8'));
            if (compressed.length < contentSize * 0.8) {
              artifactDoc.content = compressed.toString('base64');
              artifactDoc.metadata.compressionType = 'gzip';
              console.log(`🗜️ [ArtifactService] Compressed artifact content: ${contentSize} -> ${compressed.length} bytes`);
            }
          } catch (compressionError) {
            console.warn(`⚠️ [ArtifactService] Compression failed, using original content:`, compressionError);
          }
        }

        // Insert artifact
        await this.db.artifacts.insertOne(artifactDoc, { session });
        console.log(`✅ [ArtifactService] Artifact created with ID: ${artifactId}`);

        // Save initial version
        await this.versionService.saveVersion(artifactId, 1, request.content, checksum);

        // Update message metadata if messageId provided
        if (request.messageId && messageContent) {
          const enhancedMetadata: MessageMetadata = {
            artifactId,
            artifactType: request.type,
            hasArtifact: true,
            originalContent: request.metadata?.originalContent || messageContent,
            codeBlocksRemoved: request.metadata?.codeBlocksRemoved || false,
          };

          // Add multi-artifact metadata if part of family
          if (request.isPartOfFamily) {
            enhancedMetadata.artifacts = enhancedMetadata.artifacts || [];
            enhancedMetadata.artifacts.push({
              artifactId,
              artifactType: request.type,
              title: finalTitle,
              language: request.language,
              order: request.familyIndex || 0
            });
            enhancedMetadata.artifactCount = request.totalInFamily || 1;
          }

          const messageQuery = ObjectId.isValid(request.messageId) 
            ? { _id: request.messageId } 
            : { id: request.messageId };

          await this.db.messages.updateOne(
            messageQuery,
            { 
              $set: { 
                'metadata.artifactId': artifactId,
                'metadata.artifactType': request.type,
                'metadata.hasArtifact': true,
                'metadata.originalContent': enhancedMetadata.originalContent,
                'metadata.codeBlocksRemoved': enhancedMetadata.codeBlocksRemoved,
                ...(request.isPartOfFamily && {
                  'metadata.artifacts': enhancedMetadata.artifacts,
                  'metadata.artifactCount': enhancedMetadata.artifactCount
                }),
                updatedAt: now
              } 
            },
            { session }
          );
          
          console.log(`🔗 [ArtifactService] Updated message metadata for message: ${request.messageId}`);
        }

        result = {
          success: true,
          artifact: this.convertDocumentToArtifact(artifactDoc),
          operation: 'create',
          timestamp: now,
          version: 1,
          syncStatus: 'synced'
        };

      }, {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary'
      });

      return result;

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to create artifact with naming:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create artifact',
        operation: 'create',
        timestamp: new Date(),
        syncStatus: 'error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Create multiple artifacts with family-aware naming
   */
  public async createMultipleArtifacts(
    artifacts: Array<Omit<CreateArtifactRequest, 'title'>>,
    userPrompt: string,
    conversationId: string,
    messageId?: string,
    messageContent?: string
  ): Promise<{
    success: boolean;
    artifacts: Artifact[];
    errors: Array<{ index: number; error: string }>;
  }> {
    const results: Artifact[] = [];
    const errors: Array<{ index: number; error: string }> = [];
    const totalArtifacts = artifacts.length;

    console.log(`🎨 [ArtifactService] Creating ${totalArtifacts} artifacts with family naming`);

    for (let i = 0; i < artifacts.length; i++) {
      try {
        const artifact = artifacts[i];
        
        const result = await this.createArtifactWithNaming({
          ...artifact,
          title: `${artifact.type} (${i + 1} of ${totalArtifacts})`, // Temporary title
          conversationId,
          messageId,
          userPrompt,
          isPartOfFamily: totalArtifacts > 1,
          familyIndex: i,
          totalInFamily: totalArtifacts
        }, messageContent);

        if (result.success && result.artifact) {
          results.push(result.artifact);
        } else {
          errors.push({
            index: i,
            error: result.error || 'Unknown error'
          });
        }
      } catch (error) {
        errors.push({
          index: i,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      success: errors.length === 0,
      artifacts: results,
      errors
    };
  }

  /**
   * Legacy create artifact method (without AI naming)
   */
  private async createArtifactLegacy(
    request: CreateArtifactRequest, 
    messageContent?: string
  ): Promise<ArtifactOperationResponse> {
    const session = this.db.getClient().startSession();
    
    try {
      let result: ArtifactOperationResponse = { 
        success: false, 
        operation: 'create', 
        timestamp: new Date() 
      };
      
      await session.withTransaction(async () => {
        console.log(`🎨 [ArtifactService] Creating artifact for conversation: ${request.conversationId}`);
        
        // Generate unique artifact ID
        const artifactId = uuidv4();
        const now = new Date();
        
        // Calculate content metrics
        const contentBuffer = Buffer.from(request.content, 'utf8');
        const contentSize = contentBuffer.length;
        const checksum = this.calculateChecksum(request.content);
        const reconstructionHash = this.calculateReconstructionHash(request.metadata?.originalContent || request.content);
        
        // Prepare artifact document
        const artifactDoc: ArtifactDocument = {
          id: artifactId,
          conversationId: request.conversationId,
          messageId: request.messageId,
          title: request.title,
          type: request.type,
          content: request.content,
          language: request.language,
          version: 1,
          checksum,
          serverInstance: this.serverInstance,
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
          metadata: {
            detectionStrategy: request.metadata?.detectionStrategy || 'automatic',
            originalContent: request.metadata?.originalContent || request.content,
            processedContent: request.metadata?.processedContent,
            codeBlocksRemoved: request.metadata?.codeBlocksRemoved || false,
            reconstructionHash,
            syncStatus: 'synced',
            lastSyncedAt: now,
            contentSize,
            compressionType: contentSize > 10000 ? 'gzip' : 'none',
            cacheKey: `artifact:${artifactId}:${checksum}`,
            ...request.metadata
          }
        };

        // Compress large content
        if (contentSize > 10000) {
          try {
            const compressed = gzipSync(Buffer.from(request.content, 'utf8'));
            if (compressed.length < contentSize * 0.8) { // Only use if significant compression
              artifactDoc.content = compressed.toString('base64');
              artifactDoc.metadata.compressionType = 'gzip';
              console.log(`🗜️ [ArtifactService] Compressed artifact content: ${contentSize} -> ${compressed.length} bytes`);
            }
          } catch (compressionError) {
            console.warn(`⚠️ [ArtifactService] Compression failed, using original content:`, compressionError);
          }
        }

        // Insert artifact
        const insertResult = await this.db.artifacts.insertOne(artifactDoc, { session });
        console.log(`✅ [ArtifactService] Artifact created with ID: ${artifactId}`);

        // Save initial version
        await this.versionService.saveVersion(artifactId, 1, request.content, checksum);

        // Update message metadata if messageId provided and messageContent available
        if (request.messageId && messageContent) {
          const enhancedMetadata: MessageMetadata = {
            artifactId,
            artifactType: request.type,
            hasArtifact: true,
            originalContent: request.metadata?.originalContent || messageContent,
            codeBlocksRemoved: request.metadata?.codeBlocksRemoved || false,
          };

          // Fix: Convert ObjectId to string for Message interface compatibility
          const messageQuery = ObjectId.isValid(request.messageId) 
            ? { _id: request.messageId } 
            : { id: request.messageId };

          await this.db.messages.updateOne(
            messageQuery,
            { 
              $set: { 
                'metadata.artifactId': artifactId,
                'metadata.artifactType': request.type,
                'metadata.hasArtifact': true,
                'metadata.originalContent': enhancedMetadata.originalContent,
                'metadata.codeBlocksRemoved': enhancedMetadata.codeBlocksRemoved,
                updatedAt: now
              } 
            },
            { session }
          );
          
          console.log(`🔗 [ArtifactService] Updated message metadata for message: ${request.messageId}`);
        }

        // Prepare response with all required fields
        result = {
          success: true,
          artifact: this.convertDocumentToArtifact(artifactDoc),
          operation: 'create',
          timestamp: now,
          version: 1,
          syncStatus: 'synced'
        };

      }, {
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary'
      });

      return result;

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to create artifact:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create artifact',
        operation: 'create',
        timestamp: new Date(),
        syncStatus: 'error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Update artifact with versioning and conflict detection
   */
  public async updateArtifact(
    request: UpdateArtifactRequest
  ): Promise<ArtifactOperationResponse> {
    const session = this.db.getClient().startSession();
    
    try {
      let result: ArtifactOperationResponse = { 
        success: false, 
        operation: 'update', 
        timestamp: new Date() 
      };
      
      await session.withTransaction(async () => {
        console.log(`🔄 [ArtifactService] Updating artifact: ${request.artifactId}`);
        
        // Find existing artifact
        const existing = await this.db.artifacts.findOne({ id: request.artifactId }, { session });
        if (!existing) {
          throw new Error('Artifact not found');
        }

        const now = new Date();
        const newVersion = existing.version + 1;

        // Prepare update data
        const updateData: Partial<ArtifactDocument> = {
          version: newVersion,
          updatedAt: now,
          lastAccessedAt: now,
          serverInstance: this.serverInstance,
        };

        if (request.content) {
          updateData.content = request.content;
          updateData.checksum = this.calculateChecksum(request.content);
          
          // Save version before updating
          await this.versionService.saveVersion(
            request.artifactId, 
            newVersion, 
            request.content, 
            updateData.checksum
          );
          
          // Update content size and compression
          const contentSize = Buffer.from(request.content, 'utf8').length;
          updateData.metadata = {
            ...existing.metadata,
            contentSize,
            syncStatus: 'synced',
            lastSyncedAt: now
          };

          // Handle compression for large content
          if (contentSize > 10000) {
            try {
              const compressed = gzipSync(Buffer.from(request.content, 'utf8'));
              if (compressed.length < contentSize * 0.8) {
                updateData.content = compressed.toString('base64');
                updateData.metadata.compressionType = 'gzip';
              }
            } catch (compressionError) {
              console.warn(`⚠️ [ArtifactService] Compression failed during update:`, compressionError);
            }
          }
        }

        if (request.title) {
          updateData.title = request.title;
        }

        if (request.metadata) {
          updateData.metadata = {
            ...existing.metadata,
            ...updateData.metadata,
            ...request.metadata
          };
        }

        // Perform atomic update
        const updateResult = await this.db.artifacts.updateOne(
          { id: request.artifactId },
          { $set: updateData },
          { session }
        );

        if (updateResult.matchedCount === 0) {
          throw new Error('Artifact not found during update');
        }

        // Get updated artifact
        const updatedArtifact = await this.db.artifacts.findOne({ id: request.artifactId }, { session });
        
        result = {
          success: true,
          artifact: this.convertDocumentToArtifact(updatedArtifact!),
          operation: 'update',
          timestamp: now,
          version: newVersion,
          syncStatus: 'synced'
        };

        console.log(`✅ [ArtifactService] Artifact updated to version: ${newVersion}`);
      });

      return result;

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to update artifact:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update artifact',
        operation: 'update',
        timestamp: new Date(),
        syncStatus: 'error'
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get artifact versions
   */
  public async getArtifactVersions(artifactId: string): Promise<ArtifactVersion[]> {
    return await this.versionService.getVersions(artifactId);
  }

  /**
   * Get specific artifact version
   */
  public async getArtifactVersion(artifactId: string, version: number): Promise<ArtifactVersion | null> {
    return await this.versionService.getVersion(artifactId, version);
  }

  /**
   * FIXED: Get all artifacts for a specific message ID
   * This method was missing and causing TypeScript compilation errors
   */
  public async getArtifactsByMessageId(messageId: string): Promise<Artifact[]> {
    try {
      console.log(`📋 [ArtifactService] Fetching artifacts for message: ${messageId}`);
      
      const artifacts = await this.db.artifacts
        .find({ messageId })
        .sort({ 'metadata.artifactIndex': 1, createdAt: 1 })
        .toArray();

      // Decompress content and update access time
      const decompressedArtifacts = artifacts.map(artifact => {
        const decompressed = this.decompressContent(artifact);
        
        // Update last accessed time (async, don't wait)
        this.updateLastAccessTime(artifact.id).catch(error => {
          console.warn(`⚠️ [ArtifactService] Failed to update access time for ${artifact.id}:`, error);
        });
        
        return this.convertDocumentToArtifact(decompressed);
      });

      console.log(`✅ [ArtifactService] Retrieved ${decompressedArtifacts.length} artifacts for message`);
      return decompressedArtifacts;

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to fetch artifacts for message:`, error);
      return [];
    }
  }

  /**
   * Get all artifacts for a conversation with decompression
   */
  public async getArtifactsForConversation(conversationId: string): Promise<Artifact[]> {
    try {
      console.log(`📋 [ArtifactService] Fetching artifacts for conversation: ${conversationId}`);
      
      const artifacts = await this.db.artifacts
        .find({ conversationId })
        .sort({ createdAt: 1 })
        .toArray();

      // Decompress content and update access time
      const decompressedArtifacts = artifacts.map(artifact => {
        const decompressed = this.decompressContent(artifact);
        
        // Update last accessed time (async, don't wait)
        this.updateLastAccessTime(artifact.id).catch(error => {
          console.warn(`⚠️ [ArtifactService] Failed to update access time for ${artifact.id}:`, error);
        });
        
        return this.convertDocumentToArtifact(decompressed);
      });

      console.log(`✅ [ArtifactService] Retrieved ${decompressedArtifacts.length} artifacts`);
      return decompressedArtifacts;

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to fetch artifacts for conversation:`, error);
      return [];
    }
  }

  /**
   * Get single artifact by ID with decompression
   */
  public async getArtifactById(artifactId: string): Promise<Artifact | null> {
    try {
      console.log(`🔍 [ArtifactService] Fetching artifact: ${artifactId}`);
      
      const artifact = await this.db.artifacts.findOne({ id: artifactId });
      if (!artifact) {
        console.log(`⚠️ [ArtifactService] Artifact not found: ${artifactId}`);
        return null;
      }

      // Decompress content
      const decompressed = this.decompressContent(artifact);
      
      // Update last accessed time (async, don't wait)
      this.updateLastAccessTime(artifactId).catch(error => {
        console.warn(`⚠️ [ArtifactService] Failed to update access time for ${artifactId}:`, error);
      });

      return this.convertDocumentToArtifact(decompressed);

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to fetch artifact:`, error);
      return null;
    }
  }

  /**
   * Delete artifact with atomic message cleanup
   */
  public async deleteArtifact(artifactId: string): Promise<ArtifactOperationResponse> {
    const session = this.db.getClient().startSession();
    
    try {
      let result: ArtifactOperationResponse = { 
        success: false, 
        operation: 'delete', 
        timestamp: new Date() 
      };
      
      await session.withTransaction(async () => {
        console.log(`🗑️ [ArtifactService] Deleting artifact: ${artifactId}`);
        
        // Find artifact to get messageId
        const artifact = await this.db.artifacts.findOne({ id: artifactId }, { session });
        if (!artifact) {
          throw new Error('Artifact not found');
        }

        // Delete artifact
        const deleteResult = await this.db.artifacts.deleteOne({ id: artifactId }, { session });
        if (deleteResult.deletedCount === 0) {
          throw new Error('Failed to delete artifact');
        }

        // Delete all versions
        await this.db.getDatabase().collection('artifact_versions').deleteMany({ artifactId }, { session });

        // Clean up message metadata if messageId exists
        if (artifact.messageId) {
          // Fix: Convert ObjectId to string for Message interface compatibility
          const messageQuery = ObjectId.isValid(artifact.messageId) 
            ? { _id: artifact.messageId } 
            : { id: artifact.messageId };

          await this.db.messages.updateOne(
            messageQuery,
            { 
              $unset: { 
                'metadata.artifactId': '',
                'metadata.artifactType': '',
                'metadata.hasArtifact': '',
                'metadata.originalContent': '',
                'metadata.codeBlocksRemoved': ''
              },
              $set: { updatedAt: new Date() }
            },
            { session }
          );
          
          console.log(`🧹 [ArtifactService] Cleaned up message metadata for: ${artifact.messageId}`);
        }

        result = { 
          success: true, 
          operation: 'delete', 
          timestamp: new Date() 
        };
        console.log(`✅ [ArtifactService] Artifact deleted: ${artifactId}`);
      });

      return result;

    } catch (error) {
      console.error(`❌ [ArtifactService] Failed to delete artifact:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete artifact',
        operation: 'delete',
        timestamp: new Date()
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Migrate existing artifacts from message metadata
   */
  public async migrateArtifactsFromMessages(conversationId: string): Promise<ArtifactMigrationData> {
    const startTime = Date.now();
    console.log(`🔄 [ArtifactService] Starting artifact migration for conversation: ${conversationId}`);
    
    try {
      // Find messages with artifact metadata
      const messagesWithArtifacts = await this.db.messages
        .find({
          conversationId,
          'metadata.hasArtifact': true,
          'metadata.artifactId': { $exists: true }
        })
        .sort({ createdAt: 1 })
        .toArray();

      console.log(`📋 [ArtifactService] Found ${messagesWithArtifacts.length} messages with artifacts to migrate`);

      let migratedCount = 0;
      const errors: Array<{ messageId?: string; error: string; details?: string }> = [];

      for (const message of messagesWithArtifacts) {
        try {
          // Check if artifact already exists
          const existingArtifact = await this.db.artifacts.findOne({ 
            id: message.metadata?.artifactId 
          });

          if (existingArtifact) {
            console.log(`⏭️ [ArtifactService] Artifact already exists, skipping: ${message.metadata?.artifactId}`);
            continue;
          }

          // Create migration request
          const migrationRequest: CreateArtifactRequest = {
            conversationId,
            messageId: message._id?.toString(),
            title: `Migrated ${message.metadata?.artifactType || 'Artifact'}`,
            type: message.metadata?.artifactType || 'code',
            content: message.metadata?.originalContent || message.content,
            metadata: {
              detectionStrategy: 'migration_from_message',
              originalContent: message.metadata?.originalContent || message.content,
              processedContent: message.content,
              codeBlocksRemoved: message.metadata?.codeBlocksRemoved || false,
              reconstructionHash: this.calculateReconstructionHash(message.metadata?.originalContent || message.content),
              syncStatus: 'synced',
              contentSize: Buffer.from(message.metadata?.originalContent || message.content, 'utf8').length
            }
          };

          // Create artifact with predetermined ID
          const result = await this.createArtifactWithId(
            message.metadata!.artifactId!,
            migrationRequest
          );

          if (result.success) {
            migratedCount++;
            console.log(`✅ [ArtifactService] Migrated artifact: ${message.metadata?.artifactId}`);
          } else {
            errors.push({
              messageId: message._id?.toString(),
              error: result.error || 'Unknown error during migration'
            });
          }

        } catch (error) {
          console.error(`❌ [ArtifactService] Failed to migrate artifact for message ${message._id}:`, error);
          errors.push({
            messageId: message._id?.toString(),
            error: error instanceof Error ? error.message : 'Unknown migration error',
            details: error instanceof Error ? error.stack : undefined
          });
        }
      }

      const duration = Date.now() - startTime;
      const migrationData: ArtifactMigrationData = {
        conversationId,
        migratedCount,
        failedCount: errors.length,
        errors,
        duration,
        strategy: 'message_metadata'
      };

      console.log(`🎉 [ArtifactService] Migration completed: ${migratedCount}/${messagesWithArtifacts.length} artifacts migrated in ${duration}ms`);
      return migrationData;

    } catch (error) {
      console.error(`❌ [ArtifactService] Migration failed:`, error);
      return {
        conversationId,
        migratedCount: 0,
        failedCount: 1,
        errors: [{
          error: error instanceof Error ? error.message : 'Migration process failed',
          details: error instanceof Error ? error.stack : undefined
        }],
        duration: Date.now() - startTime,
        strategy: 'message_metadata'
      };
    }
  }

  /**
   * Get artifacts health check for monitoring
   */
  public async getArtifactsHealthCheck(conversationId?: string): Promise<ArtifactHealthCheck> {
    try {
      const filter = conversationId ? { conversationId } : {};
      
      const [totalArtifacts, syncedArtifacts, conflictedArtifacts, erroredArtifacts] = await Promise.all([
        this.db.artifacts.countDocuments(filter),
        this.db.artifacts.countDocuments({ ...filter, 'metadata.syncStatus': 'synced' }),
        this.db.artifacts.countDocuments({ ...filter, 'metadata.syncStatus': 'conflict' }),
        this.db.artifacts.countDocuments({ ...filter, 'metadata.syncStatus': 'error' }),
      ]);

      // Find specific issues
      const issues: Array<{ 
        type: 'corruption' | 'orphaned' | 'metadata' | 'sync' | 'checksum';
        artifactId: string; 
        description: string; 
        severity: 'low' | 'medium' | 'high' | 'critical';
      }> = [];
      
      // Check for artifacts without checksums
      const artifactsWithoutChecksum = await this.db.artifacts
        .find({ ...filter, checksum: { $exists: false } })
        .limit(10)
        .toArray();
      
      artifactsWithoutChecksum.forEach(artifact => {
        issues.push({
          type: 'checksum',
          artifactId: artifact.id,
          description: 'Missing checksum - Artifact integrity cannot be verified',
          severity: 'medium'
        });
      });

      // Check for old unsynced artifacts
      const oldUnsyncedArtifacts = await this.db.artifacts
        .find({
          ...filter,
          'metadata.syncStatus': { $ne: 'synced' },
          updatedAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24 hours ago
        })
        .limit(5)
        .toArray();

      oldUnsyncedArtifacts.forEach(artifact => {
        issues.push({
          type: 'sync',
          artifactId: artifact.id,
          description: `Artifact has been in ${artifact.metadata.syncStatus} state for over 24 hours`,
          severity: 'high'
        });
      });

      const lastSyncAt = syncedArtifacts > 0 ? 
        (await this.db.artifacts
          .findOne(filter, { sort: { 'metadata.lastSyncedAt': -1 } }))?.metadata.lastSyncedAt :
        undefined;

      return {
        conversationId: conversationId || 'all',
        healthy: issues.length === 0,
        totalArtifacts,
        syncedArtifacts,
        conflictedArtifacts,
        erroredArtifacts,
        lastSyncAt,
        issues
      };

    } catch (error) {
      console.error(`❌ [ArtifactService] Health check failed:`, error);
      return {
        conversationId: conversationId || 'all',
        healthy: false,
        totalArtifacts: 0,
        syncedArtifacts: 0,
        conflictedArtifacts: 0,
        erroredArtifacts: 0,
        issues: [{
          type: 'sync',
          artifactId: 'system',
          description: error instanceof Error ? error.message : 'Unknown error',
          severity: 'high'
        }]
      };
    }
  }

  // =====================================
  // PRIVATE HELPER METHODS
  // =====================================

  /**
   * Create artifact with predetermined ID (for migrations)
   */
  private async createArtifactWithId(
    artifactId: string, 
    request: CreateArtifactRequest
  ): Promise<ArtifactOperationResponse> {
    const session = this.db.getClient().startSession();
    
    try {
      let result: ArtifactOperationResponse = { 
        success: false, 
        operation: 'create', 
        timestamp: new Date() 
      };
      
      await session.withTransaction(async () => {
        const now = new Date();
        const contentSize = Buffer.from(request.content, 'utf8').length;
        const checksum = this.calculateChecksum(request.content);
        
        const artifactDoc: ArtifactDocument = {
          id: artifactId, // Use provided ID
          conversationId: request.conversationId,
          messageId: request.messageId,
          title: request.title,
          type: request.type,
          content: request.content,
          language: request.language,
          version: 1,
          checksum,
          serverInstance: this.serverInstance,
          createdAt: now,
          updatedAt: now,
          lastAccessedAt: now,
          metadata: {
            detectionStrategy: 'migration_from_message',
            originalContent: request.metadata?.originalContent || request.content,
            processedContent: request.metadata?.processedContent,
            codeBlocksRemoved: request.metadata?.codeBlocksRemoved || false,
            reconstructionHash: this.calculateReconstructionHash(request.metadata?.originalContent || request.content),
            syncStatus: 'synced',
            lastSyncedAt: now,
            contentSize,
            compressionType: 'none',
            cacheKey: `artifact:${artifactId}:${checksum}`,
            ...request.metadata
          }
        };

        await this.db.artifacts.insertOne(artifactDoc, { session });
        
        // Save initial version
        await this.versionService.saveVersion(artifactId, 1, request.content, checksum);
        
        result = { 
          success: true, 
          artifact: this.convertDocumentToArtifact(artifactDoc), 
          operation: 'create',
          timestamp: now,
          version: 1, 
          syncStatus: 'synced' 
        };
      });

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create artifact with ID',
        operation: 'create',
        timestamp: new Date()
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Convert ArtifactDocument to Artifact interface
   */
  private convertDocumentToArtifact(doc: ArtifactDocument): Artifact {
    return {
      id: doc.id,
      title: doc.title,
      type: doc.type,
      content: doc.content,
      language: doc.language,
      version: doc.version,
      conversationId: doc.conversationId,
      messageId: doc.messageId,
      // Fix: Ensure proper Date conversion from string or Date objects
      createdAt: typeof doc.createdAt === 'string' ? new Date(doc.createdAt) : doc.createdAt,
      updatedAt: typeof doc.updatedAt === 'string' ? new Date(doc.updatedAt) : doc.updatedAt,
      metadata: doc.metadata
    };
  }

  /**
   * Calculate content checksum for integrity verification
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Calculate reconstruction hash for fallback verification
   */
  private calculateReconstructionHash(originalContent: string): string {
    return createHash('md5').update(originalContent, 'utf8').digest('hex');
  }

  /**
   * Decompress artifact content if compressed
   */
  private decompressContent(artifact: ArtifactDocument): ArtifactDocument {
    if (artifact.metadata.compressionType === 'gzip') {
      try {
        const compressed = Buffer.from(artifact.content, 'base64');
        const decompressed = gunzipSync(compressed);
        return {
          ...artifact,
          content: decompressed.toString('utf8')
        };
      } catch (error) {
        console.error(`❌ [ArtifactService] Failed to decompress artifact ${artifact.id}:`, error);
        // Return as-is if decompression fails
        return artifact;
      }
    }
    return artifact;
  }

  /**
   * Update last access time for cache management
   */
  private async updateLastAccessTime(artifactId: string): Promise<void> {
    try {
      await this.db.artifacts.updateOne(
        { id: artifactId },
        { $set: { lastAccessedAt: new Date() } }
      );
    } catch (error) {
      // Don't throw, just log - this is not critical
      console.warn(`⚠️ [ArtifactService] Failed to update access time for ${artifactId}:`, error);
    }
  }
}
