// Import types for type safety and consistency
import { ConnectionType, ConnectionStatus, ScanResult, ScanProgress } from './connections';
import { MessageMetadata, ModelCapability, ToolCall, ToolResult } from './chat';

// Client -> Server Events
export interface ClientEvents {
  'chat:message': {
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
  // NEW: MCP tool-related client events for subproject 3
  'mcp:refresh': {
    serverId?: string; // Refresh specific server or all if undefined
  };
  'mcp:server:toggle': {
    serverId: string;
    enabled: boolean;
  };
  'tool:execute': {
    serverId: string;
    toolName: string;
    arguments: Record<string, any>;
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
  // NEW: MCP tool-related server events for subproject 3
  'mcp:update': {
    type: 'server_connected' | 'server_disconnected' | 'server_error' | 'server_removed' | 'tools_updated';
    serverId: string;
    data?: any;
    timestamp: Date;
  };
  'mcp:tools:list': {
    tools: any[]; // Array of available MCP tools
    totalCount: number;
    serverCount: number;
    lastUpdated: Date;
  };
  'mcp:server:status': {
    serverId: string;
    status: 'running' | 'stopped' | 'error' | 'initializing';
    error?: string;
    toolCount?: number;
    lastHealthCheck?: Date;
  };
  'tool:execution:start': {
    toolCall: ToolCall;
    messageId?: string;
    timestamp: Date;
  };
  'tool:execution:progress': {
    toolCallId: string;
    status: 'executing' | 'processing' | 'finalizing';
    progress?: number; // 0-100
    message?: string;
    timestamp: Date;
  };
  'tool:execution:complete': {
    toolCall: ToolCall;
    result: ToolResult;
    messageId?: string;
    timestamp: Date;
  };
  'tool:execution:error': {
    toolCall: ToolCall;
    error: string;
    messageId?: string;
    timestamp: Date;
  };
  'tool:availability:changed': {
    available: boolean;
    toolCount: number;
    serverCount: number;
    enabledServers: string[];
    timestamp: Date;
  };
}

// NEW: Enhanced streaming events for MCP tool integration
export interface StreamingEvent {
  type: 'connected' | 'conversation' | 'thinking' | 'streaming_start' | 'token' | 
        'streaming_end' | 'complete' | 'error' | 'artifact_created' | 'thinking_detected' |
        // NEW: Tool-related streaming events
        'tools_detected' | 'tool_call_start' | 'tool_call_progress' | 'tool_call_complete' | 
        'tool_call_error' | 'tools_selection' | 'available_tools_updated';
  
  // Existing fields
  conversation?: any;
  conversationId?: string;
  isThinking?: boolean;
  token?: string;
  message?: string;
  metadata?: any;
  artifactId?: string;
  artifactType?: string;
  title?: string;
  order?: number;
  error?: string;
  thinking?: any;
  
  // NEW: Tool-related streaming fields
  availableTools?: any[]; // Tools available for this model/conversation
  selectedTools?: any[]; // Tools selected for injection into request
  toolCall?: ToolCall; // Tool being called
  toolResult?: ToolResult; // Result from tool execution
  toolCallId?: string; // ID of tool call for progress tracking
  toolStatus?: 'detecting' | 'selecting' | 'calling' | 'processing' | 'completed' | 'failed';
  toolProgress?: number; // 0-100 for tool execution progress
  toolMessage?: string; // Status message for tool execution
  mcpServerId?: string; // MCP server ID for the tool
  toolName?: string; // Name of the tool being called
  toolCount?: number; // Number of tools available or selected
}

// NEW: Tool execution status for UI display
export interface ToolExecutionStatus {
  toolCallId: string;
  serverId: string;
  toolName: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  startTime: Date;
  endTime?: Date;
  duration?: number;
  progress?: number; // 0-100
  message?: string;
  result?: any;
  error?: string;
}

// NEW: MCP integration status for system monitoring
export interface MCPIntegrationStatus {
  enabled: boolean;
  totalServers: number;
  runningServers: number;
  errorServers: number;
  totalTools: number;
  lastHealthCheck: Date;
  lastToolUsage?: Date;
  recentErrors: string[];
}
