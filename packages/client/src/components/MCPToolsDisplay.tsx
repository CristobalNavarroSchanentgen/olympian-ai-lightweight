import { useMCP } from '@/hooks/useMCP';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Wrench } from 'lucide-react';

interface MCPToolsDisplayProps {
  onToolSelect?: (serverId: string, toolName: string) => void;
}

export function MCPToolsDisplay({ onToolSelect }: MCPToolsDisplayProps) {
  const { getAllTools } = useMCP();
  const tools = getAllTools();

  if (tools.length === 0) {
    return null;
  }

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="h-4 w-4" />
        <span className="text-sm font-medium">Available MCP Tools</span>
        <Badge variant="secondary" className="ml-auto">{tools.length}</Badge>
      </div>
      <ScrollArea className="h-32">
        <div className="space-y-2">
          {tools.map((tool, index) => (
            <div
              key={`${tool.serverId}-${tool.name}-${index}`}
              className="flex items-center justify-between p-2 rounded-md hover:bg-muted cursor-pointer transition-colors"
              onClick={() => onToolSelect?.(tool.serverId, tool.name)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{tool.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {tool.description || `From ${tool.serverName}`}
                </p>
              </div>
              <Badge variant="outline" className="ml-2 text-xs">
                {tool.serverName}
              </Badge>
            </div>
          ))}
        </div>
      </ScrollArea>
    </Card>
  );
}