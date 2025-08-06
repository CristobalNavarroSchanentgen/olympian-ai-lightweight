import { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';

interface HILRequest {
  id: string;
  toolName: string;
  arguments: any;
  serverId: string;
}

export function useHIL(socket: Socket | null) {
  const [pendingRequest, setPendingRequest] = useState<HILRequest | null>(null);
  const [hilEnabled, setHilEnabled] = useState(true);
  
  useEffect(() => {
    if (!socket) return;
    
    // Listen for HIL requests
    socket.on('hil:request', (request: HILRequest) => {
      setPendingRequest(request);
    });
    
    // Listen for HIL status changes
    socket.on('hil:status', (data: { enabled: boolean }) => {
      setHilEnabled(data.enabled);
    });
    
    // Listen for HIL responses (clear pending request)
    socket.on('hil:response', (data: { requestId: string; approved: boolean }) => {
      if (pendingRequest?.id === data.requestId) {
        setPendingRequest(null);
      }
    });
    
    return () => {
      socket.off('hil:request');
      socket.off('hil:status');
      socket.off('hil:response');
    };
  }, [socket, pendingRequest]);
  
  const approveRequest = useCallback((requestId: string) => {
    if (!socket) return;
    socket.emit('hil:approve', { requestId });
    setPendingRequest(null);
  }, [socket]);
  
  const rejectRequest = useCallback((requestId: string) => {
    if (!socket) return;
    socket.emit('hil:reject', { requestId });
    setPendingRequest(null);
  }, [socket]);
  
  const toggleHIL = useCallback(() => {
    if (!socket) return;
    socket.emit('hil:toggle');
  }, [socket]);
  
  return {
    pendingRequest,
    hilEnabled,
    approveRequest,
    rejectRequest,
    toggleHIL
  };
}
