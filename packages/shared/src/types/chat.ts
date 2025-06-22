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

export interface MessageMetadata {
  tokens?: number;
  generationTime?: number;
  model?: string;
  error?: string;
  visionModel?: string; // Vision model used for image processing
  // Artifact-related metadata
  artifactId?: string;
  artifactType?: 'text' | 'code' | 'html' | 'react' | 'svg' | 'mermaid' | 'json' | 'csv' | 'markdown';
  hasArtifact?: boolean;
  // Code block removal metadata
  originalContent?: string; // Original content before code block removal
  codeBlocksRemoved?: boolean; // Whether code blocks were removed for display
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
