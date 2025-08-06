import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Shield, ShieldOff } from 'lucide-react';
import { Socket } from 'socket.io-client';

interface HILToggleProps {
  socket: Socket | null;
}

export function HILToggle({ socket }: HILToggleProps) {
  const [enabled, setEnabled] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  
  useEffect(() => {
    if (!socket) return;
    
    // Request initial status
    socket.emit('hil:get_status');
    
    // Listen for status updates
    socket.on('hil:status', (data: { enabled: boolean; pendingCount?: number }) => {
      setEnabled(data.enabled);
      if (data.pendingCount !== undefined) {
        setPendingCount(data.pendingCount);
      }
    });
    
    // Listen for pending requests updates
    socket.on('hil:pending_requests', (data: { requests: any[] }) => {
      setPendingCount(data.requests.length);
    });
    
    return () => {
      socket.off('hil:status');
      socket.off('hil:pending_requests');
    };
  }, [socket]);
  
  const toggleHIL = () => {
    socket?.emit('hil:toggle');
  };
  
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {enabled ? (
              <Shield className="h-5 w-5 text-green-500" />
            ) : (
              <ShieldOff className="h-5 w-5 text-red-500" />
            )}
            <div>
              <div className="font-medium">
                Human-in-the-Loop {enabled ? 'Enabled' : 'Disabled'}
              </div>
              {pendingCount > 0 && (
                <div className="text-sm text-muted-foreground">
                  {pendingCount} pending approval{pendingCount > 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
          <Button
            variant={enabled ? "outline" : "default"}
            size="sm"
            onClick={toggleHIL}
          >
            {enabled ? 'Disable' : 'Enable'} HIL
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
