export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'http';
  endpoint?: string;
  status: 'running' | 'stopped' | 'error';
  lastError?: string;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  overrides?: ToolOverride;
}

export interface ToolOverride {
  description?: string;
  parameterDescriptions?: Record<string, string>;
  examples?: string[];
}

export interface MCPConfig {
  servers: MCPServer[];
  version: string;
  lastModified: Date;
}

export interface MCPInvokeRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface MCPInvokeResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}