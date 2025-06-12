// Client -> Server Events
export interface ClientEvents {
  'chat:message': {
    content: string;
    images?: string[];
    model: string;
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
    metadata: MessageMetadata;
  };
  'chat:error': {
    messageId: string;
    error: string;
  };
  'scan:progress': ScanProgress;
  'scan:result': ScanResult;
  'scan:complete': {
    results: ScanResult[];
  };
  'connection:status': {
    connectionId: string;
    status: ConnectionStatus;
  };
}

import { ConnectionType, ConnectionStatus, ScanResult, ScanProgress } from './connections';
import { MessageMetadata } from './chat';