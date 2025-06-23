import { io, Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents } from '@olympian/shared';

export interface ChatHandlers {
  onThinking?: (data: { messageId: string }) => void;
  onGenerating?: (data: { messageId: string }) => void;
  onToken?: (data: { messageId: string; token: string }) => void;
  onComplete?: (data: { 
    messageId: string; 
    conversationId: string; 
    metadata: any 
  }) => void;
  onError?: (data: { messageId: string; error: string }) => void;
  onConversationCreated?: (data: { conversationId: string }) => void;
}

class WebSocketChatService {
  private socket: Socket | null = null;
  private chatHandlers: Map<string, ChatHandlers> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      this.socket = io({
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 10000,
      });

      this.socket.on('connect', () => {
        console.log('[WebSocketChat] Connected to server');
        this.reconnectAttempts = 0;
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocketChat] Disconnected:', reason);
      });

      this.socket.on('connect_error', (error) => {
        console.error('[WebSocketChat] Connection error:', error.message);
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          reject(new Error('Failed to connect to WebSocket server'));
        }
      });

      // Setup chat event handlers
      this.setupChatHandlers();

      // Set a timeout for initial connection
      setTimeout(() => {
        if (!this.socket?.connected) {
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  private setupChatHandlers() {
    if (!this.socket) return;

    // Chat events
    this.socket.on('chat:thinking', (data: ServerEvents['chat:thinking']) => {
      const handlers = this.chatHandlers.get(data.messageId);
      handlers?.onThinking?.(data);
    });

    this.socket.on('chat:generating', (data: ServerEvents['chat:generating']) => {
      const handlers = this.chatHandlers.get(data.messageId);
      handlers?.onGenerating?.(data);
    });

    this.socket.on('chat:token', (data: ServerEvents['chat:token']) => {
      const handlers = this.chatHandlers.get(data.messageId);
      handlers?.onToken?.(data);
    });

    this.socket.on('chat:complete', (data: ServerEvents['chat:complete']) => {
      const handlers = this.chatHandlers.get(data.messageId);
      handlers?.onComplete?.(data);
      // Clean up handlers after completion
      this.chatHandlers.delete(data.messageId);
    });

    this.socket.on('chat:error', (data: ServerEvents['chat:error']) => {
      const handlers = this.chatHandlers.get(data.messageId);
      handlers?.onError?.(data);
      // Clean up handlers after error
      this.chatHandlers.delete(data.messageId);
    });

    this.socket.on('conversation:created', (data: ServerEvents['conversation:created']) => {
      // Broadcast to all active chat handlers
      this.chatHandlers.forEach(handlers => {
        handlers.onConversationCreated?.(data);
      });
    });
  }

  async sendMessage(
    params: {
      content: string;
      model: string;
      visionModel?: string;
      conversationId?: string;
      images?: string[];
    },
    handlers: ChatHandlers
  ): Promise<string> {
    if (!this.socket?.connected) {
      await this.connect();
    }

    // Generate a temporary message ID for tracking
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    // Register handlers for this message
    this.chatHandlers.set(messageId, handlers);

    // Send the message via WebSocket
    this.socket!.emit('chat:message', params as ClientEvents['chat:message']);

    return messageId;
  }

  cancelMessage(messageId: string) {
    if (this.socket?.connected) {
      this.socket.emit('chat:cancel', { messageId });
      this.chatHandlers.delete(messageId);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.chatHandlers.clear();
    }
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  on<K extends keyof ServerEvents>(
    event: K, 
    handler: (data: ServerEvents[K]) => void
  ) {
    this.socket?.on(event as string, handler as any);
  }

  off<K extends keyof ServerEvents>(
    event: K, 
    handler: (data: ServerEvents[K]) => void
  ) {
    this.socket?.off(event as string, handler as any);
  }
}

export const webSocketChatService = new WebSocketChatService();
