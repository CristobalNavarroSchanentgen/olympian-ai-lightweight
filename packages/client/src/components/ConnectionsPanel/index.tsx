import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useConnectionStore } from '@/stores/useConnectionStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ConnectionForm } from './ConnectionForm';
import { ScanProgress } from './ScanProgress';
import { ConnectionList } from './ConnectionList';
import { Wifi, Search, Plus } from 'lucide-react';
import { ConnectionType } from '@olympian/shared';

export function ConnectionsPanel() {
  const {
    connections,
    isLoading,
    isScanning,
    scanResults,
    fetchConnections,
    scanConnections,
    testConnection,
    deleteConnection,
  } = useConnectionStore();
  
  const { on, off } = useWebSocket();
  const [showForm, setShowForm] = useState(false);
  const [scanTypes, setScanTypes] = useState<ConnectionType[]>(['ollama', 'mcp', 'database']);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  useEffect(() => {
    // Listen for scan progress
    const handleScanProgress = (progress: any) => {
      console.log('Scan progress:', progress);
    };

    const handleScanResult = (result: any) => {
      console.log('Scan result:', result);
    };

    const handleScanComplete = (data: any) => {
      console.log('Scan complete:', data);
    };

    on('scan:progress', handleScanProgress);
    on('scan:result', handleScanResult);
    on('scan:complete', handleScanComplete);

    return () => {
      off('scan:progress', handleScanProgress);
      off('scan:result', handleScanResult);
      off('scan:complete', handleScanComplete);
    };
  }, [on, off]);

  const handleScan = () => {
    scanConnections(scanTypes);
  };

  const getConnectionStats = () => {
    const online = connections.filter(c => c.status === 'online').length;
    const offline = connections.filter(c => c.status === 'offline').length;
    const total = connections.length;
    return { online, offline, total };
  };

  const stats = getConnectionStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Connections</h2>
          <p className="text-muted-foreground">
            Manage your Ollama, MCP servers, and database connections
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleScan}
            disabled={isScanning}
            variant="outline"
          >
            {isScanning ? (
              <>
                <Spinner className="mr-2" size="sm" />
                Scanning...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Scan
              </>
            )}
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Connection
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Connections</CardTitle>
            <Wifi className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.online} online, {stats.offline} offline
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Online</CardTitle>
            <Badge variant="success">Active</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.online}</div>
            <p className="text-xs text-muted-foreground">
              Ready to use
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <Badge variant="destructive">Inactive</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.offline}</div>
            <p className="text-xs text-muted-foreground">
              Need attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Scan Progress */}
      {isScanning && <ScanProgress />}

      {/* Scan Results */}
      {scanResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Scan Results</CardTitle>
            <CardDescription>
              Found {scanResults.length} potential connections
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {scanResults.map((result, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <div className="font-medium">{result.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {result.endpoint}
                    </div>
                  </div>
                  <Badge
                    variant={result.status === 'online' ? 'success' : 'secondary'}
                  >
                    {result.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connections List */}
      <ConnectionList
        connections={connections}
        isLoading={isLoading}
        onTest={testConnection}
        onDelete={deleteConnection}
        onEdit={(connection) => {
          // TODO: Implement edit functionality
          console.log('Edit connection:', connection);
        }}
      />

      {/* Connection Form Dialog */}
      {showForm && (
        <ConnectionForm
          open={showForm}
          onOpenChange={setShowForm}
          onSuccess={() => {
            setShowForm(false);
            fetchConnections();
          }}
        />
      )}
    </div>
  );
}