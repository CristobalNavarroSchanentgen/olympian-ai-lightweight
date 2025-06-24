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

// Event queue for temporarily missing handlers
interface QueuedEvent {
  event: string;
  data: any;
  timestamp: number;
  retryCount: number;
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

  // CRITICAL FIX: Event queue for missing handlers (multi-host timing issues)
  private eventQueue: Map<string, QueuedEvent[]> = new Map();
  private cleanupTimeouts: Map<string, NodeJS.Timeout> = new Map();
  
  // Multi-host deployment specific constants
  private readonly HANDLER_CLEANUP_DELAY = 2000; // 2 second grace period for multi-host
  private readonly EVENT_QUEUE_MAX_SIZE = 50;
  private readonly EVENT_QUEUE_MAX_AGE = 10000; // 10 seconds
  private readonly MAX_RETRY_COUNT = 3;

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
      console.log('[WebSocketChat] 🏗️ Multi-host deployment mode active');

      this.socket = io(this.baseUrl, {
        path: '/socket.io/',
        // Enhanced transport configuration for multi-host reliability
        transports: ['websocket', 'polling'], // Start with WebSocket, fallback to polling
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 10000,
        timeout: 30000, // Increased timeout for multi-host
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
        // Enhanced acknowledgment settings for critical events (multi-host)
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
        console.log('[WebSocketChat] 🔄 Connection recovered:', (this.socket as any)?.recovered || false);
        
        this.reconnectAttempts = 0;
        this.lastHeartbeat = Date.now();
        this.startKeepAlive();
        this.startConnectionCheck();
        this.startStateMonitor();
        this.startHeartbeat();
        
        // Process any queued events after reconnection
        this.processAllQueuedEvents();
        
        resolve();
      });

      this.socket.on('disconnect', (reason, details) => {
        console.log('[WebSocketChat] ❌ Disconnected:', reason);
        if (details) {
          console.log('[WebSocketChat] 📋 Disconnect details:', details);
        }
        
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
          console.log('[WebSocketChat] Transport closed - network issue (preserve handlers for multi-host)');
          // Don't clear handlers on transport issues in multi-host mode
          return;
        } else if (reason === 'transport error') {
          console.log('[WebSocketChat] Transport error - connection problem (preserve handlers for multi-host)');
          // Don't clear handlers on transport errors in multi-host mode
          return;
        } else {
          console.log('[WebSocketChat] Unknown disconnect reason:', reason);
        }
        
        // Enhanced reconnection logic - preserve handlers for reconnection in multi-host
        if (reason !== 'io client disconnect') {
          console.log('[WebSocketChat] 🔄 Will attempt to reconnect automatically...');
          console.log('[WebSocketChat] 🛡️ Preserving', this.chatHandlers.size, 'handlers for reconnection');
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
        console.log('[WebSocketChat] 🔄 Connection recovered:', (this.socket as any)?.recovered || false);
        
        this.lastHeartbeat = Date.now();
        this.startKeepAlive();
        this.startConnectionCheck();
        this.startStateMonitor();
        this.startHeartbeat();
        
        // Process any queued events after reconnection
        this.processAllQueuedEvents();
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
      }, 15000); // Increased timeout for multi-host
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
        console.log('  - Queued events:', this.getTotalQueuedEvents());
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
      
      // Clean up old queued events
      this.cleanOldQueuedEvents();
      
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
      
      if (this.eventQueue.size > 0) {
        console.log('[WebSocketChat] 📦 Queued events by messageId:');
        this.eventQueue.forEach((events, messageId) => {
          console.log(`  - ${messageId}: ${events.length} events (oldest: ${Math.round((Date.now() - events[0]?.timestamp) / 1000)}s ago)`);
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
    
    // Clean up with delay
    this.scheduleHandlerCleanup(messageId, 0); // Immediate cleanup for stuck messages
  }

  // CRITICAL FIX: Validate and process events with fallback to queue
  private validateAndProcessEvent(messageId: string, eventName: string, data: any, processor: () => void): void {
    const handlers = this.chatHandlers.get(messageId);
    
    if (handlers) {
      // Handlers exist, process immediately
      try {
        processor();
        console.log(`[WebSocketChat] ✅ Processed ${eventName} for ${messageId}`);
      } catch (error) {
        console.error(`[WebSocketChat] ❌ Error processing ${eventName}:`, error);
      }
    } else {
      // Handlers missing, queue the event
      console.warn(`[WebSocketChat] ⚠️ No handlers found for ${eventName} event: ${messageId} - queuing for later`);
      this.queueEvent(messageId, eventName, data);
      
      // Log handler status for debugging
      console.log(`[WebSocketChat] 🔍 Available handler messageIds:`, Array.from(this.chatHandlers.keys()));
    }
  }

  // CRITICAL FIX: Queue events when handlers are missing
  private queueEvent(messageId: string, eventName: string, data: any): void {
    if (!this.eventQueue.has(messageId)) {
      this.eventQueue.set(messageId, []);
    }
    
    const queue = this.eventQueue.get(messageId)!;
    
    // Prevent queue overflow
    if (queue.length >= this.EVENT_QUEUE_MAX_SIZE) {
      console.warn(`[WebSocketChat] ⚠️ Event queue full for ${messageId}, dropping oldest event`);
      queue.shift();
    }
    
    queue.push({
      event: eventName,
      data,
      timestamp: Date.now(),
      retryCount: 0
    });
    
    console.log(`[WebSocketChat] 📦 Queued ${eventName} for ${messageId} (queue size: ${queue.length})`);
  }

  // CRITICAL FIX: Process queued events when handlers become available
  private processQueuedEvents(messageId: string): void {
    const queue = this.eventQueue.get(messageId);
    if (!queue || queue.length === 0) {
      return;
    }
    
    console.log(`[WebSocketChat] 🔄 Processing ${queue.length} queued events for ${messageId}`);
    
    const handlers = this.chatHandlers.get(messageId);
    if (!handlers) {
      console.warn(`[WebSocketChat] ⚠️ Still no handlers available for ${messageId}`);
      return;
    }
    
    // Process all queued events
    const eventsToProcess = [...queue];
    this.eventQueue.delete(messageId);
    
    eventsToProcess.forEach(queuedEvent => {
      try {
        console.log(`[WebSocketChat] 🔄 Processing queued ${queuedEvent.event} for ${messageId}`);
        this.processEventByName(queuedEvent.event, queuedEvent.data, handlers);
      } catch (error) {
        console.error(`[WebSocketChat] ❌ Error processing queued ${queuedEvent.event}:`, error);
      }
    });
  }

  // CRITICAL FIX: Process all queued events (after reconnection)
  private processAllQueuedEvents(): void {
    if (this.eventQueue.size === 0) {
      return;
    }
    
    console.log(`[WebSocketChat] 🔄 Processing all queued events for ${this.eventQueue.size} messages`);
    
    Array.from(this.eventQueue.keys()).forEach(messageId => {
      this.processQueuedEvents(messageId);
    });
  }

  // CRITICAL FIX: Clean up old queued events
  private cleanOldQueuedEvents(): void {
    const now = Date.now();
    
    this.eventQueue.forEach((queue, messageId) => {
      const validEvents = queue.filter(event => (now - event.timestamp) < this.EVENT_QUEUE_MAX_AGE);
      
      if (validEvents.length !== queue.length) {
        console.log(`[WebSocketChat] 🧹 Cleaned ${queue.length - validEvents.length} old events for ${messageId}`);
      }
      
      if (validEvents.length === 0) {
        this.eventQueue.delete(messageId);
      } else {
        this.eventQueue.set(messageId, validEvents);
      }
    });
  }

  // Helper method to get total queued events
  private getTotalQueuedEvents(): number {
    let total = 0;
    this.eventQueue.forEach(queue => total += queue.length);
    return total;
  }

  // CRITICAL FIX: Helper method to process events by name
  private processEventByName(eventName: string, data: any, handlers: ChatHandlers): void {
    switch (eventName) {
      case 'thinking':
        handlers.onThinking?.(data);
        break;
      case 'generating':
        handlers.onGenerating?.(data);
        break;
      case 'token':
        handlers.onToken?.(data);
        break;
      case 'complete':
        handlers.onComplete?.(data);
        break;
      case 'error':
        handlers.onError?.(data);
        break;
      default:
        console.warn(`[WebSocketChat] ⚠️ Unknown event type: ${eventName}`);
    }
  }

  // CRITICAL FIX: Schedule delayed handler cleanup
  private scheduleHandlerCleanup(messageId: string, delay: number = this.HANDLER_CLEANUP_DELAY): void {
    // Cancel any existing cleanup timeout
    const existingTimeout = this.cleanupTimeouts.get(messageId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    
    // Schedule new cleanup
    const timeoutId = setTimeout(() => {
      console.log(`[WebSocketChat] 🧹 Delayed cleanup for message: ${messageId}`);
      
      // Final attempt to process any remaining queued events
      this.processQueuedEvents(messageId);
      
      // Clean up
      this.messageStates.delete(messageId);
      this.chatHandlers.delete(messageId);
      this.eventQueue.delete(messageId);
      this.cleanupTimeouts.delete(messageId);
      
      // Clear any pending timeouts
      const timeout = this.eventTimeouts.get(messageId);
      if (timeout) {
        clearTimeout(timeout);
        this.eventTimeouts.delete(messageId);
      }
      
      console.log(`[WebSocketChat] ✅ Cleanup completed for message: ${messageId}`);
    }, delay);
    
    this.cleanupTimeouts.set(messageId, timeoutId);
    console.log(`[WebSocketChat] ⏱️ Scheduled cleanup for ${messageId} in ${delay}ms`);
  }

  private setupChatHandlers() {
    if (!this.socket) return;

    // Chat events with enhanced logging and error handling
    this.socket.on('chat:thinking', (data: ServerEvents['chat:thinking']) => {
      console.log('[WebSocketChat] 🤔 Received chat:thinking', data);
      
      // Update message state
      this.updateMessageState(data.messageId, 'thinking');
      
      // Validate and process with fallback to queue
      this.validateAndProcessEvent(data.messageId, 'thinking', data, () => {
        const handlers = this.chatHandlers.get(data.messageId);
        handlers?.onThinking?.(data);
      });
    });

    this.socket.on('chat:generating', (data: ServerEvents['chat:generating']) => {
      console.log('[WebSocketChat] ⚡ Received chat:generating', data);
      
      // Update message state
      this.updateMessageState(data.messageId, 'generating');
      
      // Validate and process with fallback to queue
      this.validateAndProcessEvent(data.messageId, 'generating', data, () => {
        const handlers = this.chatHandlers.get(data.messageId);
        handlers?.onGenerating?.(data);
      });
    });

    this.socket.on('chat:token', (data: ServerEvents['chat:token']) => {
      console.log('[WebSocketChat] 🔤 Received chat:token', data.messageId, 'token length:', data.token.length);
      
      // Update message state with token activity
      const state = this.messageStates.get(data.messageId);
      if (state) {
        state.lastActivity = Date.now();
        state.tokenCount++;
      }
      
      // Validate and process with fallback to queue
      this.validateAndProcessEvent(data.messageId, 'token', data, () => {
        const handlers = this.chatHandlers.get(data.messageId);
        handlers?.onToken?.(data);
      });
    });

    this.socket.on('chat:complete', (data: ServerEvents['chat:complete']) => {
      console.log('[WebSocketChat] ✅ Received chat:complete', data);
      
      // Update message state
      this.updateMessageState(data.messageId, 'complete');
      
      // Process the completion event immediately
      const handlers = this.chatHandlers.get(data.messageId);
      if (handlers?.onComplete) {
        // Wrap handler execution in try-catch to prevent disconnection
        try {
          handlers.onComplete(data);
          console.log('[WebSocketChat] ✅ Successfully executed completion handler for:', data.messageId);
        } catch (handlerError) {
          console.error('[WebSocketChat] ❌ Error in complete handler callback:', handlerError);
        }
      } else {
        console.warn('[WebSocketChat] ⚠️ No handlers found for complete event:', data.messageId);
        // Still proceed with delayed cleanup
      }
      
      // CRITICAL FIX: Schedule delayed cleanup instead of immediate
      this.scheduleHandlerCleanup(data.messageId);
    });

    this.socket.on('chat:error', (data: ServerEvents['chat:error']) => {
      console.error('[WebSocketChat] ❌ Received chat:error', data);
      
      // Update message state
      this.updateMessageState(data.messageId, 'error');
      
      // Process the error event immediately
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
      
      // CRITICAL FIX: Schedule delayed cleanup instead of immediate
      this.scheduleHandlerCleanup(data.messageId);
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
    
    // CRITICAL FIX: Register handlers for this message
    this.chatHandlers.set(messageId, handlers);
    console.log('[WebSocketChat] 📝 Registered handlers for message:', messageId);
    console.log('[WebSocketChat] 📊 Total active chats:', this.chatHandlers.size);
    
    // Initialize message state
    this.messageStates.set(messageId, {
      messageId,
      startTime: Date.now(),
      phase: 'thinking',
      lastActivity: Date.now(),
      tokenCount: 0,
      handlers
    });
    
    // Process any queued events for this messageId (in case of reconnection)
    this.processQueuedEvents(messageId);

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
    
    // CRITICAL FIX: Use delayed cleanup for cancellation too
    this.scheduleHandlerCleanup(messageId, 0); // Immediate cleanup for cancelled messages
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
    
    // Clear cleanup timeouts
    this.cleanupTimeouts.forEach(timeout => clearTimeout(timeout));
    this.cleanupTimeouts.clear();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.chatHandlers.clear();
      this.messageStates.clear();
      this.eventQueue.clear();
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
      queuedEvents: this.getTotalQueuedEvents(),
      url: this.baseUrl,
      lastHeartbeat: this.lastHeartbeat,
      heartbeatAge: Math.round((Date.now() - this.lastHeartbeat) / 1000),
      recovered: (this.socket as any)?.recovered || false
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

  // Debug method to get queued events
  getQueuedEvents() {
    const result: Record<string, any[]> = {};
    this.eventQueue.forEach((events, messageId) => {
      result[messageId] = events.map(event => ({
        event: event.event,
        age: Math.round((Date.now() - event.timestamp) / 1000),
        retryCount: event.retryCount
      }));
    });
    return result;
  }
}

export const webSocketChatService = new WebSocketChatService();