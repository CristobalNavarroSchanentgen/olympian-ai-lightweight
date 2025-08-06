import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Alert, AlertDescription } from './ui/alert';
import { ShieldAlert, CheckCircle, XCircle } from 'lucide-react';

interface HILRequest {
  id: string;
  toolName: string;
  arguments: any;
  serverId: string;
}

interface HILConfirmationModalProps {
  request: HILRequest | null;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}

export function HILConfirmationModal({ 
  request,
  onApprove,
  onReject 
}: HILConfirmationModalProps) {
  const [timeLeft, setTimeLeft] = useState(30);
  
  useEffect(() => {
    if (!request) {
      setTimeLeft(30);
      return;
    }
    
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          onReject(request.id);
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [request, onReject]);
  
  if (!request) return null;
  
  return (
    <Dialog open={!!request}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="text-yellow-500 h-5 w-5" />
            Tool Execution Approval Required
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <Alert>
            <AlertDescription>
              The AI wants to execute the following tool. Please review and approve or reject.
              <div className="text-sm text-muted-foreground mt-2">
                Auto-reject in {timeLeft} seconds
              </div>
            </AlertDescription>
          </Alert>
          
          <div className="bg-muted p-4 rounded-lg">
            <div className="font-semibold mb-2">Tool: {request.toolName}</div>
            <div className="text-sm text-muted-foreground mb-2">
              Server: {request.serverId}
            </div>
            <div className="font-mono text-sm bg-background p-3 rounded">
              <pre>{JSON.stringify(request.arguments, null, 2)}</pre>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="destructive"
              onClick={() => onReject(request.id)}
              className="flex items-center gap-2"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="default"
              onClick={() => onApprove(request.id)}
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              Approve & Execute
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
