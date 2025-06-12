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
}

export interface ChatRequest {
  conversationId?: string;
  content: string;
  images?: string[];
  model: string;
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
  maxTokens: number;
  contextWindow: number;
  description?: string;
}