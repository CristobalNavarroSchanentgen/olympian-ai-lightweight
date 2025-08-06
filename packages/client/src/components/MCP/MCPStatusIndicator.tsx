import { useEffect, useState } from 'react';
import { Shield, Server, Wrench } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MCPServer {
  id: string;
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  toolCount: number;
}

interface MCPStatusIndicatorProps {
  className?: string;
}

export function MCPStatusIndicator({ className }: MCPStatusIndicatorProps) {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [hilActive, setHilActive] = useState(true);
  const [totalTools, setTotalTools] = useState(0);

  useEffect(() => {
    const handleMCPStatus = (event: CustomEvent) => {
      const { servers: serverList } = event.detail;
      setServers(serverList);
      const total = serverList.reduce((sum: number, s: MCPServer) => sum + s.toolCount, 0);
      setTotalTools(total);
    };

    window.addEventListener('mcp:status', handleMCPStatus as EventListener);
    return () => window.removeEventListener('mcp:status', handleMCPStatus as EventListener);
  }, []);

  const connectedCount = servers.filter(s => s.status === 'connected').length;
  
  return (
    <div className={cn("flex items-center gap-3 px-3 py-1.5 bg-gray-800 rounded-lg", className)}>
      <div className="flex items-center gap-1.5">
        <Server className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-300">
          {connectedCount}/{servers.length} servers
        </span>
        <div className="flex gap-1">
          {servers.map(server => {
            const statusClass = server.status === 'connected' ? "bg-green-500" :
                              server.status === 'error' ? "bg-red-500" : "bg-gray-500";
            const title = server.name + ': ' + server.status;
            return (
              <div
                key={server.id}
                className={cn("w-2 h-2 rounded-full", statusClass)}
                title={title}
              />
            );
          })}
        </div>
      </div>
      
      <div className="flex items-center gap-1.5">
        <Wrench className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-300">{totalTools} tools</span>
      </div>
      
      <div className="flex items-center gap-1.5">
        <Shield className={cn(
          "w-4 h-4",
          hilActive ? "text-purple-500" : "text-gray-500"
        )} />
        <span className={cn(
          "text-xs",
          hilActive ? "text-purple-400" : "text-gray-500"
        )}>
          HIL {hilActive ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}
