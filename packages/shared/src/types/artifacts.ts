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
  // Enhanced fields for Subproject 3 - robust recreation
  checksum?: string; // Content integrity verification
  verified?: boolean; // Whether artifact has been verified
  confidence?: number; // Confidence score for recreated artifacts (0-1)
  recreationStrategy?: string; // Strategy used for recreation
  repairHistory?: ArtifactRepairEntry[]; // History of repairs/modifications
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
  // Enhanced fields for Subproject 3 - prose-only chat mode
  processedContent?: string; // Content with code blocks removed for chat display
  codeBlocksRemoved?: boolean; // Flag indicating if code blocks were removed
  // Robust recreation fields
  confidence?: number; // Detection confidence (0-1)
  strategy?: string; // Detection strategy used
  fingerprint?: ContentFingerprint; // Content fingerprint for verification
  fallbacks?: ArtifactDetectionResult[]; // Alternative detection results
  verified?: boolean; // Whether detection was verified
}

export interface ArtifactVersion {
  version: number;
  content: string;
  createdAt: Date;
  description?: string;
  // Enhanced versioning for Subproject 3
  checksum?: string; // Content hash for integrity
  strategy?: string; // How this version was created/restored
  confidence?: number; // Confidence in this version (0-1)
}

export interface ArtifactUpdateRequest {
  artifactId: string;
  content: string;
  description?: string;
  // Enhanced update tracking
  strategy?: string; // Update strategy (manual, repair, recreation)
  preserveHistory?: boolean; // Whether to preserve version history
}

// Enhanced message metadata to include artifact information for Subproject 3
export interface ArtifactMessageMetadata {
  artifactId?: string;
  artifactType?: ArtifactType;
  hasArtifact?: boolean;
  // Enhanced fields for Subproject 3
  originalContent?: string; // Original content before code block removal
  codeBlocksRemoved?: boolean; // Whether code blocks were removed for prose-only display
  // Robust recreation metadata
  recreationSuccess?: boolean; // Whether artifact recreation succeeded
  recreationAttempts?: number; // Number of recreation attempts
  recreationStrategy?: string; // Primary strategy used for recreation
  fallbackUsed?: boolean; // Whether fallback strategies were used
  recreationFailed?: boolean; // Whether all recreation attempts failed
  confidence?: number; // Confidence in the recreated artifact (0-1)
  verificationScore?: number; // Artifact verification score (0-1)
  integrityIssues?: string[]; // List of integrity issues found
  repairHistory?: ArtifactRepairEntry[]; // History of repairs applied
}

// New interfaces for Subproject 3 robust recreation logic

export interface ContentFingerprint {
  checksum: string; // Content hash for integrity verification
  length: number; // Content length
  patterns: string[]; // Detected content patterns
  language?: string; // Detected primary language
  encoding: string; // Content encoding (utf-8, ascii, etc.)
  timestamp: Date; // When fingerprint was generated
  version: string; // Fingerprinting algorithm version
}

export interface ArtifactRepairEntry {
  timestamp: Date;
  strategy: string; // Repair strategy used
  reason: string; // Why repair was needed
  success: boolean; // Whether repair succeeded
  confidence: number; // Confidence in repair (0-1)
  contentChanges?: {
    before: string; // Content hash before repair
    after: string; // Content hash after repair
    sizeDelta: number; // Size change
  };
  metadata?: Record<string, any>; // Additional repair metadata
}

export interface RecreationAttempt {
  strategy: string; // Strategy name
  success: boolean; // Whether attempt succeeded
  confidence: number; // Confidence in result (0-1)
  artifactId?: string; // Created artifact ID if successful
  error?: string; // Error message if failed
  timestamp: Date; // When attempt was made
  duration: number; // Time taken in milliseconds
  metadata?: Record<string, any>; // Strategy-specific metadata
}

export interface RecreationReport {
  messageId: string; // Message being processed
  conversationId: string; // Conversation context
  attempts: RecreationAttempt[]; // All recreation attempts
  finalResult: 'success' | 'partial' | 'failed'; // Overall result
  artifactCreated: boolean; // Whether artifact was created
  fallbackUsed: boolean; // Whether fallback strategies were used
  totalDuration: number; // Total time spent on recreation
  confidence: number; // Final confidence score (0-1)
  integrityScore?: number; // Artifact integrity score if created
  metadata?: Record<string, any>; // Additional report metadata
}

export interface ArtifactIntegrityResult {
  valid: boolean; // Whether artifact passed integrity checks
  score: number; // Integrity score (0-1)
  reason?: string; // Reason for failure if invalid
  issues: string[]; // List of specific issues found
  timestamp: Date; // When verification was performed
  checks: {
    structure: boolean; // Basic structure validation
    content: boolean; // Content validation
    metadata: boolean; // Metadata consistency
    type: boolean; // Type-specific validation
    size: boolean; // Size constraints
  };
}

export interface EnhancedDetectionResult extends ArtifactDetectionResult {
  confidence: number; // Detection confidence (0-1)
  strategy: string; // Detection strategy used
  fingerprint: ContentFingerprint; // Content fingerprint
  fallbacks: ArtifactDetectionResult[]; // Alternative results
  verified: boolean; // Whether result was verified
  verificationResult?: ArtifactIntegrityResult; // Verification details
  timing: {
    detection: number; // Time spent on detection (ms)
    verification: number; // Time spent on verification (ms)
    total: number; // Total processing time (ms)
  };
}

// Enhanced detection strategies configuration
export interface DetectionStrategy {
  name: string; // Strategy identifier
  detect: (content: string, context?: DetectionContext) => ArtifactDetectionResult | null;
  confidence: number; // Base confidence level (0-1)
  priority: number; // Execution priority (higher = first)
  enabled: boolean; // Whether strategy is active
  timeout: number; // Maximum execution time (ms)
  metadata?: Record<string, any>; // Strategy-specific configuration
}

export interface DetectionContext {
  conversationId?: string; // Conversation context
  messageId?: string; // Message context
  previousArtifacts?: Artifact[]; // Previous artifacts in conversation
  userPreferences?: UserDetectionPreferences; // User-specific preferences
  environmentInfo?: {
    clientType: string; // Client environment (browser, mobile, etc.)
    capabilities: string[]; // Supported features
    performance: 'low' | 'medium' | 'high'; // Performance tier
  };
}

export interface UserDetectionPreferences {
  preferredLanguages: string[]; // Preferred programming languages
  artifactTypes: ArtifactType[]; // Preferred artifact types
  confidenceThreshold: number; // Minimum confidence for creation (0-1)
  enableFallbacks: boolean; // Whether to use fallback strategies
  enableRepair: boolean; // Whether to attempt artifact repair
  verboseLogging: boolean; // Whether to enable detailed logging
}

// Multi-host synchronization interfaces
export interface ArtifactSyncStatus {
  artifactId: string;
  conversationId: string;
  lastSynced: Date;
  syncVersion: number;
  conflicts: ArtifactSyncConflict[];
  status: 'synced' | 'pending' | 'conflict' | 'error';
}

export interface ArtifactSyncConflict {
  type: 'content' | 'metadata' | 'version' | 'structure';
  serverVersion: any; // Server version of conflicting data
  clientVersion: any; // Client version of conflicting data
  timestamp: Date;
  resolution?: 'server' | 'client' | 'merge' | 'manual';
}

// Enhanced artifact statistics for monitoring
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
  lastUpdated: Date;
}

// Configuration for robust recreation system
export interface RobustRecreationConfig {
  maxAttempts: number; // Maximum recreation attempts per message
  timeoutPerAttempt: number; // Timeout per attempt (ms)
  confidenceThreshold: number; // Minimum confidence for success (0-1)
  enableFallbacks: boolean; // Whether to use fallback strategies
  enableRepair: boolean; // Whether to attempt artifact repair
  enableVerification: boolean; // Whether to verify created artifacts
  strategiesConfig: {
    [strategyName: string]: {
      enabled: boolean;
      priority: number;
      timeout: number;
      config?: Record<string, any>;
    };
  };
  loggingLevel: 'minimal' | 'standard' | 'verbose' | 'debug';
  performanceMode: 'accuracy' | 'balanced' | 'speed';
}
