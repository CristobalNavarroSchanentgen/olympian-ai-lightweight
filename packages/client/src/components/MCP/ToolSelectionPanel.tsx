import { useState } from 'react';
import { useTools } from '@/hooks/useTools';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Loader2, Search, Server, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ToolSelectionPanel() {
  const { servers, loading, enableTool, disableTool, toggleServer } = useTools();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  const toggleServerExpansion = (serverId: string) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId);
    } else {
      newExpanded.add(serverId);
    }
    setExpandedServers(newExpanded);
  };

  const handleToolToggle = (serverId: string, toolId: string, enabled: boolean) => {
    const fullToolId = serverId + '.' + toolId;
    if (enabled) {
      enableTool(fullToolId);
    } else {
      disableTool(fullToolId);
    }
  };

  const filteredServers = servers.map(server => ({
    ...server,
    tools: server.tools.filter(tool => 
      searchQuery === '' || 
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(server => server.tools.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search tools..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="space-y-3">
        {filteredServers.map(server => (
          <Card key={server.id} className="overflow-hidden">
            <CardHeader 
              className="cursor-pointer"
              onClick={() => toggleServerExpansion(server.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5" />
                  <CardTitle className="text-lg">{server.name}</CardTitle>
                  <Badge variant={server.status === 'connected' ? 'default' : 'secondary'}>
                    {server.status}
                  </Badge>
                  <Badge variant="outline">{server.tools.length} tools</Badge>
                </div>
                <Checkbox
                  checked={server.tools.every(t => t.enabled)}
                  onCheckedChange={(checked: boolean) => toggleServer(server.id, !!checked)}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                />
              </div>
            </CardHeader>
            
            {expandedServers.has(server.id) && (
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {server.tools.map(tool => (
                    <div 
                      key={tool.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-lg border",
                        tool.enabled ? "bg-secondary/20" : "bg-muted/20"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium text-sm">{tool.name}</div>
                          <div className="text-xs text-muted-foreground">{tool.description}</div>
                        </div>
                      </div>
                      <Checkbox
                        checked={tool.enabled}
                        onCheckedChange={(checked: boolean) => handleToolToggle(server.id, tool.id, !!checked)}
                      />
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {filteredServers.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No tools found matching "{searchQuery}"
        </div>
      )}
    </div>
  );
}
