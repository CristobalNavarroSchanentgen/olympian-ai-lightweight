import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';

interface HILRequest {
  id: string;
  tool: {
    serverId: string;
    name: string;
    description: string;
    arguments: any;
  };
  timeout: number;
}

export function useHIL() {
  const { socket } = useWebSocket();
  const [request, setRequest] = useState<HILRequest | null>(null);
  const [pendingRequests, setPendingRequests] = useState<HILRequest[]>([]);

  useEffect(() => {
    if (!socket) return;

    const handleHILRequest = (data: HILRequest) => {
      setRequest(data);
      setPendingRequests(prev => [...prev, data]);
    };

    socket.on('hil:request', handleHILRequest);

    return () => {
      socket.off('hil:request', handleHILRequest);
    };
  }, [socket]);

  const approve = useCallback((requestId: string) => {
    if (!socket) return;
    
    socket.emit('hil:approve', { requestId });
    setRequest(null);
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, [socket]);

  const reject = useCallback((requestId: string) => {
    if (!socket) return;
    
    socket.emit('hil:reject', { requestId });
    setRequest(null);
    setPendingRequests(prev => prev.filter(r => r.id !== requestId));
  }, [socket]);

  return {
    request,
    pendingRequests,
    approve,
    reject
  };
}
