import { useState, useEffect, useCallback, useRef } from 'react';
import { MCPServer, MCPTool } from '@olympian/shared';
import { api } from '../services/api';
import { useToast } from './useToast';

interface MCPState {
  servers: MCPServer[];
  tools: Map<string, MCPTool[]>;
  loading: boolean;
  error: string | null;
}

export function useMCP() {
  const [state, setState] = useState<MCPState>({
    servers: [],
    tools: new Map(),
    loading: false,
    error: null
  });

  const { toast } = useToast();
  const pollIntervalRef = useRef<NodeJS.Timeout>();

  // Fetch servers and their tools
  const fetchServers = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true, error: null }));
      const servers = await api.getMCPServers();
      
      // Fetch tools for each active server
      const toolsMap = new Map<string, MCPTool[]>();
      await Promise.all(
        servers
          .filter(s => s.status === 'running')
          .map(async (server) => {
            try {
              const tools = await api.getMCPTools(server.id);
              toolsMap.set(server.id, tools);
            } catch (err) {
              console.error(`Failed to fetch tools for ${server.name}:`, err);
              toolsMap.set(server.id, []);
            }
          })
      );

      setState({ servers, tools: toolsMap, loading: false, error: null });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to fetch MCP servers';
      setState(prev => ({ ...prev, loading: false, error }));
      toast({ title: 'Error', description: error, variant: 'destructive' });
    }
  }, [toast]);

  // Server management
  const startServer = useCallback(async (id: string) => {
    try {
      await api.startMCPServer(id);
      toast({ title: 'Success', description: 'Server started' });
      await fetchServers();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to start server';
      toast({ title: 'Error', description: error, variant: 'destructive' });
    }
  }, [fetchServers, toast]);

  const stopServer = useCallback(async (id: string) => {
    try {
      await api.stopMCPServer(id);
      toast({ title: 'Success', description: 'Server stopped' });
      await fetchServers();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to stop server';
      toast({ title: 'Error', description: error, variant: 'destructive' });
    }
  }, [fetchServers, toast]);

  const addServer = useCallback(async (server: Omit<MCPServer, 'id' | 'status'>) => {
    try {
      await api.addMCPServer(server);
      toast({ title: 'Success', description: 'Server added' });
      await fetchServers();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to add server';
      toast({ title: 'Error', description: error, variant: 'destructive' });
    }
  }, [fetchServers, toast]);

  const removeServer = useCallback(async (id: string) => {
    try {
      await api.removeMCPServer(id);
      toast({ title: 'Success', description: 'Server removed' });
      await fetchServers();
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to remove server';
      toast({ title: 'Error', description: error, variant: 'destructive' });
    }
  }, [fetchServers, toast]);

  // Tool invocation
  const invokeTool = useCallback(async (serverId: string, toolName: string, args: any) => {
    try {
      const result = await api.invokeMCPTool({ serverId, toolName, arguments: args });
      return result;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to invoke tool';
      toast({ title: 'Error', description: error, variant: 'destructive' });
      throw err;
    }
  }, [toast]);

  // Get all available tools across servers
  const getAllTools = useCallback(() => {
    const allTools: Array<MCPTool & { serverId: string; serverName: string }> = [];
    state.servers.forEach(server => {
      const tools = state.tools.get(server.id) || [];
      tools.forEach(tool => {
        allTools.push({
          ...tool,
          serverId: server.id,
          serverName: server.name
        });
      });
    });
    return allTools;
  }, [state.servers, state.tools]);

  // Initial load and polling
  useEffect(() => {
    fetchServers();

    // Poll for server status updates every 10 seconds
    pollIntervalRef.current = setInterval(fetchServers, 10000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchServers]);

  return {
    servers: state.servers,
    tools: state.tools,
    loading: state.loading,
    error: state.error,
    startServer,
    stopServer,
    addServer,
    removeServer,
    invokeTool,
    getAllTools,
    refresh: fetchServers
  };
}