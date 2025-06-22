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
