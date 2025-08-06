export interface MCPTool {
  id: string;
  name: string;
  description: string;
  inputSchema?: any;
  enabled: boolean;
}

export interface MCPServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  tools: MCPTool[];
  toolCount: number;
}

export interface HILRequest {
  id: string;
  requestId: string;
  tool: {
    serverId: string;
    name: string;
    description: string;
    arguments: any;
  };
  timeout: number;
  timestamp: number;
}

export interface ToolExecution {
  id: string;
  toolName: string;
  namespace: string;
  status: 'pending' | 'executing' | 'success' | 'error' | 'rejected';
  result?: any;
  error?: string;
  timestamp: Date;
  duration?: number;
}

export interface MCPConfig {
  hilEnabled: boolean;
  hilTimeout: number;
  autoApprove: boolean;
  enabledTools: string[];
}
