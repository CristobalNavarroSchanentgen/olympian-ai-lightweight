import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

interface Tool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

interface MCPServer {
  id: string;
  name: string;
  status: string;
  tools: Tool[];
}

export function useTools() {
  const { socket } = useWebSocket();
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!socket) return;

    const handleToolsList = (data: { servers: MCPServer[] }) => {
      setServers(data.servers);
      setLoading(false);
      
      // Persist to localStorage
      const enabledTools = data.servers.flatMap(s => 
        s.tools.filter(t => t.enabled).map(t => s.id + '.' + t.id)
      );
      localStorage.setItem('mcp-tools-enabled', JSON.stringify(enabledTools));
    };

    socket.on('tools:list', handleToolsList);
    socket.emit('tools:request-list');

    return () => {
      socket.off('tools:list', handleToolsList);
    };
  }, [socket]);

  const enableTool = useCallback((toolId: string) => {
    if (!socket) return;
    socket.emit('tools:enable', { toolId });
  }, [socket]);

  const disableTool = useCallback((toolId: string) => {
    if (!socket) return;
    socket.emit('tools:disable', { toolId });
  }, [socket]);

  const toggleServer = useCallback((serverId: string, enabled: boolean) => {
    if (!socket) return;
    socket.emit('tools:server:toggle', { serverId, enabled });
  }, [socket]);

  return {
    servers,
    loading,
    enableTool,
    disableTool,
    toggleServer
  };
}
