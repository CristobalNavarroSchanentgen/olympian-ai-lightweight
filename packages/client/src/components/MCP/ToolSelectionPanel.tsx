import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Checkbox } from './ui/checkbox';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Wrench, Server, ToggleLeft, ToggleRight } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface ToolSelectionState {
  servers: Array<{
    id: string;
    tools: Array<{
      name: string;
      enabled: boolean;
      description: string;
    }>;
    allEnabled: boolean;
  }>;
  totalTools: number;
  enabledCount: number;
}

interface ToolSelectionPanelProps {
  socket: Socket | null;
}

export function ToolSelectionPanel({ socket }: ToolSelectionPanelProps) {
  const [state, setState] = useState<ToolSelectionState | null>(null);
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!socket) return;
    
    // Request initial state
    socket.emit('tools:get_selection');
    
    // Listen for updates
    socket.on('tools:selection_state', (response: { data: ToolSelectionState }) => {
      setState(response.data);
      setLoading(false);
    });
    
    return () => {
      socket.off('tools:selection_state');
    };
  }, [socket]);
  
  const toggleTool = (toolName: string) => {
    socket?.emit('tools:toggle', { toolName });
  };
  
  const toggleServer = (serverId: string) => {
    socket?.emit('tools:toggle_server', { serverId });
  };
  
  const processCommand = () => {
    if (command.trim()) {
      socket?.emit('tools:process_command', { command: command.trim() });
      setCommand('');
    }
  };
  
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            Loading tools...
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (!state) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">
            No tools available
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Tool Selection
          </div>
          <div className="text-sm font-normal">
            {state.enabledCount}/{state.totalTools} enabled
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Quick actions */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => socket?.emit('tools:enable_all')}
          >
            Enable All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => socket?.emit('tools:disable_all')}
          >
            Disable All
          </Button>
        </div>
        
        {/* Command input */}
        <div className="flex gap-2">
          <Input
            placeholder="Enter tool numbers (e.g., 1,3,5-8)"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && processCommand()}
          />
          <Button onClick={processCommand}>Apply</Button>
        </div>
        
        {/* Server groups */}
        {state.servers.map((server, serverIdx) => (
          <div key={server.id} className="border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                <span className="font-semibold">{server.id}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => toggleServer(server.id)}
              >
                {server.allEnabled ? (
                  <ToggleRight className="h-4 w-4 text-green-500" />
                ) : (
                  <ToggleLeft className="h-4 w-4 text-gray-400" />
                )}
              </Button>
            </div>
            
            <div className="space-y-2 ml-6">
              {server.tools.map((tool, idx) => {
                const globalIdx = state.servers
                  .slice(0, serverIdx)
                  .reduce((sum, s) => sum + s.tools.length, 0) + idx + 1;
                
                return (
                  <div key={tool.name} className="flex items-start gap-2">
                    <span className="text-xs text-muted-foreground w-6">
                      {globalIdx}
                    </span>
                    <Checkbox
                      checked={tool.enabled}
                      onCheckedChange={() => toggleTool(tool.name)}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{tool.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {tool.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
