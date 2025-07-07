// MCP Hook - Unified API for all MCP functionality
export { useMCP } from './hooks/useMCP';

// MCP Components
export { MCPToolsDisplay } from './components/MCPToolsDisplay';
export { MCPConfigPanel } from './components/MCPConfigPanel';

// Re-export types from shared
export type { MCPServer, MCPTool, MCPInvokeRequest, MCPInvokeResponse } from '@olympian/shared';