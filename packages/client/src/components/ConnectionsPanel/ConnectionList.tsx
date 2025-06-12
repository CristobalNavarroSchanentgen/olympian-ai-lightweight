import { Connection } from '@olympian/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Wifi, WifiOff, TestTube, Edit, Trash } from 'lucide-react';

interface ConnectionListProps {
  connections: Connection[];
  isLoading: boolean;
  onTest: (id: string) => void;
  onEdit: (connection: Connection) => void;
  onDelete: (id: string) => void;
}

export function ConnectionList({
  connections,
  isLoading,
  onTest,
  onEdit,
  onDelete,
}: ConnectionListProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (connections.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Connections</CardTitle>
          <CardDescription>
            No connections found. Click "Scan" to discover connections or "Add Connection" to manually add one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const getConnectionIcon = (status: string) => {
    if (status === 'online') {
      return <Wifi className="h-5 w-5 text-green-500" />;
    }
    return <WifiOff className="h-5 w-5 text-muted-foreground" />;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return <Badge variant="success">Online</Badge>;
      case 'offline':
        return <Badge variant="destructive">Offline</Badge>;
      case 'connecting':
        return <Badge variant="warning">Connecting</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connections</CardTitle>
        <CardDescription>
          Your configured connections
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {connections.map((connection) => (
            <div
              key={connection._id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex items-center space-x-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  {getConnectionIcon(connection.status)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{connection.name}</h4>
                    <Badge variant="outline" className="text-xs">
                      {connection.type}
                    </Badge>
                    {connection.isManual && (
                      <Badge variant="secondary" className="text-xs">
                        Manual
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {connection.endpoint}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                {getStatusBadge(connection.status)}
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onTest(connection._id!)}
                    >
                      <TestTube className="mr-2 h-4 w-4" />
                      Test Connection
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onEdit(connection)}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(connection._id!)}
                      className="text-destructive"
                    >
                      <Trash className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}