// Import from artifacts.ts instead of redefining
import type { ArtifactReference } from './artifacts';

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

// NEW: Thinking models support
export interface ThinkingData {
  content: string; // Raw thinking content from <think> tags
  hasThinking: boolean; // Whether this message contains thinking
  processedAt: Date; // When thinking was extracted
}

export interface MessageMetadata {
  tokens?: number;
  generationTime?: number;
  model?: string;
  error?: string;
  visionModel?: string; // Vision model used for image processing
  
  // NEW: Thinking models support
  thinking?: ThinkingData; // Thinking/reasoning content
  originalContentWithThinking?: string; // Original content before thinking extraction
  
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

// NEW: Thinking processing utilities
export interface ThinkingProcessingResult {
  hasThinking: boolean;
  thinkingContent: string;
  processedContent: string; // Content with <think> tags removed
  thinkingData?: ThinkingData;
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

// NEW: Thinking utility functions
export function hasThinking(metadata?: MessageMetadata): boolean {
  return !!(metadata?.thinking?.hasThinking);
}

export function getThinkingContent(metadata?: MessageMetadata): string {
  return metadata?.thinking?.content || '';
}

export function parseThinkingFromContent(content: string): ThinkingProcessingResult {
  // Match <think>...</think> tags (case insensitive, multiline)
  const thinkingRegex = /<think>([\s\S]*?)<\/think>/gi;
  const matches = Array.from(content.matchAll(thinkingRegex));
  
  if (matches.length === 0) {
    return {
      hasThinking: false,
      thinkingContent: '',
      processedContent: content
    };
  }
  
  // Extract all thinking content
  const thinkingContent = matches
    .map(match => match[1].trim())
    .join('\n\n---\n\n'); // Separate multiple thinking blocks
  
  // Remove thinking tags from content
  const processedContent = content.replace(thinkingRegex, '').trim();
  
  const thinkingData: ThinkingData = {
    content: thinkingContent,
    hasThinking: true,
    processedAt: new Date()
  };
  
  return {
    hasThinking: true,
    thinkingContent,
    processedContent,
    thinkingData
  };
}

export function getDisplayContentForMessage(message: Message): string {
  // If thinking was processed, return the processed content (without <think> tags)
  if (message.metadata?.thinking?.hasThinking) {
    return message.content; // Content should already be processed at this point
  }
  
  // For backward compatibility, check for artifacts
  if (message.metadata?.originalContent) {
    return message.metadata.originalContent;
  }
  
  return message.content;
}
