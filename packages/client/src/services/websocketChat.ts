import { io, Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, SocketIOError } from '@olympian/shared';

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
  private maxReconnectAttempts = 10; // Increased for better resilience
  private reconnectDelay = 1000;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private baseUrl = '';

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // Enhanced connection URL determination for multi-host deployment
      const protocol = window.location.protocol;
      const hostname = window.location.hostname;
      const port = window.location.port;
      
      // Construct the base URL - in production behind nginx, this will be the same origin
      this.baseUrl = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
      
      console.log('[WebSocketChat] Connecting to:', this.baseUrl);
      console.log('[WebSocketChat] Protocol:', protocol, 'Hostname:', hostname, 'Port:', port);

      this.socket = io(this.baseUrl, {
        path: '/socket.io/',
        // Enhanced transport configuration for multi-host reliability
        transports: ['websocket', 'polling'], // Start with WebSocket, fallback to polling
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 10000,
        timeout: 30000, // Increased timeout
        autoConnect: true,
        // Enhanced options for proxy compatibility
        withCredentials: true,
        tryAllTransports: true, // Try all transports if first fails
        // Force new connection to avoid stale sessions
        forceNew: false,
        // Important for multi-host deployment behind nginx
        closeOnBeforeunload: false,
        // Additional socket.io specific options
        query: {
          // Add timestamp to prevent caching issues
          t: Date.now().toString()
        }
      });

      // Enhanced connection event handling
      this.socket.on('connect', () => {
        console.log('[WebSocketChat] ✅ Connected successfully to server');
        console.log('[WebSocketChat] Socket ID:', this.socket?.id);
        console.log('[WebSocketChat] Transport:', this.socket?.io.engine.transport.name);
        console.log('[WebSocketChat] Engine ID:', this.socket?.io.engine.id);
        console.log('[WebSocketChat] Ready state:', this.socket?.io.engine.readyState);
        
        this.reconnectAttempts = 0;
        this.startKeepAlive();
        this.startConnectionCheck();
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocketChat] ❌ Disconnected:', reason);
        this.stopKeepAlive();
        this.stopConnectionCheck();
        
        // Log detailed disconnect information
        if (reason === 'io server disconnect') {
          console.log('[WebSocketChat] Server initiated disconnect - likely server restart');
        } else if (reason === 'io client disconnect') {
          console.log('[WebSocketChat] Client initiated disconnect');
        } else if (reason === 'transport close') {
          console.log('[WebSocketChat] Transport closed - network issue');
        } else if (reason === 'transport error') {
          console.log('[WebSocketChat] Transport error - connection problem');
        } else {
          console.log('[WebSocketChat] Unknown disconnect reason:', reason);
        }
        
        // Enhanced reconnection logic
        if (reason !== 'io client disconnect') {
          console.log('[WebSocketChat] 🔄 Will attempt to reconnect automatically...');
        }
      });

      this.socket.on('connect_error', (error: SocketIOError) => {
        console.error('[WebSocketChat] ❌ Connection error:', error.message);
        console.error('[WebSocketChat] Error type:', error.type || 'unknown');
        console.error('[WebSocketChat] Error context:', error.context || 'none');
        console.error('[WebSocketChat] Error description:', error.description || 'none');
        console.error('[WebSocketChat] Full error:', error);
        
        this.reconnectAttempts++;
        console.log(`[WebSocketChat] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
        
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          this.stopKeepAlive();
          this.stopConnectionCheck();
          reject(new Error(`Failed to connect to WebSocket server after ${this.maxReconnectAttempts} attempts. Last error: ${error.message}`));
        }
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('[WebSocketChat] ✅ Reconnected successfully after', attemptNumber, 'attempts');
        console.log('[WebSocketChat] New transport:', this.socket?.io.engine.transport.name);
        this.startKeepAlive();
        this.startConnectionCheck();
      });

      this.socket.on('reconnect_failed', () => {
        console.error('[WebSocketChat] ❌ All reconnection attempts failed');
        this.stopKeepAlive();
        this.stopConnectionCheck();
      });

      // Transport upgrade events for debugging
      this.socket.on('upgrade', () => {
        console.log('[WebSocketChat] ⬆️ Transport upgraded to:', this.socket?.io.engine.transport.name);
      });

      this.socket.on('upgradeError', (error) => {
        console.warn('[WebSocketChat] ⚠️ Transport upgrade failed:', error);
        console.log('[WebSocketChat] Continuing with current transport:', this.socket?.io.engine.transport.name);
      });

      // Setup chat event handlers
      this.setupChatHandlers();

      // Enhanced timeout for initial connection
      setTimeout(() => {
        if (!this.socket?.connected) {
          console.error('[WebSocketChat] ⏰ Initial connection timeout');
          reject(new Error('WebSocket connection timeout - check network and server availability'));
        }
      }, 15000); // Increased timeout
    });
  }

  private startKeepAlive() {
    // Send a ping every 25 seconds to keep the connection alive
    this.keepAliveInterval = setInterval(() => {
      if (this.socket?.connected) {
        console.log('[WebSocketChat] 🏓 Sending keepalive ping');
        this.socket.emit('ping');
      }
    }, 25000);
  }

  private stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  private startConnectionCheck() {
    // Check connection health every 60 seconds
    this.connectionCheckInterval = setInterval(() => {
      if (this.socket) {
        console.log('[WebSocketChat] 📊 Connection status check:');
        console.log('  - Connected:', this.socket.connected);
        console.log('  - Transport:', this.socket.io.engine.transport.name);
        console.log('  - Ready state:', this.socket.io.engine.readyState);
        console.log('  - Active chats:', this.chatHandlers.size);
      }
    }, 60000);
  }

  private stopConnectionCheck() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  private setupChatHandlers() {
    if (!this.socket) return;

    // Chat events with enhanced logging
    this.socket.on('chat:thinking', (data: ServerEvents['chat:thinking']) => {
      console.log('[WebSocketChat] 🤔 Received chat:thinking', data);
      const handlers = this.chatHandlers.get(data.messageId);
      if (handlers?.onThinking) {
        handlers.onThinking(data);
      } else {
        console.warn('[WebSocketChat] ⚠️ No handlers found for thinking event:', data.messageId);
      }
    });

    this.socket.on('chat:generating', (data: ServerEvents['chat:generating']) => {
      console.log('[WebSocketChat] ⚡ Received chat:generating', data);
      const handlers = this.chatHandlers.get(data.messageId);
      if (handlers?.onGenerating) {
        handlers.onGenerating(data);
      } else {
        console.warn('[WebSocketChat] ⚠️ No handlers found for generating event:', data.messageId);
      }
    });

    this.socket.on('chat:token', (data: ServerEvents['chat:token']) => {
      console.log('[WebSocketChat] 🔤 Received chat:token', data.messageId, 'token length:', data.token.length);
      const handlers = this.chatHandlers.get(data.messageId);
      if (handlers?.onToken) {
        handlers.onToken(data);
      } else {
        console.warn('[WebSocketChat] ⚠️ No handlers found for token event:', data.messageId);
      }
    });

    this.socket.on('chat:complete', (data: ServerEvents['chat:complete']) => {
      console.log('[WebSocketChat] ✅ Received chat:complete', data);
      const handlers = this.chatHandlers.get(data.messageId);
      if (handlers?.onComplete) {
        handlers.onComplete(data);
      } else {
        console.warn('[WebSocketChat] ⚠️ No handlers found for complete event:', data.messageId);
      }
      // Clean up handlers after completion
      this.chatHandlers.delete(data.messageId);
      console.log('[WebSocketChat] 🧹 Cleaned up handlers for message:', data.messageId);
    });

    this.socket.on('chat:error', (data: ServerEvents['chat:error']) => {
      console.error('[WebSocketChat] ❌ Received chat:error', data);
      const handlers = this.chatHandlers.get(data.messageId);
      if (handlers?.onError) {
        handlers.onError(data);
      } else {
        console.warn('[WebSocketChat] ⚠️ No handlers found for error event:', data.messageId);
      }
      // Clean up handlers after error
      this.chatHandlers.delete(data.messageId);
      console.log('[WebSocketChat] 🧹 Cleaned up handlers for message after error:', data.messageId);
    });

    this.socket.on('conversation:created', (data: ServerEvents['conversation:created']) => {
      console.log('[WebSocketChat] 🆕 Received conversation:created', data);
      // Broadcast to all active chat handlers
      this.chatHandlers.forEach(handlers => {
        handlers.onConversationCreated?.(data);
      });
    });

    // Handle pong response
    this.socket.on('pong', () => {
      console.log('[WebSocketChat] 🏓 Received pong response');
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
      console.log('[WebSocketChat] 🔌 Socket not connected, attempting to connect...');
      await this.connect();
    }

    // Generate a temporary message ID for tracking
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    console.log('[WebSocketChat] 📤 Sending message with ID:', messageId);
    console.log('[WebSocketChat] 📋 Message params:', { 
      content: params.content.substring(0, 100) + (params.content.length > 100 ? '...' : ''), 
      model: params.model,
      visionModel: params.visionModel,
      conversationId: params.conversationId,
      images: params.images?.length || 0 
    });
    
    // Register handlers for this message
    this.chatHandlers.set(messageId, handlers);
    console.log('[WebSocketChat] 📝 Registered handlers for message:', messageId);
    console.log('[WebSocketChat] 📊 Total active chats:', this.chatHandlers.size);

    // Send the message via WebSocket
    this.socket!.emit('chat:message', params as ClientEvents['chat:message']);
    console.log('[WebSocketChat] ✅ Message sent successfully');

    return messageId;
  }

  cancelMessage(messageId: string) {
    if (this.socket?.connected) {
      console.log('[WebSocketChat] ❌ Cancelling message:', messageId);
      this.socket.emit('chat:cancel', { messageId });
      this.chatHandlers.delete(messageId);
      console.log('[WebSocketChat] 🧹 Cleaned up handlers for cancelled message:', messageId);
    } else {
      console.warn('[WebSocketChat] ⚠️ Cannot cancel message - socket not connected:', messageId);
    }
  }

  disconnect() {
    console.log('[WebSocketChat] 🔌 Disconnecting...');
    this.stopKeepAlive();
    this.stopConnectionCheck();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.chatHandlers.clear();
      console.log('[WebSocketChat] ✅ Disconnected and cleaned up');
    }
  }

  isConnected(): boolean {
    const connected = this.socket?.connected || false;
    if (!connected) {
      console.log('[WebSocketChat] ❌ Connection check: not connected');
    }
    return connected;
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

  // Debug method to get connection info
  getConnectionInfo() {
    if (!this.socket) return null;
    
    return {
      connected: this.socket.connected,
      id: this.socket.id,
      transport: this.socket.io.engine.transport.name,
      readyState: this.socket.io.engine.readyState,
      reconnectAttempts: this.reconnectAttempts,
      activeChats: this.chatHandlers.size,
      url: this.baseUrl
    };
  }
}

export const webSocketChatService = new WebSocketChatService();
