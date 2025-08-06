import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { MCPServer, HILRequest, ToolExecution, MCPConfig } from '@/types/mcp';

interface MCPContextType {
  servers: MCPServer[];
  hilRequest: HILRequest | null;
  executions: ToolExecution[];
  config: MCPConfig;
  isConnected: boolean;
  approveHIL: (requestId: string) => void;
  rejectHIL: (requestId: string) => void;
  enableTool: (toolId: string) => void;
  disableTool: (toolId: string) => void;
  toggleServer: (serverId: string, enabled: boolean) => void;
  updateConfig: (config: Partial<MCPConfig>) => void;
}

const MCPContext = createContext<MCPContextType | undefined>(undefined);

export function MCPProvider({ children }: { children: React.ReactNode }) {
  const { socket, isConnected } = useWebSocket();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [hilRequest, setHilRequest] = useState<HILRequest | null>(null);
  const [executions, setExecutions] = useState<ToolExecution[]>([]);
  const [config, setConfig] = useState<MCPConfig>({
    hilEnabled: true,
    hilTimeout: 30,
    autoApprove: false,
    enabledTools: []
  });

  useEffect(() => {
    if (!socket) return;

    // MCP server status
    const handleMCPStatus = (data: { servers: MCPServer[] }) => {
      setServers(data.servers);
      // Emit custom event for status indicator
      window.dispatchEvent(new CustomEvent('mcp:status', { detail: data }));
    };

    // HIL requests
    const handleHILRequest = (data: HILRequest) => {
      setHilRequest(data);
    };

    const handleHILResponse = (data: { requestId: string; approved: boolean }) => {
      if (hilRequest?.requestId === data.requestId) {
        setHilRequest(null);
      }
    };

    // Tool execution events
    const handleToolExecuting = (data: any) => {
      const execution: ToolExecution = {
        id: data.id,
        toolName: data.toolName,
        namespace: data.namespace,
        status: 'executing',
        timestamp: new Date()
      };
      setExecutions(prev => [execution, ...prev].slice(0, 20));
      window.dispatchEvent(new CustomEvent('tool:executing', { detail: data }));
    };

    const handleToolResult = (data: any) => {
      setExecutions(prev => prev.map(e => 
        e.id === data.id ? { ...e, status: 'success', result: data.result } : e
      ));
      window.dispatchEvent(new CustomEvent('tool:result', { detail: data }));
    };

    const handleToolError = (data: any) => {
      setExecutions(prev => prev.map(e => 
        e.id === data.id ? { ...e, status: 'error', error: data.error } : e
      ));
      window.dispatchEvent(new CustomEvent('tool:error', { detail: data }));
    };

    // Tools list
    const handleToolsList = (data: { servers: MCPServer[] }) => {
      setServers(data.servers);
      window.dispatchEvent(new CustomEvent('tools:list', { detail: data }));
    };

    // Register all listeners
    socket.on('mcp:status', handleMCPStatus);
    socket.on('hil:request', handleHILRequest);
    socket.on('hil:response', handleHILResponse);
    socket.on('tool:executing', handleToolExecuting);
    socket.on('tool:result', handleToolResult);
    socket.on('tool:error', handleToolError);
    socket.on('tools:list', handleToolsList);

    // Request initial status
    socket.emit('mcp:get_status');
    socket.emit('tools:request-list');

    return () => {
      socket.off('mcp:status', handleMCPStatus);
      socket.off('hil:request', handleHILRequest);
      socket.off('hil:response', handleHILResponse);
      socket.off('tool:executing', handleToolExecuting);
      socket.off('tool:result', handleToolResult);
      socket.off('tool:error', handleToolError);
      socket.off('tools:list', handleToolsList);
    };
  }, [socket, hilRequest]);

  const approveHIL = (requestId: string) => {
    if (socket) {
      socket.emit('hil:approve', { requestId });
    }
  };

  const rejectHIL = (requestId: string) => {
    if (socket) {
      socket.emit('hil:reject', { requestId });
    }
  };

  const enableTool = (toolId: string) => {
    if (socket) {
      socket.emit('tools:enable', { toolId });
    }
  };

  const disableTool = (toolId: string) => {
    if (socket) {
      socket.emit('tools:disable', { toolId });
    }
  };

  const toggleServer = (serverId: string, enabled: boolean) => {
    if (socket) {
      socket.emit('tools:server:toggle', { serverId, enabled });
    }
  };

  const updateConfig = (newConfig: Partial<MCPConfig>) => {
    setConfig(prev => ({ ...prev, ...newConfig }));
    localStorage.setItem('mcp-config', JSON.stringify({ ...config, ...newConfig }));
  };

  return (
    <MCPContext.Provider value={{
      servers,
      hilRequest,
      executions,
      config,
      isConnected,
      approveHIL,
      rejectHIL,
      enableTool,
      disableTool,
      toggleServer,
      updateConfig
    }}>
      {children}
    </MCPContext.Provider>
  );
}

export function useMCP() {
  const context = useContext(MCPContext);
  if (!context) {
    throw new Error('useMCP must be used within MCPProvider');
  }
  return context;
}
