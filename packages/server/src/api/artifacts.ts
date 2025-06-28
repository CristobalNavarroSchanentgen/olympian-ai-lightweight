import { Router } from 'express';
import { z } from 'zod';
import { 
  CreateArtifactRequest, 
  UpdateArtifactRequest, 
  ArtifactOperationResponse,
  ArtifactHealthCheck,
  MultiArtifactCreationRequest,
  MultiArtifactCreationResponse,
  BatchArtifactOperation,
  MULTI_ARTIFACT_CONFIG,
  validateArtifactCreationRules,
  detectDuplicateArtifacts,
  calculateContentHash
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
  order: z.number().min(0).optional(), // NEW: Multi-artifact support
  groupId: z.string().optional(), // NEW: Multi-artifact support
  metadata: z.object({
    detectionStrategy: z.string().optional(),
    originalContent: z.string().optional(),
    processedContent: z.string().optional(),
    codeBlocksRemoved: z.boolean().optional(),
    fallbackData: z.record(z.any()).optional(),
    syncStatus: z.enum(['synced', 'pending', 'conflict', 'error']).optional(),
    contentSize: z.number().optional(),
    compressionType: z.enum(['none', 'gzip', 'lz4']).optional(),
    cacheKey: z.string().optional(),
    // NEW: Multi-artifact metadata
    partOfMultiArtifact: z.boolean().optional(),
    artifactIndex: z.number().optional(),
    totalArtifactsInMessage: z.number().optional(),
    groupingStrategy: z.string().optional(),
    // Phase 6: Enhanced metadata
    contentHash: z.string().optional(),
    isDuplicate: z.boolean().optional(),
    duplicateOf: z.string().optional(),
    similarityScore: z.number().optional()
  }).optional().default({})
});

const updateArtifactSchema = z.object({
  content: z.string().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  order: z.number().min(0).optional(), // NEW: Multi-artifact support
  metadata: z.object({
    detectionStrategy: z.string().optional(),
    originalContent: z.string().optional(),
    processedContent: z.string().optional(),
    codeBlocksRemoved: z.boolean().optional(),
    fallbackData: z.record(z.any()).optional(),
    syncStatus: z.enum(['synced', 'pending', 'conflict', 'error']).optional(),
    // NEW: Multi-artifact metadata updates
    partOfMultiArtifact: z.boolean().optional(),
    artifactIndex: z.number().optional(),
    totalArtifactsInMessage: z.number().optional(),
    groupingStrategy: z.string().optional(),
    // Phase 6: Enhanced metadata updates
    contentHash: z.string().optional(),
    isDuplicate: z.boolean().optional(),
    duplicateOf: z.string().optional(),
    similarityScore: z.number().optional()
  }).optional()
}).refine(data => data.content || data.title || data.metadata || data.order !== undefined, {
  message: "At least one field (content, title, order, or metadata) must be provided"
});

// NEW: Multi-artifact creation schema
const multiArtifactCreateSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  artifacts: z.array(z.object({
    title: z.string().min(1).max(200),
    type: z.enum(['text', 'code', 'html', 'react', 'svg', 'mermaid', 'json', 'csv', 'markdown']),
    content: z.string().min(1),
    language: z.string().optional(),
    order: z.number().min(0)
  })).min(1).max(MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE),
  originalContent: z.string().min(1),
  processedContent: z.string().min(1),
  metadata: z.object({
    detectionStrategy: z.string().optional(),
    groupingStrategy: z.string().optional(),
    fallbackData: z.record(z.any()).optional()
  }).optional().default({})
});

const bulkOperationSchema = z.object({
  conversationId: z.string().min(1),
  operations: z.array(z.object({
    type: z.enum(['create', 'update', 'delete']),
    artifact: z.union([createArtifactSchema, updateArtifactSchema]).optional(),
    artifactId: z.string().optional()
  })).min(1).max(50) // Limit bulk operations
});

// NEW: Phase 6 validation schema
const validateArtifactsSchema = z.object({
  artifacts: z.array(z.object({
    content: z.string(),
    type: z.enum(['text', 'code', 'html', 'react', 'svg', 'mermaid', 'json', 'csv', 'markdown']),
    title: z.string().optional()
  })).min(1).max(20)
});

// =====================================
// PHASE 6: VALIDATION ENDPOINTS
// =====================================

/**
 * NEW: POST /api/artifacts/validate
 * Validate artifacts before creation (Phase 6)
 */
router.post('/validate', async (req, res, next) => {
  try {
    console.log(`🔍 [ArtifactsAPI] Validating artifact creation rules`);
    
    // Validate request body
    const validation = validateArtifactsSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, `Invalid validation request: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }
    
    const { artifacts } = validation.data;
    
    // Apply Phase 6 validation rules
    const validationResult = validateArtifactCreationRules(artifacts);
    
    // Detect duplicates - FIXED: Handle missing titles properly
    const artifactsWithTitles = artifacts.filter(artifact => artifact.title) as Array<{ content: string; title: string; type: any }>;
    const duplicates = detectDuplicateArtifacts(artifactsWithTitles);
    
    // Calculate content hashes
    const artifactsWithHashes = artifacts.map((artifact, index) => ({
      index,
      ...artifact,
      contentHash: calculateContentHash(artifact.content),
      contentSize: Buffer.from(artifact.content, 'utf8').length
    }));
    
    res.json({
      success: validationResult.valid,
      data: {
        validation: validationResult,
        duplicates: duplicates.map(dup => ({
          ...dup,
          similarity: Math.round(dup.similarity * 100) / 100 // Round to 2 decimal places
        })),
        artifacts: artifactsWithHashes,
        summary: {
          totalArtifacts: artifacts.length,
          validArtifacts: artifacts.filter(a => a.content.length >= MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE).length,
          duplicateArtifacts: duplicates.length,
          withinLimits: artifacts.length <= MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE,
          config: {
            maxArtifacts: MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE,
            minContentSize: MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE,
            duplicateThreshold: MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.SIMILARITY_THRESHOLD
          }
        }
      },
      timestamp: new Date()
    });
    
    console.log(`✅ [ArtifactsAPI] Validation completed: ${validationResult.valid ? 'PASSED' : 'FAILED'}`);
    
  } catch (error) {
    next(error);
  }
});

/**
 * NEW: GET /api/artifacts/validation-rules
 * Get current validation rules and configuration (Phase 6)
 */
router.get('/validation-rules', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        limits: {
          maxArtifactsPerMessage: MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE,
          minContentSize: MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE
        },
        duplicateDetection: {
          enabled: MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.ENABLE_FUZZY_MATCHING,
          similarityThreshold: MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.SIMILARITY_THRESHOLD,
          minContentSizeForDetection: MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.MIN_CONTENT_SIZE_FOR_DETECTION,
          algorithm: MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.HASH_ALGORITHM
        },
        groupingStrategies: MULTI_ARTIFACT_CONFIG.GROUPING_STRATEGIES,
        separationMarkers: MULTI_ARTIFACT_CONFIG.SEPARATION_MARKERS,
        supportedTypes: ['text', 'code', 'html', 'react', 'svg', 'mermaid', 'json', 'csv', 'markdown']
      },
      timestamp: new Date()
    });
  } catch (error) {
    next(error);
  }
});

// =====================================
// MULTI-ARTIFACT ENDPOINTS (PHASE 5)
// =====================================

/**
 * NEW: GET /api/artifacts/by-message/:messageId
 * Get all artifacts for a specific message (Phase 5)
 */
router.get('/by-message/:messageId', async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { orderBy = 'order', direction = 'asc' } = req.query;
    
    console.log(`📋 [ArtifactsAPI] Fetching artifacts for message: ${messageId}`);
    
    const artifacts = await artifactService.getArtifactsByMessageId(messageId);
    
    // FIXED: Sort artifacts with proper TypeScript types
    const sortedArtifacts = artifacts.sort((a: any, b: any) => {
      const field = orderBy as keyof typeof a;
      const aVal = a[field] ?? 0;
      const bVal = b[field] ?? 0;
      
      if (direction === 'desc') {
        return aVal < bVal ? 1 : -1;
      }
      return aVal > bVal ? 1 : -1;
    });
    
    res.json({
      success: true,
      data: {
        messageId,
        artifacts: sortedArtifacts,
        total: sortedArtifacts.length,
        hasMultipleArtifacts: sortedArtifacts.length > 1,
        metadata: {
          groupingStrategy: sortedArtifacts[0]?.metadata?.groupingStrategy,
          detectionStrategy: sortedArtifacts[0]?.metadata?.detectionStrategy,
          partOfMultiArtifact: sortedArtifacts.length > 1
        }
      },
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * NEW: POST /api/artifacts/multi-create
 * Create multiple artifacts in a single request (Phase 5)
 */
router.post('/multi-create', async (req, res, next) => {
  try {
    console.log(`🎨 [ArtifactsAPI] Creating multiple artifacts`);
    
    // Validate request body
    const validation = multiArtifactCreateSchema.safeParse(req.body);
    if (!validation.success) {
      throw new AppError(400, `Invalid multi-artifact data: ${validation.error.errors.map(e => e.message).join(', ')}`);
    }
    
    const { conversationId, messageId, artifacts, originalContent, processedContent, metadata } = validation.data;
    
    // Phase 6: Validate artifacts before creation - FIXED: Ensure title is always string
    const artifactsWithRequiredTitles = artifacts.map(artifact => ({
      content: artifact.content,
      type: artifact.type,
      title: artifact.title // title is required in schema so this is safe
    }));
    
    const validationResult = validateArtifactCreationRules(artifactsWithRequiredTitles);
    if (!validationResult.valid) {
      throw new AppError(400, `Artifact validation failed: ${validationResult.errors.join(', ')}`);
    }
    
    // Phase 6: Check for duplicates
    const duplicates = detectDuplicateArtifacts(artifactsWithRequiredTitles);
    if (duplicates.length > 0) {
      console.warn(`⚠️ [ArtifactsAPI] Found ${duplicates.length} potential duplicates, proceeding with creation but marking them`);
    }
    
    // Create artifacts sequentially to maintain order
    const createdArtifacts = [];
    const errors = [];
    
    for (let i = 0; i < artifacts.length; i++) {
      const artifactData = artifacts[i];
      
      try {
        // Phase 6: Check if this artifact is a duplicate
        const isDuplicate = duplicates.some(dup => dup.index === i);
        const duplicateInfo = duplicates.find(dup => dup.index === i);
        const contentHash = calculateContentHash(artifactData.content);
        
        const createRequest: CreateArtifactRequest = {
          conversationId,
          messageId,
          title: artifactData.title,
          type: artifactData.type,
          content: artifactData.content,
          language: artifactData.language,
          order: artifactData.order,
          metadata: {
            detectionStrategy: metadata?.detectionStrategy || 'multi-artifact-api',
            originalContent,
            processedContent,
            codeBlocksRemoved: true,
            reconstructionHash: '', // Will be calculated in service
            syncStatus: 'synced',
            contentSize: Buffer.from(artifactData.content, 'utf8').length,
            partOfMultiArtifact: artifacts.length > 1,
            artifactIndex: i,
            totalArtifactsInMessage: artifacts.length,
            groupingStrategy: metadata?.groupingStrategy || 'api-multi-create',
            // Phase 6: Enhanced metadata
            contentHash,
            isDuplicate,
            duplicateOf: isDuplicate ? duplicateInfo?.duplicateOf.toString() : undefined,
            similarityScore: duplicateInfo?.similarity,
            fallbackData: metadata?.fallbackData || {}
          }
        };
        
        const result = await artifactService.createArtifact(createRequest);
        
        if (result.success && result.artifact) {
          createdArtifacts.push(result.artifact);
        } else {
          errors.push({
            index: i,
            title: artifactData.title,
            error: result.error || 'Unknown error'
          });
        }
        
      } catch (error) {
        console.error(`❌ [ArtifactsAPI] Error creating artifact ${i + 1}:`, error);
        errors.push({
          index: i,
          title: artifactData.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const response: MultiArtifactCreationResponse = {
      success: errors.length === 0,
      artifacts: createdArtifacts,
      processedContent,
      artifactCount: createdArtifacts.length,
      errors: errors.length > 0 ? errors : undefined,
      operation: 'multi-create',
      timestamp: new Date()
    };
    
    res.status(errors.length === 0 ? 201 : 207).json(response); // 207 Multi-Status if partial success
    
    console.log(`✅ [ArtifactsAPI] Multi-artifact creation completed: ${createdArtifacts.length}/${artifacts.length} successful`);
    
  } catch (error) {
    next(error);
  }
});

/**
 * NEW: PUT /api/artifacts/by-message/:messageId/reorder
 * Reorder artifacts within a message (Phase 5)
 */
router.put('/by-message/:messageId/reorder', async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { artifactOrder } = req.body; // Array of { artifactId, order }
    
    if (!Array.isArray(artifactOrder)) {
      throw new AppError(400, 'artifactOrder must be an array');
    }
    
    console.log(`🔄 [ArtifactsAPI] Reordering artifacts for message: ${messageId}`);
    
    const results = [];
    
    for (const { artifactId, order } of artifactOrder) {
      if (!artifactId || typeof order !== 'number') {
        results.push({
          artifactId,
          success: false,
          error: 'Invalid artifactId or order value'
        });
        continue;
      }
      
      try {
        const updateResult = await artifactService.updateArtifact({
          artifactId,
          metadata: { artifactIndex: order }
        });
        
        results.push({
          artifactId,
          success: updateResult.success,
          error: updateResult.error,
          newOrder: order
        });
        
      } catch (error) {
        results.push({
          artifactId,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
    
    const successCount = results.filter(r => r.success).length;
    
    res.json({
      success: successCount === results.length,
      data: {
        messageId,
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: results.length - successCount
        }
      },
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
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
    const { groupByMessage = 'false', orderBy = 'createdAt', direction = 'asc' } = req.query;
    
    console.log(`📋 [ArtifactsAPI] Fetching artifacts for conversation: ${conversationId}`);
    
    const artifacts = await artifactService.getArtifactsForConversation(conversationId);
    
    // NEW: Option to group by message ID
    if (groupByMessage === 'true') {
      const groupedArtifacts = artifacts.reduce((groups, artifact) => {
        const messageId = artifact.messageId || 'unknown';
        if (!groups[messageId]) {
          groups[messageId] = [];
        }
        groups[messageId].push(artifact);
        return groups;
      }, {} as Record<string, typeof artifacts>);
      
      // Sort within each group
      Object.keys(groupedArtifacts).forEach(messageId => {
        groupedArtifacts[messageId].sort((a, b) => {
          const orderA = a.order ?? a.metadata?.artifactIndex ?? 0;
          const orderB = b.order ?? b.metadata?.artifactIndex ?? 0;
          return orderA - orderB;
        });
      });
      
      res.json({
        success: true,
        data: {
          conversationId,
          artifactsByMessage: groupedArtifacts,
          totalArtifacts: artifacts.length,
          totalMessages: Object.keys(groupedArtifacts).length,
          messagesWithMultipleArtifacts: Object.values(groupedArtifacts).filter(arr => arr.length > 1).length
        },
        timestamp: new Date()
      });
    } else {
      // Regular flat list
      res.json({
        success: true,
        data: artifacts,
        total: artifacts.length,
        timestamp: new Date()
      });
    }
    
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
 * GET /api/artifacts/:artifactId/versions
 * Get all versions for an artifact
 */
router.get('/:artifactId/versions', async (req, res, next) => {
  try {
    const { artifactId } = req.params;
    
    console.log(`📚 [ArtifactsAPI] Fetching versions for artifact: ${artifactId}`);
    
    const versions = await artifactService.getArtifactVersions(artifactId);
    
    res.json({
      success: true,
      data: versions,
      total: versions.length,
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/artifacts/:artifactId/versions/:version
 * Get specific version of an artifact
 */
router.get('/:artifactId/versions/:version', async (req, res, next) => {
  try {
    const { artifactId, version } = req.params;
    const versionNumber = parseInt(version, 10);
    
    if (isNaN(versionNumber) || versionNumber < 1) {
      throw new AppError(400, 'Invalid version number');
    }
    
    console.log(`🔍 [ArtifactsAPI] Fetching artifact ${artifactId} version ${versionNumber}`);
    
    const artifactVersion = await artifactService.getArtifactVersion(artifactId, versionNumber);
    
    if (!artifactVersion) {
      throw new AppError(404, 'Artifact version not found');
    }
    
    res.json({
      success: true,
      data: artifactVersion,
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
    
    // Phase 6: Validate single artifact
    const validationResult = validateArtifactCreationRules([{
      content: artifactData.content,
      type: artifactData.type,
      title: artifactData.title // title is required in schema
    }]);
    
    if (!validationResult.valid) {
      throw new AppError(400, `Artifact validation failed: ${validationResult.errors.join(', ')}`);
    }
    
    // Phase 6: Calculate content hash
    const contentHash = calculateContentHash(artifactData.content);
    
    // Prepare creation request
    const createRequest: CreateArtifactRequest = {
      conversationId: artifactData.conversationId,
      messageId: artifactData.messageId,
      title: artifactData.title,
      type: artifactData.type,
      content: artifactData.content,
      language: artifactData.language,
      order: artifactData.order,
      groupId: artifactData.groupId,
      metadata: {
        detectionStrategy: artifactData.metadata?.detectionStrategy || 'api_create',
        originalContent: artifactData.metadata?.originalContent || artifactData.content,
        processedContent: artifactData.metadata?.processedContent,
        codeBlocksRemoved: artifactData.metadata?.codeBlocksRemoved || false,
        reconstructionHash: '', // Will be calculated in service
        syncStatus: artifactData.metadata?.syncStatus || 'synced',
        contentSize: Buffer.from(artifactData.content, 'utf8').length,
        // NEW: Multi-artifact metadata
        partOfMultiArtifact: artifactData.metadata?.partOfMultiArtifact || false,
        artifactIndex: artifactData.metadata?.artifactIndex,
        totalArtifactsInMessage: artifactData.metadata?.totalArtifactsInMessage,
        groupingStrategy: artifactData.metadata?.groupingStrategy,
        // Phase 6: Enhanced metadata
        contentHash,
        isDuplicate: artifactData.metadata?.isDuplicate || false,
        duplicateOf: artifactData.metadata?.duplicateOf,
        similarityScore: artifactData.metadata?.similarityScore,
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
    
    // Phase 6: If content is being updated, validate and calculate new hash
    let enhancedMetadata = updateData.metadata || {};
    if (updateData.content) {
      const validationResult = validateArtifactCreationRules([{
        content: updateData.content,
        type: 'code' // Default type for validation, actual type will be preserved
      }]);
      
      if (!validationResult.valid) {
        throw new AppError(400, `Content validation failed: ${validationResult.errors.join(', ')}`);
      }
      
      enhancedMetadata.contentHash = calculateContentHash(updateData.content);
      enhancedMetadata.isDuplicate = false; // Reset duplicate flag on content change
      enhancedMetadata.duplicateOf = undefined;
      enhancedMetadata.similarityScore = undefined;
    }
    
    // Prepare update request
    const updateRequest: UpdateArtifactRequest = {
      artifactId,
      content: updateData.content,
      title: updateData.title,
      description: updateData.description,
      metadata: {
        ...enhancedMetadata,
        // Handle order updates through metadata if not directly provided
        ...(updateData.order !== undefined && { artifactIndex: updateData.order })
      }
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
            
            // Fix: Properly merge the update request without duplicate artifactId
            const updateRequestData = operation.artifact as UpdateArtifactRequest;
            const updateRequest: UpdateArtifactRequest = {
              ...updateRequestData,
              artifactId: operation.artifactId // Ensure artifactId is set correctly
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
    
    const db = (artifactService as any)['db']; // Access private property for debugging
    
    const stats = await Promise.all([
      db.artifacts.countDocuments(),
      db.artifacts.countDocuments({ 'metadata.compressionType': 'gzip' }),
      db.artifacts.countDocuments({ 'metadata.syncStatus': 'synced' }),
      db.artifacts.countDocuments({ 'metadata.syncStatus': 'conflict' }),
      db.artifacts.countDocuments({ 'metadata.syncStatus': 'error' }),
      // NEW: Multi-artifact statistics
      db.artifacts.countDocuments({ 'metadata.partOfMultiArtifact': true }),
      db.artifacts.countDocuments({ 'metadata.isDuplicate': true }),
      db.artifacts.aggregate([
        { $group: { _id: null, avgSize: { $avg: '$metadata.contentSize' } } }
      ]).toArray(),
      db.artifacts.aggregate([
        { $group: { _id: '$messageId', count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $count: 'messagesWithMultipleArtifacts' }
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
        multiArtifacts: stats[5], // NEW: Multi-artifact count
        duplicateArtifacts: stats[6], // NEW: Phase 6 duplicate count
        averageContentSize: stats[7][0]?.avgSize || 0,
        messagesWithMultipleArtifacts: stats[8][0]?.messagesWithMultipleArtifacts || 0, // NEW
        compressionRatio: stats[0] > 0 ? (stats[1] / stats[0] * 100).toFixed(2) + '%' : '0%',
        multiArtifactRatio: stats[0] > 0 ? (stats[5] / stats[0] * 100).toFixed(2) + '%' : '0%', // NEW
        duplicateRatio: stats[0] > 0 ? (stats[6] / stats[0] * 100).toFixed(2) + '%' : '0%' // NEW: Phase 6
      },
      timestamp: new Date()
    });
    
  } catch (error) {
    next(error);
  }
});

export { router as artifactsRouter };
