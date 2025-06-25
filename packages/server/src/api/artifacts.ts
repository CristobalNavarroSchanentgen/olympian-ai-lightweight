import { Router } from 'express';
import { z } from 'zod';
import { 
  CreateArtifactRequest, 
  UpdateArtifactRequest, 
  ArtifactOperationResponse,
  ArtifactHealthCheck 
} from '@olympian/shared';
import { ArtifactService } from '../services/ArtifactService';
import { AppError } from '../middleware/errorHandler';
import { chatRateLimiter } from '../middleware/rateLimiter';

const router = Router();
const artifactService = ArtifactService.getInstance();

// Apply rate limiting to artifact endpoints
router.use(chatRateLimiter);

// =====================================
// VALIDATION SCHEMAS
// =====================================

const createArtifactSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().optional(),
  title: z.string().min(1).max(200),
  type: z.enum(['text', 'code', 'html', 'react', 'svg', 'mermaid', 'json', 'csv', 'markdown']),
  content: z.string().min(1),
  language: z.string().optional(),
  metadata: z.object({
    detectionStrategy: z.string().optional(),
    originalContent: z.string().optional(),
    processedContent: z.string().optional(),
    codeBlocksRemoved: z.boolean().optional(),
    fallbackData: z.record(z.any()).optional(),
    syncStatus: z.enum(['synced', 'pending', 'conflict', 'error']).optional(),
    contentSize: z.number().optional(),
    compressionType: z.enum(['none', 'gzip', 'lz4']).optional(),
    cacheKey: z.string().optional()
  }).optional().default({})
});

const updateArtifactSchema = z.object({
  content: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  metadata: z.object({
    detectionStrategy: z.string().optional(),
    originalContent: z.string().optional(),
    processedContent: z.string().optional(),
    codeBlocksRemoved: z.boolean().optional(),
    fallbackData: z.record(z.any()).optional(),
    syncStatus: z.enum(['synced', 'pending', 'conflict', 'error']).optional()
  }).optional()
}).refine(data => data.content || data.title || data.metadata, {
  message: "At least one field (content, title, or metadata) must be provided"
});

const bulkOperationSchema = z.object({
  conversationId: z.string().min(1),
  operations: z.array(z.object({
    type: z.enum(['create', 'update', 'delete']),
    artifact: z.union([createArtifactSchema, updateArtifactSchema]).optional(),
    artifactId: z.string().optional()
  })).min(1).max(50) // Limit bulk operations
});

// =====================================
// ARTIFACT CRUD ENDPOINTS
// =====================================

/**
 * GET /api/artifacts/conversations/:conversationId
 * Get all artifacts for a conversation
 */
router.get('/conversations/:conversationId', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    
    console.log(`📋 [ArtifactsAPI] Fetching artifacts for conversation: ${conversationId}`);
    
    const artifacts = await artifactService.getArtifactsForConversation(conversationId);
    
    res.json({
      success: true,
      data: artifacts,
      total: artifacts.length,
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/artifacts/:artifactId
 * Get single artifact by ID
 */
router.get('/:artifactId', async (req, res, next) => {
  try {
    const { artifactId } = req.params;
    
    console.log(`🔍 [ArtifactsAPI] Fetching artifact: ${artifactId}`);
    
    const artifact = await artifactService.getArtifactById(artifactId);
    
    if (!artifact) {
      throw new AppError(404, 'Artifact not found');
    }
    
    res.json({
      success: true,
      data: artifact,
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/artifacts
 * Create new artifact
 */
router.post('/', async (req, res, next) => {
  try {
    console.log(`🎨 [ArtifactsAPI] Creating new artifact`);
    
    // Validate request body
    const validation = createArtifactSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, `Invalid artifact data: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }
    
    const artifactData = validation.data;
    
    // Prepare creation request
    const createRequest: CreateArtifactRequest = {
      conversationId: artifactData.conversationId,
      messageId: artifactData.messageId,
      title: artifactData.title,
      type: artifactData.type,
      content: artifactData.content,
      language: artifactData.language,
      metadata: {
        detectionStrategy: artifactData.metadata?.detectionStrategy || 'api_create',
        originalContent: artifactData.metadata?.originalContent || artifactData.content,
        processedContent: artifactData.metadata?.processedContent,
        codeBlocksRemoved: artifactData.metadata?.codeBlocksRemoved || false,
        reconstructionHash: '', // Will be calculated in service
        syncStatus: artifactData.metadata?.syncStatus || 'synced',
        contentSize: Buffer.from(artifactData.content, 'utf8').length,
        fallbackData: artifactData.metadata?.fallbackData || {}
      }
    };
    
    // Create artifact
    const result = await artifactService.createArtifact(createRequest);
    
    if (!result.success) {
      throw new AppError(500, result.error || 'Failed to create artifact');
    }
    
    res.status(201).json({
      success: true,
      data: result.artifact,
      version: result.version,
      syncStatus: result.syncStatus,
      timestamp: new Date()
    });
    
    console.log(`✅ [ArtifactsAPI] Artifact created successfully: ${result.artifact?.id}`);
    
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/artifacts/:artifactId
 * Update existing artifact
 */
router.put('/:artifactId', async (req, res, next) => {
  try {
    const { artifactId } = req.params;
    
    console.log(`🔄 [ArtifactsAPI] Updating artifact: ${artifactId}`);
    
    // Validate request body
    const validation = updateArtifactSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, `Invalid update data: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }
    
    const updateData = validation.data;
    
    // Prepare update request
    const updateRequest: UpdateArtifactRequest = {
      artifactId,
      content: updateData.content,
      title: updateData.title,
      description: updateData.description,
      metadata: updateData.metadata
    };
    
    // Update artifact
    const result = await artifactService.updateArtifact(updateRequest);
    
    if (!result.success) {
      throw new AppError(500, result.error || 'Failed to update artifact');
    }
    
    res.json({
      success: true,
      data: result.artifact,
      version: result.version,
      syncStatus: result.syncStatus,
      timestamp: new Date()
    });
    
    console.log(`✅ [ArtifactsAPI] Artifact updated successfully: ${artifactId} (v${result.version})`);
    
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/artifacts/:artifactId
 * Delete artifact
 */
router.delete('/:artifactId', async (req, res, next) => {
  try {
    const { artifactId } = req.params;
    
    console.log(`🗑️ [ArtifactsAPI] Deleting artifact: ${artifactId}`);
    
    const result = await artifactService.deleteArtifact(artifactId);
    
    if (!result.success) {
      throw new AppError(500, result.error || 'Failed to delete artifact');
    }
    
    res.json({
      success: true,
      message: 'Artifact deleted successfully',
      timestamp: new Date()
    });
    
    console.log(`✅ [ArtifactsAPI] Artifact deleted successfully: ${artifactId}`);
    
  } catch (error) {
    next(error);
  }
});

// =====================================
// BULK OPERATIONS
// =====================================

/**
 * POST /api/artifacts/bulk
 * Perform bulk artifact operations
 */
router.post('/bulk', async (req, res, next) => {
  try {
    console.log(`📦 [ArtifactsAPI] Processing bulk artifact operations`);
    
    // Validate request body
    const validation = bulkOperationSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, `Invalid bulk operation data: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }
    
    const { conversationId, operations } = validation.data;
    
    const results: Array<{
      operation: string;
      artifactId?: string;
      success: boolean;
      error?: string;
      artifact?: any;
    }> = [];
    
    // Process operations sequentially to maintain order
    for (const operation of operations) {
      try {
        switch (operation.type) {
          case 'create':
            if (!operation.artifact) {
              results.push({
                operation: 'create',
                success: false,
                error: 'Artifact data required for create operation'
              });
              continue;
            }
            
            const createResult = await artifactService.createArtifact(operation.artifact as CreateArtifactRequest);
            results.push({
              operation: 'create',
              artifactId: createResult.artifact?.id,
              success: createResult.success,
              error: createResult.error,
              artifact: createResult.artifact
            });
            break;
            
          case 'update':
            if (!operation.artifactId || !operation.artifact) {
              results.push({
                operation: 'update',
                artifactId: operation.artifactId,
                success: false,
                error: 'Artifact ID and data required for update operation'
              });
              continue;
            }
            
            const updateRequest = {
              artifactId: operation.artifactId,
              ...(operation.artifact as UpdateArtifactRequest)
            };
            
            const updateResult = await artifactService.updateArtifact(updateRequest);
            results.push({
              operation: 'update',
              artifactId: operation.artifactId,
              success: updateResult.success,
              error: updateResult.error,
              artifact: updateResult.artifact
            });
            break;
            
          case 'delete':
            if (!operation.artifactId) {
              results.push({
                operation: 'delete',
                success: false,
                error: 'Artifact ID required for delete operation'
              });
              continue;
            }
            
            const deleteResult = await artifactService.deleteArtifact(operation.artifactId);
            results.push({
              operation: 'delete',
              artifactId: operation.artifactId,
              success: deleteResult.success,
              error: deleteResult.error
            });
            break;
            
          default:
            results.push({
              operation: operation.type,
              success: false,
              error: 'Unknown operation type'
            });
        }
      } catch (operationError) {
        console.error(`❌ [ArtifactsAPI] Bulk operation failed:`, operationError);
        results.push({
          operation: operation.type,
          artifactId: operation.artifactId,
          success: false,
          error: operationError instanceof Error ? operationError.message : 'Operation failed'
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    res.json({
      success: failureCount === 0,
      data: {
        conversationId,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      },
      timestamp: new Date()
    });
    
    console.log(`📦 [ArtifactsAPI] Bulk operations completed: ${successCount}/${results.length} successful`);
    
  } catch (error) {
    next(error);
  }
});

// =====================================
// MIGRATION ENDPOINTS
// =====================================

/**
 * POST /api/artifacts/conversations/:conversationId/migrate
 * Migrate artifacts from message metadata
 */
router.post('/conversations/:conversationId/migrate', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    
    console.log(`🔄 [ArtifactsAPI] Starting artifact migration for conversation: ${conversationId}`);
    
    const migrationResult = await artifactService.migrateArtifactsFromMessages(conversationId);
    
    const isSuccess = migrationResult.failedCount === 0;
    
    res.status(isSuccess ? 200 : 207).json({ // 207 Multi-Status if partial success
      success: isSuccess,
      data: migrationResult,
      timestamp: new Date()
    });
    
    console.log(`🔄 [ArtifactsAPI] Migration completed: ${migrationResult.migratedCount} migrated, ${migrationResult.failedCount} failed`);
    
  } catch (error) {
    next(error);
  }
});

// =====================================
// HEALTH AND MONITORING
// =====================================

/**
 * GET /api/artifacts/health
 * Get overall artifacts health status
 */
router.get('/health', async (req, res, next) => {
  try {
    console.log(`🏥 [ArtifactsAPI] Checking artifacts health`);
    
    const healthCheck = await artifactService.getArtifactsHealthCheck();
    
    res.json({
      success: true,
      data: healthCheck,
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/artifacts/conversations/:conversationId/health
 * Get health status for specific conversation artifacts
 */
router.get('/conversations/:conversationId/health', async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    
    console.log(`🏥 [ArtifactsAPI] Checking artifacts health for conversation: ${conversationId}`);
    
    const healthCheck = await artifactService.getArtifactsHealthCheck(conversationId);
    
    res.json({
      success: true,
      data: healthCheck,
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

// =====================================
// SYNC AND CONFLICT RESOLUTION
// =====================================

/**
 * POST /api/artifacts/:artifactId/sync
 * Force sync for specific artifact (for multi-host coordination)
 */
router.post('/:artifactId/sync', async (req, res, next) => {
  try {
    const { artifactId } = req.params;
    
    console.log(`🔄 [ArtifactsAPI] Forcing sync for artifact: ${artifactId}`);
    
    // Get current artifact
    const artifact = await artifactService.getArtifactById(artifactId);
    if (!artifact) {
      throw new AppError(404, 'Artifact not found');
    }
    
    // Update sync status to 'synced' and update timestamps
    const updateResult = await artifactService.updateArtifact({
      artifactId,
      metadata: {
        syncStatus: 'synced',
        lastSyncedAt: new Date()
      }
    });
    
    if (!updateResult.success) {
      throw new AppError(500, updateResult.error || 'Failed to sync artifact');
    }
    
    res.json({
      success: true,
      data: updateResult.artifact,
      message: 'Artifact synced successfully',
      timestamp: new Date()
    });
    
    console.log(`✅ [ArtifactsAPI] Artifact synced successfully: ${artifactId}`);
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/artifacts/conflicts
 * Get all artifacts with sync conflicts
 */
router.get('/conflicts', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    
    console.log(`⚠️ [ArtifactsAPI] Fetching artifacts with conflicts`);
    
    // This would be implemented in the artifact service
    // For now, return a placeholder response
    res.json({
      success: true,
      data: [],
      page: Number(page),
      pageSize: Number(limit),
      total: 0,
      message: 'Conflict resolution feature coming soon',
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

// =====================================
// DEVELOPMENT AND DEBUGGING
// =====================================

/**
 * GET /api/artifacts/debug/stats
 * Get detailed artifacts statistics (development only)
 */
router.get('/debug/stats', async (req, res, next) => {
  try {
    // Only allow in development
    if (process.env.NODE_ENV === 'production') {
      throw new AppError(403, 'Debug endpoints not available in production');
    }
    
    console.log(`🔧 [ArtifactsAPI] Fetching debug statistics`);
    
    const db = artifactService['db']; // Access private property for debugging
    
    const stats = await Promise.all([
      db.artifacts.countDocuments(),
      db.artifacts.countDocuments({ 'metadata.compressionType': 'gzip' }),
      db.artifacts.countDocuments({ 'metadata.syncStatus': 'synced' }),
      db.artifacts.countDocuments({ 'metadata.syncStatus': 'conflict' }),
      db.artifacts.countDocuments({ 'metadata.syncStatus': 'error' }),
      db.artifacts.aggregate([
        { $group: { _id: null, avgSize: { $avg: '$metadata.contentSize' } } }
      ]).toArray()
    ]);
    
    res.json({
      success: true,
      data: {
        totalArtifacts: stats[0],
        compressedArtifacts: stats[1],
        syncedArtifacts: stats[2],
        conflictedArtifacts: stats[3],
        erroredArtifacts: stats[4],
        averageContentSize: stats[5][0]?.avgSize || 0,
        compressionRatio: stats[0] > 0 ? (stats[1] / stats[0] * 100).toFixed(2) + '%' : '0%'
      },
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

export { router as artifactsRouter };
