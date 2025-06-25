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

// =====================================
// NEW: Server-Side Artifact Document Schema
// =====================================

/**
 * MongoDB document interface for artifacts collection
 * Optimized for multi-host deployments with enhanced persistence
 */
export interface ArtifactDocument {
  _id?: string; // MongoDB ObjectId
  id: string; // Client-compatible UUID
  conversationId: string;
  messageId?: string;
  title: string;
  type: ArtifactType;
  content: string;
  language?: string;
  version: number;
  metadata: ArtifactPersistenceMetadata;
  createdAt: Date;
  updatedAt: Date;
  
  // Multi-host coordination fields
  serverInstance?: string; // Server instance that created/last modified
  checksum: string; // Content integrity verification
  lastAccessedAt?: Date; // For cache management
}

/**
 * Enhanced metadata for server-side artifact persistence
 */
export interface ArtifactPersistenceMetadata {
  // Original detection metadata
  detectionStrategy: string; // How the artifact was detected (regex, ast, etc.)
  originalContent: string; // Full original content with code blocks
  processedContent?: string; // Content with code blocks removed
  codeBlocksRemoved: boolean;
  
  // Reconstruction data
  reconstructionHash: string; // Hash of content used for recreation
  fallbackData?: Record<string, any>; // Additional data for reconstruction
  
  // Multi-host specific
  syncStatus: 'synced' | 'pending' | 'conflict' | 'error';
  lastSyncedAt?: Date;
  conflictResolution?: 'server_wins' | 'client_wins' | 'manual';
  
  // Performance optimization
  contentSize: number; // Content size in bytes
  compressionType?: 'none' | 'gzip' | 'lz4';
  cacheKey?: string; // For distributed caching
}

/**
 * Request interface for creating artifacts with atomic message linking
 */
export interface CreateArtifactRequest {
  conversationId: string;
  messageId?: string;
  title: string;
  type: ArtifactType;
  content: string;
  language?: string;
  metadata: Partial<ArtifactPersistenceMetadata>;
}

/**
 * Request interface for updating artifacts with versioning
 */
export interface UpdateArtifactRequest {
  artifactId: string;
  content?: string;
  title?: string;
  metadata?: Partial<ArtifactPersistenceMetadata>;
  description?: string; // Version description
}

/**
 * Response interface for artifact operations
 */
export interface ArtifactOperationResponse {
  success: boolean;
  artifact?: ArtifactDocument;
  error?: string;
  version?: number;
  syncStatus?: 'synced' | 'pending' | 'conflict';
}

/**
 * Bulk artifact operations for conversation loading
 */
export interface BulkArtifactRequest {
  conversationId: string;
  operations: Array<{
    type: 'create' | 'update' | 'delete';
    artifact?: CreateArtifactRequest | UpdateArtifactRequest;
    artifactId?: string;
  }>;
}

/**
 * Artifact synchronization data for multi-host coordination
 */
export interface ArtifactSyncData {
  artifactId: string;
  version: number;
  checksum: string;
  lastModified: Date;
  serverInstance: string;
  syncStatus: 'synced' | 'pending' | 'conflict';
  conflictData?: {
    localVersion: number;
    remoteVersion: number;
    localChecksum: string;
    remoteChecksum: string;
  };
}

/**
 * Artifact conflict resolution strategy
 */
export interface ArtifactConflictResolution {
  artifactId: string;
  strategy: 'server_wins' | 'client_wins' | 'manual_merge';
  resolvedContent?: string;
  resolvedMetadata?: Partial<ArtifactPersistenceMetadata>;
  resolvedBy: string; // User or system identifier
  resolvedAt: Date;
}

/**
 * Artifact cache entry for distributed caching
 */
export interface ArtifactCacheEntry {
  artifactId: string;
  content: string;
  metadata: ArtifactPersistenceMetadata;
  cachedAt: Date;
  expiresAt: Date;
  serverInstance: string;
  accessCount: number;
}

/**
 * Artifact health check data for monitoring
 */
export interface ArtifactHealthCheck {
  conversationId: string;
  totalArtifacts: number;
  syncedArtifacts: number;
  conflictedArtifacts: number;
  erroredArtifacts: number;
  lastSyncAt?: Date;
  issues: Array<{
    artifactId: string;
    issue: string;
    severity: 'low' | 'medium' | 'high';
    details?: string;
  }>;
}

/**
 * Migration data for existing artifacts
 */
export interface ArtifactMigrationData {
  conversationId: string;
  migratedCount: number;
  failedCount: number;
  errors: Array<{
    messageId?: string;
    error: string;
    details?: string;
  }>;
  duration: number; // Migration time in milliseconds
  strategy: 'message_metadata' | 'content_detection' | 'manual';
}
