export type ConnectionType = 'ollama' | 'mcp' | 'database';
export type ConnectionStatus = 'online' | 'offline' | 'connecting' | 'error';

export interface ScanResult {
  type: ConnectionType;
  name: string;
  endpoint: string;
  status: ConnectionStatus;
  metadata: Record<string, unknown>;
  lastChecked?: Date;
}

export interface Connection extends ScanResult {
  _id?: string;
  createdAt: Date;
  updatedAt: Date;
  isManual: boolean;
  authentication?: ConnectionAuth;
}

export interface ConnectionAuth {
  type: 'none' | 'basic' | 'token' | 'certificate';
  credentials?: Record<string, string>;
}

export interface ScanProgress {
  type: ConnectionType;
  current: number;
  total: number;
  message: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  details?: Record<string, unknown>;
  latency?: number;
}