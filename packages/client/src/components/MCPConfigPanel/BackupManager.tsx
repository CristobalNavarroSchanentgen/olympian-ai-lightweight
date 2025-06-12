import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/services/api';
import { formatDistanceToNow } from 'date-fns';
import { formatBytes } from '@/lib/utils';
import { toast } from '@/hooks/useToast';
import { RotateCcw, FileJson, Trash } from 'lucide-react';

interface BackupManagerProps {
  onRestore: () => void;
}

export function BackupManager({ onRestore }: BackupManagerProps) {
  const [backups, setBackups] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      const data = await api.getBackups();
      setBackups(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch backups',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (filename: string) => {
    try {
      await api.restoreBackup(filename);
      toast({
        title: 'Success',
        description: 'Backup restored successfully',
      });
      onRestore();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to restore backup',
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <p className="text-muted-foreground">Loading backups...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (backups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Backups</CardTitle>
          <CardDescription>
            No configuration backups found. Backups are created automatically when you save changes.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration Backups</CardTitle>
        <CardDescription>
          Restore previous versions of your MCP configuration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {backups.map((backup) => (
            <div
              key={backup.filename}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <FileJson className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">{backup.filename}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {formatDistanceToNow(new Date(backup.createdAt), { addSuffix: true })}
                    </span>
                    <span>•</span>
                    <span>{formatBytes(backup.size)}</span>
                    <Badge variant="outline" className="text-xs">
                      {backup.type}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleRestore(backup.filename)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Restore
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}