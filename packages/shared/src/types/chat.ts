export interface Conversation {
  _id?: string;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface Message {
  _id?: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // Array of base64 images
  metadata?: MessageMetadata;
  createdAt: Date;
}

// Multi-artifact configuration
export const MAX_ARTIFACTS_PER_MESSAGE = 10;
export const MIN_ARTIFACT_CONTENT_SIZE = 20;

// Multi-artifact metadata structure
export interface ArtifactReference {
  artifactId: string;
  artifactType: 'text' | 'code' | 'html' | 'react' | 'svg' | 'mermaid' | 'json' | 'csv' | 'markdown';
  title?: string;
  language?: string;
  order: number; // Sequence order for display
}

export interface MessageMetadata {
  tokens?: number;
  generationTime?: number;
  model?: string;
  error?: string;
  visionModel?: string; // Vision model used for image processing
  
  // NEW: Multi-artifact support (Phase 1)
  artifacts?: ArtifactReference[]; // Array of artifacts for multi-artifact support
  
  // LEGACY: Single artifact metadata (deprecated but kept for backward compatibility)
  artifactId?: string;
  artifactType?: 'text' | 'code' | 'html' | 'react' | 'svg' | 'mermaid' | 'json' | 'csv' | 'markdown';
  hasArtifact?: boolean;
  
  // Code block removal metadata
  originalContent?: string; // Original content before code block removal
  codeBlocksRemoved?: boolean; // Whether code blocks were removed for display
  
  // Multi-artifact processing metadata
  artifactCount?: number; // Total number of artifacts created from this message
  artifactCreationStrategy?: string; // Strategy used for artifact grouping/creation
  multipleCodeBlocks?: boolean; // Whether message contained multiple code blocks
  
  // Artifact recreation metadata for subproject 3
  recreationSuccess?: boolean; // Whether artifact recreation was successful
  recreationFailed?: boolean; // Whether artifact recreation failed
  recreationAttempts?: number; // Number of recreation attempts
  fallbackUsed?: boolean; // Whether fallback strategy was used
  
  // Typewriter effect metadata
  typewriterCompleted?: boolean; // Whether typewriter effect has completed for this message
}

export interface ChatRequest {
  conversationId?: string;
  content: string;
  images?: string[];
  model: string;
  visionModel?: string; // Optional vision model for hybrid processing
}

export interface ProcessedRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    images?: string[];
  }>;
  stream?: boolean;
  options?: Record<string, unknown>;
}

export interface ModelCapability {
  name: string;
  vision: boolean;
  tools: boolean;
  reasoning: boolean; // Added reasoning capability
  maxTokens: number;
  contextWindow: number;
  description?: string;
}

export interface VisionError {
  error: 'VISION_UNSUPPORTED';
  message: string;
  available_vision_models: string[];
}

// Multi-artifact detection and creation utilities
export interface MultiArtifactDetectionResult {
  shouldCreateArtifacts: boolean;
  artifacts: Array<{
    type: 'text' | 'code' | 'html' | 'react' | 'svg' | 'mermaid' | 'json' | 'csv' | 'markdown';
    title: string;
    language?: string;
    content: string;
    startIndex: number;
    endIndex: number;
  }>;
  processedContent: string; // Content with artifacts removed
  artifactCount: number;
  detectionStrategy: string;
}

// Helper functions for backward compatibility
export function hasMultipleArtifacts(metadata?: MessageMetadata): boolean {
  return !!(metadata?.artifacts && metadata.artifacts.length > 1);
}

export function getArtifactCount(metadata?: MessageMetadata): number {
  if (metadata?.artifacts) {
    return metadata.artifacts.length;
  }
  return metadata?.hasArtifact ? 1 : 0;
}

export function getFirstArtifact(metadata?: MessageMetadata): ArtifactReference | undefined {
  if (metadata?.artifacts && metadata.artifacts.length > 0) {
    return metadata.artifacts[0];
  }
  // Fallback to legacy format
  if (metadata?.artifactId && metadata?.artifactType) {
    return {
      artifactId: metadata.artifactId,
      artifactType: metadata.artifactType,
      order: 0
    };
  }
  return undefined;
}

export function isLegacyArtifactFormat(metadata?: MessageMetadata): boolean {
  return !!(metadata?.artifactId && !metadata?.artifacts);
}
