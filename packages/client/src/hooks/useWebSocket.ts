import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { create } from 'zustand';
import { ClientEvents, ServerEvents } from '@olympian/shared';
import { toast } from './useToast';

interface WebSocketStore {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  emit: <K extends keyof ClientEvents>(event: K, data: ClientEvents[K]) => void;
  on: <K extends keyof ServerEvents>(event: K, handler: (data: ServerEvents[K]) => void) => void;
  off: <K extends keyof ServerEvents>(event: K, handler: (data: ServerEvents[K]) => void) => void;
}

export const useWebSocket = create<WebSocketStore>((set, get) => ({
  socket: null,
  isConnected: false,

  connect: () => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      set({ isConnected: true });
      toast({
        title: 'Connected',
        description: 'WebSocket connection established',
      });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false });
      toast({
        title: 'Disconnected',
        description: 'WebSocket connection lost',
        variant: 'destructive',
      });
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to server',
        variant: 'destructive',
      });
    });

    set({ socket });
  },

  disconnect: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null, isConnected: false });
    }
  },

  emit: (event, data) => {
    const { socket } = get();
    if (socket && socket.connected) {
      socket.emit(event, data);
    }
  },

  on: (event, handler) => {
    const { socket } = get();
    if (socket) {
      socket.on(event as string, handler as any);
    }
  },

  off: (event, handler) => {
    const { socket } = get();
    if (socket) {
      socket.off(event as string, handler as any);
    }
  },
}));