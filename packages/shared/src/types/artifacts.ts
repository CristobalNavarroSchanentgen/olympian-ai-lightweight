export interface Artifact {
  id: string;
  title: string;
  type: ArtifactType;
  content: string;
  language?: string; // For code artifacts
  version: number;
  createdAt: Date;
  updatedAt: Date;
  messageId?: string; // Reference to the message that created this artifact
  conversationId: string;
  metadata?: ArtifactMetadata;
  // Enhanced properties for subproject 3
  checksum?: string; // Content integrity hash
  confidence?: number; // Confidence score (0-1) for artifact detection/creation
  // NEW: Multi-artifact support (Phase 1)
  order?: number; // Display order when multiple artifacts exist
  groupId?: string; // Optional grouping identifier for related artifacts
}

// NEW: Enhanced document type for database storage
export interface ArtifactDocument extends Omit<Artifact, 'createdAt' | 'updatedAt'> {
  _id?: string; // MongoDB ObjectId
  checksum: string; // Content integrity hash
  serverInstance?: string; // Multi-host coordination
  createdAt: Date | string; // Support both Date and ISO string
  updatedAt: Date | string; // Support both Date and ISO string
  lastAccessedAt?: Date | string; // Cache management
  metadata: ArtifactMetadata; // Required for document storage
}

export type ArtifactType = 
  | 'text'           // Markdown or plain text documents
  | 'code'           // Code snippets (various languages)
  | 'html'           // HTML with live preview
  | 'react'          // React components
  | 'svg'            // SVG diagrams and images
  | 'mermaid'        // Mermaid diagrams
  | 'json'           // JSON data
  | 'csv'            // CSV data
  | 'markdown';      // Structured markdown documents

export type ArtifactViewMode = 'code' | 'preview' | 'split';

// UPDATED: Enhanced for multi-artifact detection (Phase 2)
export interface ArtifactDetectionResult {
  shouldCreateArtifact: boolean;
  type?: ArtifactType;
  title?: string;
  language?: string;
  content?: string;
  // New fields for subproject 3 - prose-only chat mode
  processedContent?: string; // Content with code blocks removed for chat display
  codeBlocksRemoved?: boolean; // Flag indicating if code blocks were removed
  // NEW: Multi-artifact detection fields (Phase 2)
  artifacts?: Array<{
    type: ArtifactType;
    title: string;
    language?: string;
    content: string;
    startIndex: number;
    endIndex: number;
    confidence: number; // 0-1 confidence score
  }>;
  totalArtifacts?: number;
  detectionStrategy?: string;
  smartGrouping?: {
    groupedByLanguage: boolean;
    groupedByType: boolean;
    explicitSeparation: boolean;
  };
}

// NEW: Multi-artifact creation request (Phase 3)
export interface MultiArtifactCreationRequest {
  conversationId: string;
  messageId: string;
  artifacts: Array<{
    title: string;
    type: ArtifactType;
    content: string;
    language?: string;
    order: number;
  }>;
  originalContent: string;
  processedContent: string;
  metadata?: Partial<ArtifactMetadata>;
}

// NEW: Multi-artifact creation response (Phase 3)
export interface MultiArtifactCreationResponse {
  success: boolean;
  artifacts: Artifact[];
  processedContent: string;
  artifactCount: number;
  errors?: Array<{
    index: number;
    title: string;
    error: string;
  }>;
  operation: 'multi-create';
  timestamp: Date;
}

// NEW: Batch artifact operations (Phase 3)
export interface BatchArtifactOperation {
  operation: 'create' | 'update' | 'delete';
  artifacts: Array<{
    id?: string; // For update/delete operations
    title?: string;
    type?: ArtifactType;
    content?: string;
    language?: string;
    order?: number;
  }>;
  conversationId: string;
  messageId?: string;
}

export interface ArtifactVersion {
  version: number;
  content: string;
  createdAt: Date;
  description?: string;
}

export interface ArtifactUpdateRequest {
  artifactId: string;
  content: string;
  description?: string;
}

// Enhanced message metadata to include artifact information
export interface ArtifactMessageMetadata {
  artifactId?: string;
  artifactType?: ArtifactType;
  hasArtifact?: boolean;
  // New fields for subproject 3
  originalContent?: string; // Original content before code block removal
  codeBlocksRemoved?: boolean; // Whether code blocks were removed for prose-only display
  // NEW: Multi-artifact metadata (Phase 1)
  artifacts?: Array<{
    artifactId: string;
    artifactType: ArtifactType;
    order: number;
  }>;
  artifactCount?: number;
}

// Sync status type for better type safety
export type ArtifactSyncStatus = 'synced' | 'pending' | 'conflict' | 'error';

// NEW: Enhanced metadata for Phase 3 multi-host optimizations
export interface ArtifactMetadata {
  // Synchronization - Required field for consistency
  syncStatus: ArtifactSyncStatus;
  
  // Content processing - Required fields
  codeBlocksRemoved: boolean;
  detectionStrategy: string; // How artifact was detected
  originalContent: string; // Original content before processing
  reconstructionHash: string; // Hash for reconstruction verification
  contentSize: number; // Content size in bytes
  
  // NEW: Multi-artifact specific metadata (Phase 1)
  partOfMultiArtifact?: boolean; // Whether this artifact is part of a multi-artifact message
  artifactIndex?: number; // Index in the multi-artifact array
  totalArtifactsInMessage?: number; // Total number of artifacts in the same message
  groupingStrategy?: string; // Strategy used for grouping (language, type, explicit, etc.)
  
  // Performance optimizations
  compressed?: boolean;
  originalSize?: number;
  compressedSize?: number;
  compressionRatio?: number;
  lazyLoad?: boolean;
  
  // CDN integration
  cdnUrl?: string;
  cdnPath?: string;
  contentType?: string;
  
  // Multi-host coordination
  instanceId?: string; // Instance that created/modified
  lastSyncedAt?: Date;
  lockExpiry?: Date;
  
  // Client state
  lightweight?: boolean; // Whether this is a lightweight version
  
  // Additional metadata for compression and caching
  compressionType?: 'none' | 'gzip' | 'lz4';
  cacheKey?: string;
  
  // NEW: Phase 6 duplicate detection metadata
  contentHash?: string; // Hash for duplicate detection
  similarityScore?: number; // 0-1 similarity to other artifacts
  isDuplicate?: boolean; // Flag for detected duplicates
  duplicateOf?: string; // Reference to original artifact if this is a duplicate
  
  // Legacy support
  fallbackData?: Record<string, any>; // Allow additional properties for backward compatibility
}

// MISSING TYPES FOR SUBPROJECT 3 - Adding these to fix compilation errors

// Artifact integrity and verification types
export interface ArtifactIntegrityResult {
  valid: boolean;
  score: number; // 0-1 score
  reason?: string;
  issues: string[];
  timestamp: Date;
  checks: {
    structure: boolean;
    content: boolean;
    metadata: boolean;
    type: boolean;
    size: boolean;
  };
}

// Content fingerprinting for integrity checks
export interface ContentFingerprint {
  checksum: string;
  length: number;
  patterns: string[];
  language?: string;
  encoding: string;
  timestamp: Date;
  version: string;
}

// Artifact repair entry for tracking repairs
export interface ArtifactRepairEntry {
  artifactId: string;
  repairType: 'content' | 'metadata' | 'structure' | 'type';
  repairStrategy: string;
  beforeRepair: {
    content?: string;
    metadata?: Partial<ArtifactMetadata>;
    checksum?: string;
  };
  afterRepair: {
    content?: string;
    metadata?: Partial<ArtifactMetadata>;
    checksum?: string;
  };
  success: boolean;
  error?: string;
  timestamp: Date;
  confidence: number; // 0-1
}

// Statistics for artifact operations
export interface ArtifactStatistics {
  conversationId: string;
  totalArtifacts: number;
  artifactsByType: Record<ArtifactType, number>;
  recreationStats: {
    totalAttempts: number;
    successRate: number; // 0-1
    averageConfidence: number; // 0-1
    averageAttempts: number;
    strategiesUsed: string[];
    fallbackRate: number; // 0-1
  };
  integrityStats: {
    validArtifacts: number;
    averageIntegrityScore: number; // 0-1
    commonIssues: string[];
    repairRate: number; // 0-1
  };
  performanceStats: {
    averageDetectionTime: number; // ms
    averageRecreationTime: number; // ms
    totalProcessingTime: number; // ms
  };
  // NEW: Multi-artifact statistics (Phase 1)
  multiArtifactStats: {
    messagesWithMultipleArtifacts: number;
    averageArtifactsPerMessage: number;
    maxArtifactsInSingleMessage: number;
    commonGroupingStrategies: string[];
    groupingSuccessRate: number; // 0-1
  };
  lastUpdated: Date;
}

// EXISTING TYPES BELOW - keeping for compatibility

export interface CreateArtifactRequest {
  title: string;
  type: ArtifactType;
  content: string;
  language?: string;
  conversationId: string;
  messageId?: string;
  metadata?: Partial<ArtifactMetadata>;
  // NEW: Multi-artifact support (Phase 1)
  order?: number; // Display order for multi-artifact messages
  groupId?: string; // Optional grouping identifier
}

export interface UpdateArtifactRequest {
  artifactId: string;
  content?: string;
  title?: string;
  language?: string;
  description?: string;
  metadata?: Partial<ArtifactMetadata>;
}

export interface ArtifactOperationResponse {
  success: boolean;
  artifact?: Artifact;
  error?: string;
  operation: 'create' | 'update' | 'delete' | 'get' | 'list' | 'multi-create';
  timestamp: Date;
  // Multi-host specific fields
  version?: number; // Add version field that was being used
  instanceId?: string;
  syncStatus?: ArtifactSyncStatus;
  conflictData?: ArtifactConflictResolution;
  // NEW: Multi-artifact operation fields (Phase 3)
  artifacts?: Artifact[]; // For multi-artifact operations
  artifactCount?: number;
  batchResults?: Array<{
    success: boolean;
    artifact?: Artifact;
    error?: string;
  }>;
}

export interface ArtifactHealthCheck {
  conversationId?: string; // Add optional conversationId field
  healthy: boolean;
  totalArtifacts: number;
  syncedArtifacts: number; // Rename from corruptedArtifacts
  conflictedArtifacts: number; // Rename from orphanedArtifacts  
  erroredArtifacts: number; // Rename from inconsistentMetadata
  lastSyncAt?: Date; // Rename from lastCheckDate
  issues: Array<{
    type: 'corruption' | 'orphaned' | 'metadata' | 'sync' | 'checksum';
    artifactId: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  // Multi-host specific health metrics
  instanceHealth?: {
    [instanceId: string]: {
      healthy: boolean;
      lastSeen: Date;
      artifactCount: number;
      syncLatency: number;
    };
  };
  // NEW: Multi-artifact health metrics (Phase 1)
  multiArtifactHealth?: {
    orphanedArtifacts: number; // Artifacts without valid message references
    inconsistentGrouping: number; // Artifacts with incorrect order/grouping
    duplicateArtifacts: number; // Potential duplicate content
  };
}

export interface ArtifactSyncData {
  artifactId: string;
  syncStatus: ArtifactSyncStatus;
  lastSyncedAt: Date;
  sourceInstance: string;
  targetInstances: string[];
  syncHash: string;
  conflictResolution?: ArtifactConflictResolution;
  retryCount: number;
  maxRetries: number;
  error?: string;
}

export interface ArtifactConflictResolution {
  conflictId: string;
  artifactId: string;
  conflictType: 'content' | 'metadata' | 'version' | 'deletion';
  resolutionStrategy: 'manual' | 'auto-merge' | 'latest-wins' | 'instance-priority';
  conflictingVersions: Array<{
    instanceId: string;
    version: number;
    timestamp: Date;
    content: string;
    metadata: ArtifactMetadata;
  }>;
  resolvedVersion?: {
    content: string;
    metadata: ArtifactMetadata;
    resolutionTimestamp: Date;
    resolvedBy: string; // instance or user ID
  };
  manualIntervention: boolean;
  resolved: boolean;
}

export interface ArtifactMigrationData {
  migrationId?: string; // Make optional
  fromVersion?: string; // Make optional
  toVersion?: string; // Make optional
  status?: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back'; // Make optional
  conversationId: string; // Add required conversationId
  migratedCount: number; // Add required migratedCount
  failedCount: number; // Add required failedCount
  errors: Array<{
    messageId?: string;
    artifactId?: string;
    error: string;
    details?: string;
    canRetry?: boolean;
  }>; // Update errors structure
  duration?: number; // Add duration field
  strategy?: string; // Add strategy field
  // Optional migration tracking fields
  artifactsToMigrate?: string[];
  migratedArtifacts?: string[];
  failedArtifacts?: Array<{
    artifactId: string;
    error: string;
    canRetry: boolean;
  }>;
  startTime?: Date;
  endTime?: Date;
  migrationSteps?: Array<{
    step: string;
    status: 'pending' | 'completed' | 'failed';
    timestamp?: Date;
    error?: string;
  }>;
  rollbackPlan?: {
    steps: string[];
    backupLocation: string;
    canRollback: boolean;
  };
  // NEW: Multi-artifact migration fields (Phase 1)
  multiArtifactSupport?: {
    enabled: boolean;
    migrationStrategy: 'progressive' | 'batch' | 'lazy';
    batchSize: number;
    preserveOrdering: boolean;
  };
}

// NEW: Multi-artifact utility constants and functions (Phase 6)
export const MULTI_ARTIFACT_CONFIG = {
  MAX_ARTIFACTS_PER_MESSAGE: 10,
  MIN_CONTENT_SIZE: 20,
  GROUPING_STRATEGIES: [
    'language-based',
    'type-based', 
    'explicit-separation',
    'size-based',
    'sequence-based'
  ],
  SEPARATION_MARKERS: [
    'File 1:', 'File 2:', 'Script A:', 'Script B:',
    '---', '===', '## ', '### ',
    'Part 1:', 'Part 2:', 'Section ',
    '1.', '2.', '3.', '4.', '5.'
  ],
  DUPLICATE_DETECTION: {
    SIMILARITY_THRESHOLD: 0.95, // 95% similarity considered duplicate
    MIN_CONTENT_SIZE_FOR_DETECTION: 50, // Minimum size to check for duplicates
    HASH_ALGORITHM: 'sha256',
    ENABLE_FUZZY_MATCHING: true
  }
} as const;

// =====================================================
// PHASE 6: ENHANCED DUPLICATE DETECTION LOGIC
// =====================================================

/**
 * Calculate content hash for duplicate detection
 */
export function calculateContentHash(content: string): string {
  // Simple hash function for content comparison
  // In production, this should use a proper crypto library
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Calculate similarity score between two artifacts
 */
export function calculateSimilarityScore(content1: string, content2: string): number {
  if (content1 === content2) return 1.0;
  if (content1.length === 0 || content2.length === 0) return 0.0;
  
  const shorter = content1.length < content2.length ? content1 : content2;
  const longer = content1.length >= content2.length ? content1 : content2;
  
  // Simple Levenshtein distance-based similarity
  const editDistance = calculateEditDistance(shorter, longer);
  const maxLength = Math.max(content1.length, content2.length);
  
  return 1 - (editDistance / maxLength);
}

/**
 * Calculate edit distance for similarity comparison
 */
function calculateEditDistance(str1: string, str2: string): number {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Detect duplicates in a list of artifacts
 */
export function detectDuplicateArtifacts(
  artifacts: Array<{ content: string; title: string; type: ArtifactType }>
): Array<{ index: number; duplicateOf: number; similarity: number }> {
  const duplicates: Array<{ index: number; duplicateOf: number; similarity: number }> = [];
  
  for (let i = 0; i < artifacts.length; i++) {
    const current = artifacts[i];
    
    // Skip if content is too small for meaningful duplicate detection
    if (current.content.length < MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.MIN_CONTENT_SIZE_FOR_DETECTION) {
      continue;
    }
    
    for (let j = i + 1; j < artifacts.length; j++) {
      const candidate = artifacts[j];
      
      // Skip if different types (less likely to be duplicates)
      if (current.type !== candidate.type) {
        continue;
      }
      
      const similarity = calculateSimilarityScore(current.content, candidate.content);
      
      if (similarity >= MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.SIMILARITY_THRESHOLD) {
        duplicates.push({
          index: j,
          duplicateOf: i,
          similarity
        });
      }
    }
  }
  
  return duplicates;
}

// Smart grouping logic helpers
export function shouldGroupArtifacts(
  artifact1: { type: ArtifactType; language?: string; content: string },
  artifact2: { type: ArtifactType; language?: string; content: string }
): boolean {
  // Same language and type - consider grouping
  if (artifact1.type === artifact2.type && artifact1.language === artifact2.language) {
    // But not if content is very different in size (likely separate files)
    const sizeDiff = Math.abs(artifact1.content.length - artifact2.content.length);
    const averageSize = (artifact1.content.length + artifact2.content.length) / 2;
    return sizeDiff / averageSize < 0.5; // Less than 50% size difference
  }
  return false;
}

export function detectSeparationMarkers(content: string): number {
  const markers = MULTI_ARTIFACT_CONFIG.SEPARATION_MARKERS;
  return markers.reduce((count, marker) => {
    const regex = new RegExp(marker.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'gi');
    const matches = content.match(regex);
    return count + (matches ? matches.length : 0);
  }, 0);
}

export function generateArtifactTitle(
  baseTitle: string, 
  index: number, 
  total: number,
  language?: string
): string {
  if (total === 1) return baseTitle;
  
  if (language) {
    return `${language.charAt(0).toUpperCase()}${language.slice(1)} ${baseTitle} (${index + 1} of ${total})`;
  }
  
  return `${baseTitle} (${index + 1} of ${total})`;
}

/**
 * Phase 6: Validate artifact creation rules - Fixed to handle missing title
 */
export function validateArtifactCreationRules(
  artifacts: Array<{ content: string; type: ArtifactType; title?: string }>
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Rule 1: Maximum artifacts per message
  if (artifacts.length > MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE) {
    errors.push(`Too many artifacts: ${artifacts.length} exceeds maximum of ${MULTI_ARTIFACT_CONFIG.MAX_ARTIFACTS_PER_MESSAGE}`);
  }
  
  // Rule 2: Minimum content size
  const tooSmall = artifacts.filter(artifact => 
    artifact.content.length < MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE
  );
  if (tooSmall.length > 0) {
    errors.push(`${tooSmall.length} artifacts have content smaller than ${MULTI_ARTIFACT_CONFIG.MIN_CONTENT_SIZE} characters`);
  }
  
  // Rule 3: Duplicate detection - only check artifacts with titles
  const artifactsWithTitles = artifacts.filter(artifact => artifact.title) as Array<{ content: string; title: string; type: ArtifactType }>;
  if (artifactsWithTitles.length > 0) {
    const duplicates = detectDuplicateArtifacts(artifactsWithTitles);
    if (duplicates.length > 0) {
      warnings.push(`Found ${duplicates.length} potential duplicate artifacts`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
