// Enhanced MCP Types following latest SDK patterns

export interface MCPServer {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'http' | 'streamable_http' | 'sse';
  endpoint?: string;
  status: 'running' | 'stopped' | 'error' | 'initializing' | 'health_check';
  lastError?: string;
  
  healthStatus?: 'healthy' | 'unhealthy' | 'unknown';
  consecutiveFailures?: number;
  
  // Connection properties
  protocolVersion?: string;
  capabilities?: MCPServerCapabilities;
  lastConnected?: Date;
  
  // Configuration
  healthCheckInterval?: number; // in milliseconds, default 300000 (5 mins)
  maxRetries?: number; // default 3
  timeout?: number; // default 30000ms
  priority?: number; // for fallback ordering, default 0
  optional?: boolean; // whether the server is optional (won't fail if can't connect)
  autoReconnect?: boolean; // whether to auto-reconnect on disconnect
}

export interface MCPServerCapabilities {
  tools?: boolean | {};
  prompts?: boolean | {};
  resources?: boolean | {};
  completion?: boolean | {};
  roots?: boolean | {};
  sampling?: boolean | {};
}

export interface MCPTool {
  serverId: string;
  name: string;
  description: string;
  inputSchema: any;
}

export interface MCPServerStatus {
  id: string;
  name: string;
  status: "running" | "stopped" | "error";
  tools: number;
  error?: string;
}
export interface ToolOverride {
  description?: string;
  parameterDescriptions?: Record<string, string>;
  examples?: string[];
}

export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
  }>;
  serverId: string;
}

export interface MCPResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
  serverId: string;
}

export interface MCPConfig {
  servers: MCPServer[];
  version: string;
  lastModified: Date;
  
  // Global settings
  globalTimeout?: number;
  maxConcurrentConnections?: number;
  enableCaching?: boolean;
  cacheExpiration?: number; // in milliseconds
}

// Enhanced request/response interfaces
export interface MCPInvokeRequest {
  serverId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  
  // Metadata field support (following MCP best practices)
  metadata?: Record<string, unknown>;
  
  // Fallback configuration
  fallbackStrategy?: 'none' | 'any' | 'priority';
  preferredServerIds?: string[];
}

export interface MCPInvokeResponse {
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  
  // Enhanced response data
  serverId: string;
  toolName: string;
  cachedResult?: boolean;
  retryAttempt?: number;
}

// Content types for MCP responses
export interface MCPTextContent {
  type: 'text';
  text: string;
}

export interface MCPImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export interface MCPResourceContent {
  type: 'resource';
  uri: string;
  text?: string;
  mimeType?: string;
}

export interface MCPResourceLinkContent {
  type: 'resource_link';
  uri: string;
  name?: string;
  mimeType?: string;
  description?: string;
}

export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent | MCPResourceLinkContent;



// Tool caching interfaces
export interface MCPToolCache {
  serverId: string;
  tools: MCPTool[];
  lastUpdated: Date;
  expiry: Date;
  version: string;
}

export interface MCPToolCacheStatus {
  totalTools: number;
  cachedTools: number;
  expiredCaches: number;
  totalServers: number;
  lastCacheUpdate: Date;
  hitRate?: number;
  missRate?: number;
}

// Configuration parsing interfaces - Updated to support stdio-specific properties
export interface MCPConfigEndpoint {
  url: string;
  type: 'server' | 'discovery_channel' | 'registry';
  authentication?: {
    type: 'bearer' | 'api_key' | 'oauth';
    token?: string;
    apiKey?: string;
    oauthConfig?: Record<string, unknown>;
  };
  headers?: Record<string, string>;
  timeout?: number;
  retries?: number;
  
  // Stdio-specific properties for subproject 3 (child process execution)
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  optional?: boolean; // whether the server is optional
}

export interface MCPDiscoveryConfig {
  mcpServers: Record<string, MCPConfigEndpoint>;
  wellKnownPaths?: string[];
  registryUrls?: string[];
  cacheTtl?: number;
}

// Protocol negotiation
export interface MCPProtocolNegotiation {
  clientVersion: string;
  serverVersion?: string;
  supportedTransports: string[];
  agreedTransport?: string;
  capabilities: MCPServerCapabilities;
  protocolFeatures?: string[];
}

// Session management
export interface MCPSession {
  sessionId: string;
  serverId: string;
  transport: string;
  startTime: Date;
  lastActivity: Date;
  status: 'initializing' | 'active' | 'idle' | 'terminated';
  requestCount: number;
  errorCount: number;
}

// Tool selection and routing
export interface MCPToolSelectionRequest {
  query: string;
  availableTools: MCPTool[];
  context?: Record<string, unknown>;
  preferredServerId?: string;
}

export interface MCPToolSelectionResponse {
  selectedTool: MCPTool;
  confidence: number; // 0-1
  reasoning?: string;
  alternativeTools?: MCPTool[];
}

// Argument parsing and validation
export interface MCPArgumentValidation {
  isValid: boolean;
  errors?: string[];
  warnings?: string[];
  sanitizedArguments?: Record<string, unknown>;
}

// Fallback and recovery
export interface MCPFallbackStrategy {
  primaryServerId: string;
  fallbackServerIds: string[];
  strategy: 'round_robin' | 'priority' | 'health_based' | 'load_based';
  maxRetries: number;
  retryDelay: number; // in milliseconds
}

export interface MCPRecoveryEvent {
  type: 'server_failed' | 'server_recovered' | 'fallback_activated' | 'cache_miss';
  serverId: string;
  timestamp: Date;
  details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// Monitoring and metrics
export interface MCPMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  cacheHitRate: number;
  uptime: number; // in milliseconds
  activeConnections: number;
  
  // Per-server metrics
  serverMetrics: Record<string, {
    requests: number;
    failures: number;
    averageResponseTime: number;
    lastResponseTime?: number;
    uptime: number;
  }>;
  
  // Time-based metrics
  requestsPerMinute: number;
  errorsPerMinute: number;
  
  lastUpdated: Date;
}

// Error types
export type MCPErrorType = 
  | 'CONNECTION_FAILED'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'TOOL_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'CACHE_ERROR';

export interface MCPError extends Record<string, unknown> {
  type: MCPErrorType;
  message: string;
  serverId?: string;
  toolName?: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  recoverable: boolean;
}

// Event types for MCP client
export type MCPEventType = 
  | 'server_connected'
  | 'server_disconnected'
  | 'tool_discovered'
  | 'tool_invoked'
  | 'health_check_completed'
  | 'cache_updated'
  | 'fallback_triggered'
  | 'error_occurred';

export interface MCPEvent {
  type: MCPEventType;
  serverId?: string;
  data: Record<string, unknown>;
  timestamp: Date;
}

export type MCPEventHandler = (event: MCPEvent) => void | Promise<void>;

// Completion types
export interface MCPCompletionRequest {
  ref: {
    type: 'ref/prompt' | 'ref/resource';
    name?: string;
    uri?: string;
  };
  argument: {
    name: string;
    value: string;
  };
  context?: {
    arguments?: Record<string, any>;
  };
}

export interface MCPCompletionResponse {
  completion: {
    values: string[];
    total?: number;
    hasMore?: boolean;
  };
}
