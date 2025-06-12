import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/services/api';
import { MCPServer } from '@olympian/shared';
import { toast } from '@/hooks/useToast';
import { Play, Square, RefreshCw, Trash, Server } from 'lucide-react';

export function ServerManager() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      const data = await api.getMCPServers();
      setServers(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch MCP servers',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = async (serverId: string) => {
    try {
      await api.startMCPServer(serverId);
      await fetchServers();
      toast({
        title: 'Success',
        description: 'MCP server started',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to start MCP server',
        variant: 'destructive',
      });
    }
  };

  const handleStop = async (serverId: string) => {
    try {
      await api.stopMCPServer(serverId);
      await fetchServers();
      toast({
        title: 'Success',
        description: 'MCP server stopped',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to stop MCP server',
        variant: 'destructive',
      });
    }
  };

  const handleRemove = async (serverId: string) => {
    try {
      await api.removeMCPServer(serverId);
      await fetchServers();
      toast({
        title: 'Success',
        description: 'MCP server removed',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove MCP server',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Spinner />
        </CardContent>
      </Card>
    );
  }

  if (servers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No MCP Servers</CardTitle>
          <CardDescription>
            No MCP servers configured. Add servers in the configuration tab.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return <Badge variant="success">Running</Badge>;
      case 'stopped':
        return <Badge variant="secondary">Stopped</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>MCP Servers</CardTitle>
          <CardDescription>
            Manage your Model Context Protocol servers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {servers.map((server) => (
              <div
                key={server.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Server className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{server.name}</h4>
                    <p className="text-sm text-muted-foreground">
                      {server.command} {server.args?.join(' ')}
                    </p>
                    {server.lastError && (
                      <p className="text-sm text-destructive">
                        Error: {server.lastError}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  {getStatusBadge(server.status)}
                  
                  {server.status === 'stopped' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleStart(server.id)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {server.status === 'running' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleStop(server.id)}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  )}
                  
                  {server.status === 'error' && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleStart(server.id)}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleRemove(server.id)}
                    disabled={server.status === 'running'}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}