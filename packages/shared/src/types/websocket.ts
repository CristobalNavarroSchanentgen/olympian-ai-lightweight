// Socket.IO connection error interface
export interface SocketIOError extends Error {
  type?: string;
  description?: string;
  context?: any;
  details?: any;
}

// Client -> Server Events
export interface ClientEvents {
  'chat:message': {
    messageId: string;  // Added to ensure client and server use the same ID
    content: string;
    images?: string[];
    model: string;
    visionModel?: string;
    conversationId?: string;
  };
  'chat:cancel': {
    messageId: string;
  };
  'model:select': {
    model: string;
  };
  'scan:start': {
    types?: ConnectionType[];
  };
  'connection:test': {
    connectionId: string;
  };
}

// Server -> Client Events
export interface ServerEvents {
  'chat:thinking': {
    messageId: string;
  };
  'chat:generating': {
    messageId: string;
    progress?: number;
  };
  'chat:token': {
    messageId: string;
    token: string;
  };
  'chat:complete': {
    messageId: string;
    conversationId: string;
    metadata: MessageMetadata;
  };
  'chat:error': {
    messageId: string;
    error: string;
  };
  'conversation:created': {
    conversationId: string;
  };
  'scan:progress': ScanProgress;
  'scan:result': ScanResult;
  'scan:complete': {
    results: ScanResult[];
  };
  'scan:error': {
    error: string;
  };
  'connection:status': {
    connectionId: string;
    status: ConnectionStatus;
  };
  'connection:test:result': {
    success: boolean;
    message: string;
  };
  'model:capabilities': ModelCapability;
  'memory:stats': {
    conversationId: string;
    stats: any;
  };
  'memory:cleared': {
    conversationId: string;
    message: string;
  };
  'memory:error': {
    error: string;
  };
}

import { ConnectionType, ConnectionStatus, ScanResult, ScanProgress } from './connections';
import { MessageMetadata, ModelCapability } from './chat';
