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

export interface ArtifactDetectionResult {
  shouldCreateArtifact: boolean;
  type?: ArtifactType;
  title?: string;
  language?: string;
  content?: string;
  // New fields for subproject 3 - prose-only chat mode
  processedContent?: string; // Content with code blocks removed for chat display
  codeBlocksRemoved?: boolean; // Flag indicating if code blocks were removed
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
  compressionType?: 'none' | 'gzip';
  cacheKey?: string;
  
  // Legacy support
  [key: string]: any; // Allow additional properties for backward compatibility
}

// MISSING TYPES - Adding these for multi-host deployment (Subproject 3)

export interface CreateArtifactRequest {
  title: string;
  type: ArtifactType;
  content: string;
  language?: string;
  conversationId: string;
  messageId?: string;
  metadata?: Partial<ArtifactMetadata>;
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
  operation: 'create' | 'update' | 'delete' | 'get' | 'list';
  timestamp: Date;
  // Multi-host specific fields
  version?: number; // Add version field that was being used
  instanceId?: string;
  syncStatus?: ArtifactSyncStatus;
  conflictData?: ArtifactConflictResolution;
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
}
