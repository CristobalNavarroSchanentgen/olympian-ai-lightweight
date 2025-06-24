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

interface MessageState {
  messageId: string;
  startTime: number;
  phase: 'thinking' | 'generating' | 'complete' | 'error';
  lastActivity: number;
  tokenCount: number;
  handlers: ChatHandlers;
}

class WebSocketChatService {
  private socket: Socket | null = null;
  private chatHandlers: Map<string, ChatHandlers> = new Map();
  private messageStates: Map<string, MessageState> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private stateMonitorInterval: NodeJS.Timeout | null = null;
  private baseUrl = '';
  private eventTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private lastHeartbeat = Date.now();
  private heartbeatInterval: NodeJS.Timeout | null = null;

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
      
      console.log('[WebSocketChat] 🚀 Connecting to:', this.baseUrl);
      console.log('[WebSocketChat] Environment:', { protocol, hostname, port });

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
          t: Date.now().toString(),
          // Add deployment mode for server-side handling
          deploymentMode: 'multi-host'
        },
        // Enhanced acknowledgment settings for critical events
        ackTimeout: 15000, // 15 second timeout for acknowledgments
        retries: 3 // Retry failed events 3 times
      });

      // Enhanced connection event handling
      this.socket.on('connect', () => {
        console.log('[WebSocketChat] ✅ Connected successfully to server');
        console.log('[WebSocketChat] Socket ID:', this.socket?.id);
        console.log('[WebSocketChat] Transport:', this.socket?.io.engine.transport.name);
        console.log('[WebSocketChat] Engine ID:', this.socket?.io.engine.id);
        console.log('[WebSocketChat] Ready state:', this.socket?.io.engine.readyState);
        
        this.reconnectAttempts = 0;
        this.lastHeartbeat = Date.now();
        this.startKeepAlive();
        this.startConnectionCheck();
        this.startStateMonitor();
        this.startHeartbeat();
        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('[WebSocketChat] ❌ Disconnected:', reason);
        this.stopKeepAlive();
        this.stopConnectionCheck();
        this.stopStateMonitor();
        this.stopHeartbeat();
        
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
          this.stopStateMonitor();
          this.stopHeartbeat();
          reject(new Error(`Failed to connect to WebSocket server after ${this.maxReconnectAttempts} attempts. Last error: ${error.message}`));
        }
      });

      this.socket.on('reconnect', (attemptNumber) => {
        console.log('[WebSocketChat] ✅ Reconnected successfully after', attemptNumber, 'attempts');
        console.log('[WebSocketChat] New transport:', this.socket?.io.engine.transport.name);
        this.lastHeartbeat = Date.now();
        this.startKeepAlive();
        this.startConnectionCheck();
        this.startStateMonitor();
        this.startHeartbeat();
      });

      this.socket.on('reconnect_failed', () => {
        console.error('[WebSocketChat] ❌ All reconnection attempts failed');
        this.stopKeepAlive();
        this.stopConnectionCheck();
        this.stopStateMonitor();
        this.stopHeartbeat();
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
        this.lastHeartbeat = Date.now();
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
        console.log('  - Message states:', this.messageStates.size);
        console.log('  - Last heartbeat:', Math.round((Date.now() - this.lastHeartbeat) / 1000) + 's ago');
      }
    }, 60000);
  }

  private stopConnectionCheck() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  private startHeartbeat() {
    // Enhanced heartbeat for event delivery validation
    this.heartbeatInterval = setInterval(() => {
      this.lastHeartbeat = Date.now();
      
      // Check for stuck message states and auto-recover
      this.messageStates.forEach((state, messageId) => {
        const timeSinceLastActivity = Date.now() - state.lastActivity;
        
        if (timeSinceLastActivity > 30000) { // 30 seconds without activity
          console.warn(`[WebSocketChat] ⚠️ Message ${messageId} stuck in ${state.phase} for ${Math.round(timeSinceLastActivity / 1000)}s`);
          
          // Auto-complete stuck messages to prevent permanent "thinking" state
          if (state.phase === 'thinking' || state.phase === 'generating') {
            console.log(`[WebSocketChat] 🔧 Auto-completing stuck message ${messageId}`);
            this.handleStuckMessage(messageId, state);
          }
        }
      });
    }, 10000); // Check every 10 seconds
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private startStateMonitor() {
    // Monitor message states and provide enhanced debugging
    this.stateMonitorInterval = setInterval(() => {
      if (this.messageStates.size > 0) {
        console.log('[WebSocketChat] 📋 Active message states:');
        this.messageStates.forEach((state, messageId) => {
          const duration = Math.round((Date.now() - state.startTime) / 1000);
          const lastActivity = Math.round((Date.now() - state.lastActivity) / 1000);
          console.log(`  - ${messageId}: ${state.phase} (${duration}s total, ${lastActivity}s since activity, ${state.tokenCount} tokens)`);
        });
      }
    }, 30000); // Every 30 seconds
  }

  private stopStateMonitor() {
    if (this.stateMonitorInterval) {
      clearInterval(this.stateMonitorInterval);
      this.stateMonitorInterval = null;
    }
  }

  private handleStuckMessage(messageId: string, state: MessageState) {
    console.log(`[WebSocketChat] 🛠️ Handling stuck message ${messageId} in ${state.phase} phase`);
    
    // Emit an error to the handlers to clear the UI state
    if (state.handlers.onError) {
      try {
        state.handlers.onError({
          messageId,
          error: `Request timed out after ${Math.round((Date.now() - state.startTime) / 1000)} seconds. This can happen with slow models or network issues. Please try again.`
        });
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in stuck message error handler:', error);
      }
    }
    
    // Clean up
    this.messageStates.delete(messageId);
    this.chatHandlers.delete(messageId);
    
    // Clear any pending timeouts
    const timeout = this.eventTimeouts.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.eventTimeouts.delete(messageId);
    }
  }

  private setupChatHandlers() {
    if (!this.socket) return;

    // Chat events with enhanced logging and error handling
    this.socket.on('chat:thinking', (data: ServerEvents['chat:thinking']) => {
      try {
        console.log('[WebSocketChat] 🤔 Received chat:thinking', data);
        
        // Update message state
        this.updateMessageState(data.messageId, 'thinking');
        
        const handlers = this.chatHandlers.get(data.messageId);
        if (handlers?.onThinking) {
          handlers.onThinking(data);
        } else {
          console.warn('[WebSocketChat] ⚠️ No handlers found for thinking event:', data.messageId);
        }
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in thinking handler:', error);
      }
    });

    this.socket.on('chat:generating', (data: ServerEvents['chat:generating']) => {
      try {
        console.log('[WebSocketChat] ⚡ Received chat:generating', data);
        
        // Update message state
        this.updateMessageState(data.messageId, 'generating');
        
        const handlers = this.chatHandlers.get(data.messageId);
        if (handlers?.onGenerating) {
          handlers.onGenerating(data);
        } else {
          console.warn('[WebSocketChat] ⚠️ No handlers found for generating event:', data.messageId);
        }
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in generating handler:', error);
      }
    });

    this.socket.on('chat:token', (data: ServerEvents['chat:token']) => {
      try {
        console.log('[WebSocketChat] 🔤 Received chat:token', data.messageId, 'token length:', data.token.length);
        
        // Update message state with token activity
        const state = this.messageStates.get(data.messageId);
        if (state) {
          state.lastActivity = Date.now();
          state.tokenCount++;
        }
        
        const handlers = this.chatHandlers.get(data.messageId);
        if (handlers?.onToken) {
          handlers.onToken(data);
        } else {
          console.warn('[WebSocketChat] ⚠️ No handlers found for token event:', data.messageId);
        }
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in token handler:', error);
      }
    });

    this.socket.on('chat:complete', (data: ServerEvents['chat:complete']) => {
      try {
        console.log('[WebSocketChat] ✅ Received chat:complete', data);
        
        // Update message state
        this.updateMessageState(data.messageId, 'complete');
        
        const handlers = this.chatHandlers.get(data.messageId);
        if (handlers?.onComplete) {
          // Wrap handler execution in try-catch to prevent disconnection
          try {
            handlers.onComplete(data);
            console.log('[WebSocketChat] ✅ Successfully executed completion handler for:', data.messageId);
          } catch (handlerError) {
            console.error('[WebSocketChat] ❌ Error in complete handler callback:', handlerError);
            // Still clean up even if handler fails
          }
        } else {
          console.warn('[WebSocketChat] ⚠️ No handlers found for complete event:', data.messageId);
        }
        
        // Clean up handlers and state after completion
        this.messageStates.delete(data.messageId);
        this.chatHandlers.delete(data.messageId);
        
        // Clear any pending timeouts
        const timeout = this.eventTimeouts.get(data.messageId);
        if (timeout) {
          clearTimeout(timeout);
          this.eventTimeouts.delete(data.messageId);
        }
        
        console.log('[WebSocketChat] 🧹 Cleaned up handlers for message:', data.messageId);
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in complete handler:', error);
        // Still try to clean up
        this.messageStates.delete(data.messageId);
        this.chatHandlers.delete(data.messageId);
      }
    });

    this.socket.on('chat:error', (data: ServerEvents['chat:error']) => {
      try {
        console.error('[WebSocketChat] ❌ Received chat:error', data);
        
        // Update message state
        this.updateMessageState(data.messageId, 'error');
        
        const handlers = this.chatHandlers.get(data.messageId);
        if (handlers?.onError) {
          // Wrap handler execution in try-catch
          try {
            handlers.onError(data);
          } catch (handlerError) {
            console.error('[WebSocketChat] ❌ Error in error handler callback:', handlerError);
          }
        } else {
          console.warn('[WebSocketChat] ⚠️ No handlers found for error event:', data.messageId);
        }
        
        // Clean up handlers and state after error
        this.messageStates.delete(data.messageId);
        this.chatHandlers.delete(data.messageId);
        
        // Clear any pending timeouts
        const timeout = this.eventTimeouts.get(data.messageId);
        if (timeout) {
          clearTimeout(timeout);
          this.eventTimeouts.delete(data.messageId);
        }
        
        console.log('[WebSocketChat] 🧹 Cleaned up handlers for message after error:', data.messageId);
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in error handler:', error);
        // Still try to clean up
        this.messageStates.delete(data.messageId);
        this.chatHandlers.delete(data.messageId);
      }
    });

    this.socket.on('conversation:created', (data: ServerEvents['conversation:created']) => {
      try {
        console.log('[WebSocketChat] 🆕 Received conversation:created', data);
        // Broadcast to all active chat handlers
        this.chatHandlers.forEach(handlers => {
          try {
            handlers.onConversationCreated?.(data);
          } catch (handlerError) {
            console.error('[WebSocketChat] ❌ Error in conversation:created handler:', handlerError);
          }
        });
      } catch (error) {
        console.error('[WebSocketChat] ❌ Error in conversation:created handler:', error);
      }
    });

    // Handle pong response
    this.socket.on('pong', () => {
      console.log('[WebSocketChat] 🏓 Received pong response');
      this.lastHeartbeat = Date.now();
    });
  }

  private updateMessageState(messageId: string, phase: MessageState['phase']) {
    const now = Date.now();
    const existingState = this.messageStates.get(messageId);
    
    if (existingState) {
      existingState.phase = phase;
      existingState.lastActivity = now;
    } else {
      this.messageStates.set(messageId, {
        messageId,
        startTime: now,
        phase,
        lastActivity: now,
        tokenCount: 0,
        handlers: this.chatHandlers.get(messageId) || {}
      });
    }
    
    console.log(`[WebSocketChat] 📊 Message ${messageId} state updated to: ${phase}`);
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
    
    // Initialize message state
    this.messageStates.set(messageId, {
      messageId,
      startTime: Date.now(),
      phase: 'thinking',
      lastActivity: Date.now(),
      tokenCount: 0,
      handlers
    });
    
    console.log('[WebSocketChat] 📝 Registered handlers for message:', messageId);
    console.log('[WebSocketChat] 📊 Total active chats:', this.chatHandlers.size);

    // Set up a timeout to auto-complete stuck messages
    const timeoutId = setTimeout(() => {
      const state = this.messageStates.get(messageId);
      if (state && (state.phase === 'thinking' || state.phase === 'generating')) {
        console.warn(`[WebSocketChat] ⏰ Message ${messageId} timed out after 2 minutes`);
        this.handleStuckMessage(messageId, state);
      }
    }, 120000); // 2 minute timeout
    
    this.eventTimeouts.set(messageId, timeoutId);

    // Send the message via WebSocket with the messageId included
    const messageData: ClientEvents['chat:message'] = {
      messageId, // Include the messageId so server uses the same ID
      ...params
    };
    
    this.socket!.emit('chat:message', messageData);
    console.log('[WebSocketChat] ✅ Message sent successfully with messageId:', messageId);

    return messageId;
  }

  cancelMessage(messageId: string) {
    if (this.socket?.connected) {
      console.log('[WebSocketChat] ❌ Cancelling message:', messageId);
      this.socket.emit('chat:cancel', { messageId });
    } else {
      console.warn('[WebSocketChat] ⚠️ Cannot cancel message - socket not connected:', messageId);
    }
    
    // Clean up local state
    this.messageStates.delete(messageId);
    this.chatHandlers.delete(messageId);
    
    // Clear any pending timeouts
    const timeout = this.eventTimeouts.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.eventTimeouts.delete(messageId);
    }
    
    console.log('[WebSocketChat] 🧹 Cleaned up handlers for cancelled message:', messageId);
  }

  disconnect() {
    console.log('[WebSocketChat] 🔌 Disconnecting...');
    this.stopKeepAlive();
    this.stopConnectionCheck();
    this.stopStateMonitor();
    this.stopHeartbeat();
    
    // Clear all timeouts
    this.eventTimeouts.forEach(timeout => clearTimeout(timeout));
    this.eventTimeouts.clear();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.chatHandlers.clear();
      this.messageStates.clear();
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
      messageStates: this.messageStates.size,
      url: this.baseUrl,
      lastHeartbeat: this.lastHeartbeat,
      heartbeatAge: Math.round((Date.now() - this.lastHeartbeat) / 1000)
    };
  }

  // Debug method to get message states
  getMessageStates() {
    return Array.from(this.messageStates.values()).map(state => ({
      messageId: state.messageId,
      phase: state.phase,
      duration: Math.round((Date.now() - state.startTime) / 1000),
      lastActivity: Math.round((Date.now() - state.lastActivity) / 1000),
      tokenCount: state.tokenCount
    }));
  }
}

export const webSocketChatService = new WebSocketChatService();