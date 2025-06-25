/**
 * 🚀 BULLETPROOF WEBSOCKET CHAT SERVICE
 * 
 * Completely rewritten WebSocket service using the MessageLifecycleManager
 * to eliminate all known race conditions and handler lifecycle issues.
 * 
 * Key improvements:
 * - Deterministic message ID generation
 * - Bulletproof handler lifecycle management
 * - Event queue for multi-host timing issues
 * - Comprehensive error handling and recovery
 * - Real-time monitoring and diagnostics
 * 
 * FIXED: Handler lifecycle issue for follow-up messages in multi-host deployment
 */

import { io, Socket } from 'socket.io-client';
import { ClientEvents, ServerEvents, SocketIOError } from '@olympian/shared';
import { messageLifecycleManager } from './messageIdManager';

// Event queue for handling out-of-order or delayed events
interface QueuedEvent {
  event: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

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

class BulletproofWebSocketChatService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private baseUrl = '';
  
  // Event queue for multi-host deployment timing issues
  private eventQueue: Map<string, QueuedEvent[]> = new Map();
  private readonly EVENT_QUEUE_MAX_SIZE = 100;
  private readonly EVENT_QUEUE_MAX_AGE = 30000; // 30 seconds

  // CRITICAL FIX: Direct UI handlers registry to bypass lifecycle manager timing issues
  private uiHandlersRegistry: Map<string, ChatHandlers> = new Map();

  // Monitoring and health check
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private connectionCheckInterval: NodeJS.Timeout | null = null;
  private lastHeartbeat = Date.now();

  // Connection state
  private isConnecting = false;
  private isHealthy = true;

  /**
   * 🔌 Establishes WebSocket connection with enhanced reliability
   */
  connect(): Promise<void> {
    if (this.socket?.connected) {
      console.log('[BulletproofWebSocket] ✅ Already connected');
      return Promise.resolve();
    }

    if (this.isConnecting) {
      console.log('[BulletproofWebSocket] ⏳ Connection already in progress');
      return Promise.resolve();
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      try {
        // Enhanced connection URL determination for multi-host deployment
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = window.location.port;
        
        this.baseUrl = port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
        
        console.log('[BulletproofWebSocket] 🚀 Connecting to:', this.baseUrl);
        console.log('[BulletproofWebSocket] 🏗️ Multi-host deployment mode active');

        this.socket = io(this.baseUrl, {
          path: '/socket.io/',
          // Enhanced transport configuration for multi-host reliability
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 10000,
          timeout: 30000,
          autoConnect: true,
          withCredentials: true,
          tryAllTransports: true,
          forceNew: false,
          closeOnBeforeunload: false,
          query: {
            t: Date.now().toString(),
            deploymentMode: 'multi-host',
            clientVersion: '2.0.0' // Version tracking
          },
          ackTimeout: 15000,
          retries: 3
        });

        // Connection event handlers
        this.socket.on('connect', () => {
          console.log('[BulletproofWebSocket] ✅ Connected successfully');
          console.log('[BulletproofWebSocket] Socket ID:', this.socket?.id);
          console.log('[BulletproofWebSocket] Transport:', this.socket?.io.engine.transport.name);
          
          this.isConnecting = false;
          this.isHealthy = true;
          this.reconnectAttempts = 0;
          this.lastHeartbeat = Date.now();
          
          this.startKeepAlive();
          this.startConnectionCheck();
          
          // Process any queued events after reconnection
          this.processAllQueuedEvents();
          
          resolve();
        });

        this.socket.on('disconnect', (reason) => {
          console.log('[BulletproofWebSocket] ❌ Disconnected:', reason);
          this.isConnecting = false;
          this.isHealthy = false;
          
          this.stopKeepAlive();
          this.stopConnectionCheck();
          
          // Preserve handlers for reconnection in multi-host mode
          if (reason === 'transport close' || reason === 'transport error') {
            console.log('[BulletproofWebSocket] 🛡️ Preserving handlers for multi-host reconnection');
            return;
          }
          
          if (reason !== 'io client disconnect') {
            console.log('[BulletproofWebSocket] 🔄 Will attempt to reconnect automatically...');
            console.log('[BulletproofWebSocket] 🛡️ Preserving UI handlers:', this.uiHandlersRegistry.size);
          }
        });

        this.socket.on('connect_error', (error: SocketIOError) => {
          console.error('[BulletproofWebSocket] ❌ Connection error:', error.message);
          this.isConnecting = false;
          this.isHealthy = false;
          
          this.reconnectAttempts++;
          console.log(`[BulletproofWebSocket] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
          
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.stopKeepAlive();
            this.stopConnectionCheck();
            reject(new Error(`Failed to connect after ${this.maxReconnectAttempts} attempts. Last error: ${error.message}`));
          }
        });

        this.socket.on('reconnect', (attemptNumber) => {
          console.log('[BulletproofWebSocket] ✅ Reconnected after', attemptNumber, 'attempts');
          this.isHealthy = true;
          this.lastHeartbeat = Date.now();
          
          this.startKeepAlive();
          this.startConnectionCheck();
          this.processAllQueuedEvents();
        });

        // Setup chat event handlers
        this.setupChatHandlers();

        // Connection timeout
        setTimeout(() => {
          if (!this.socket?.connected && this.isConnecting) {
            this.isConnecting = false;
            reject(new Error('WebSocket connection timeout - check network and server availability'));
          }
        }, 15000);

      } catch (error) {
        this.isConnecting = false;
        console.error('[BulletproofWebSocket] ❌ Connection setup failed:', error);
        reject(error);
      }
    });
  }

  /**
   * 📤 Sends message with bulletproof ID management
   */
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
      console.log('[BulletproofWebSocket] 🔌 Socket not connected, attempting to connect...');
      await this.connect();
    }

    // Create message with bulletproof ID and lifecycle management
    const { messageId } = messageLifecycleManager.createMessage({
      conversationId: params.conversationId || null,
      userContent: params.content,
      model: params.model,
      visionModel: params.visionModel,
      hasImages: !!(params.images && params.images.length > 0)
    });

    console.log('[BulletproofWebSocket] 📤 Sending message with bulletproof ID:', messageId);

    // CRITICAL FIX: Register handlers in BOTH lifecycle manager AND direct UI registry
    messageLifecycleManager.registerHandlers(messageId, {
      onThinking: handlers.onThinking,
      onGenerating: handlers.onGenerating,
      onToken: handlers.onToken,
      onComplete: handlers.onComplete,
      onError: handlers.onError,
      onConversationCreated: handlers.onConversationCreated
    });

    // CRITICAL FIX: Register UI handlers directly for immediate access
    this.uiHandlersRegistry.set(messageId, handlers);
    console.log('[BulletproofWebSocket] 📝 Registered UI handlers directly for:', messageId);
    console.log('[BulletproofWebSocket] 📊 Total UI handlers registered:', this.uiHandlersRegistry.size);

    // Send message to backend with deterministic ID
    const messageData: ClientEvents['chat:message'] = {
      messageId,
      ...params
    };
    
    try {
      // Use emit with acknowledgment for critical messages
      this.socket!.timeout(15000).emit('chat:message', messageData, (error: any, response: any) => {
        if (error) {
          console.error('[BulletproofWebSocket] ❌ Message send failed:', error);
          messageLifecycleManager.updateMessageState(messageId, 'error', { error: 'Failed to send message' });
        } else {
          console.log('[BulletproofWebSocket] ✅ Message acknowledged by server:', response);
        }
      });

      console.log('[BulletproofWebSocket] ✅ Message sent successfully with ID:', messageId);
      return messageId;

    } catch (error) {
      console.error('[BulletproofWebSocket] ❌ Error sending message:', error);
      messageLifecycleManager.updateMessageState(messageId, 'error', { 
        error: 'Network error while sending message' 
      });
      throw error;
    }
  }

  /**
   * 🎛️ Sets up bulletproof chat event handlers
   */
  private setupChatHandlers() {
    if (!this.socket) return;

    console.log('[BulletproofWebSocket] 🎛️ Setting up bulletproof chat handlers');

    // Enhanced event handlers with bulletproof processing
    this.socket.on('chat:thinking', (data: ServerEvents['chat:thinking']) => {
      console.log('[BulletproofWebSocket] 🤔 Received chat:thinking', data);
      this.processEventSafelyWithUIBridge(data.messageId, 'thinking', data, () => {
        messageLifecycleManager.updateMessageState(data.messageId, 'thinking');
      });
    });

    this.socket.on('chat:generating', (data: ServerEvents['chat:generating']) => {
      console.log('[BulletproofWebSocket] ⚡ Received chat:generating', data);
      this.processEventSafelyWithUIBridge(data.messageId, 'generating', data, () => {
        messageLifecycleManager.updateMessageState(data.messageId, 'generating');
      });
    });

    this.socket.on('chat:token', (data: ServerEvents['chat:token']) => {
      console.log('[BulletproofWebSocket] 🔤 Received chat:token', data.messageId, 'token length:', data.token?.length || 0);
      this.processEventSafelyWithUIBridge(data.messageId, 'token', data, () => {
        messageLifecycleManager.updateMessageState(data.messageId, 'streaming', { token: data.token });
      });
    });

    this.socket.on('chat:complete', (data: ServerEvents['chat:complete']) => {
      console.log('[BulletproofWebSocket] ✅ Received chat:complete', data);
      this.processEventSafelyWithUIBridge(data.messageId, 'complete', data, () => {
        messageLifecycleManager.updateMessageState(data.messageId, 'complete', {
          conversationId: data.conversationId,
          metadata: data.metadata
        });
      });
    });

    this.socket.on('chat:error', (data: ServerEvents['chat:error']) => {
      console.error('[BulletproofWebSocket] ❌ Received chat:error', data);
      this.processEventSafelyWithUIBridge(data.messageId, 'error', data, () => {
        messageLifecycleManager.updateMessageState(data.messageId, 'error', { error: data.error });
      });
    });

    this.socket.on('conversation:created', (data: ServerEvents['conversation:created']) => {
      console.log('[BulletproofWebSocket] 🆕 Received conversation:created', data);
      
      // CRITICAL FIX: Broadcast to all UI handlers directly
      this.uiHandlersRegistry.forEach((handlers, messageId) => {
        try {
          handlers.onConversationCreated?.(data);
          console.log('[BulletproofWebSocket] 🆕 Notified UI handler for message:', messageId);
        } catch (error) {
          console.error('[BulletproofWebSocket] ❌ Error in conversation:created UI handler:', error);
        }
      });
      
      // Update lifecycle manager
      const activeMessages = messageLifecycleManager.getAllActiveMessages();
      activeMessages.forEach(lifecycle => {
        if (!lifecycle.conversationId) {
          lifecycle.conversationId = data.conversationId;
          console.log(`[BulletproofWebSocket] 🆕 Updated message ${lifecycle.id} with conversation ID: ${data.conversationId}`);
        }
      });
    });

    // Heartbeat handling
    this.socket.on('pong', () => {
      console.log('[BulletproofWebSocket] 🏓 Received pong response');
      this.lastHeartbeat = Date.now();
    });
  }

  /**
   * 🛡️ CRITICAL FIX: Processes events with UI bridge for immediate handler execution
   */
  private processEventSafelyWithUIBridge(
    messageId: string, 
    eventName: string, 
    data: any, 
    processor: () => void
  ): void {
    try {
      // CRITICAL FIX: Check UI handlers registry FIRST for immediate processing
      const uiHandlers = this.uiHandlersRegistry.get(messageId);
      
      if (uiHandlers) {
        console.log(`[BulletproofWebSocket] 🎯 Processing ${eventName} for ${messageId} via UI bridge`);
        
        // Execute UI handler immediately
        switch (eventName) {
          case 'thinking':
            uiHandlers.onThinking?.({ messageId });
            break;
          case 'generating':
            uiHandlers.onGenerating?.({ messageId });
            break;
          case 'token':
            uiHandlers.onToken?.({ messageId, token: data.token });
            break;
          case 'complete':
            uiHandlers.onComplete?.({ 
              messageId, 
              conversationId: data.conversationId, 
              metadata: data.metadata 
            });
            // Clean up UI handlers after completion
            this.cleanupUIHandlers(messageId);
            break;
          case 'error':
            uiHandlers.onError?.({ messageId, error: data.error });
            // Clean up UI handlers after error
            this.cleanupUIHandlers(messageId);
            break;
        }
        
        // Also run the lifecycle manager processor
        try {
          processor();
        } catch (error) {
          console.error(`[BulletproofWebSocket] ❌ Error in lifecycle processor for ${messageId}:`, error);
        }
        
        console.log(`[BulletproofWebSocket] ✅ Successfully processed ${eventName} for ${messageId} via UI bridge`);
        return;
      }

      // Fallback to original logic if no UI handlers found
      const lifecycle = messageLifecycleManager.getMessageLifecycle(messageId);
      
      if (lifecycle) {
        processor();
        console.log(`[BulletproofWebSocket] ✅ Processed ${eventName} for ${messageId} via lifecycle manager`);
      } else {
        console.warn(`[BulletproofWebSocket] ⚠️ No handlers found for ${eventName} event: ${messageId} - queuing`);
        this.queueEvent(messageId, eventName, data);
        
        // Log handler status for debugging
        console.log(`[BulletproofWebSocket] 🔍 Available UI handler messageIds:`, Array.from(this.uiHandlersRegistry.keys()));
        console.log(`[BulletproofWebSocket] 🔍 Available lifecycle messageIds:`, messageLifecycleManager.getAllActiveMessages().map(l => l.id));
        
        // Schedule retry processing
        setTimeout(() => {
          this.retryQueuedEvent(messageId, eventName);
        }, 1000);
      }
    } catch (error) {
      console.error(`[BulletproofWebSocket] ❌ Error processing ${eventName} for ${messageId}:`, error);
      this.queueEvent(messageId, eventName, data);
    }
  }

  /**
   * 🧹 CRITICAL FIX: Clean up UI handlers after message completion
   */
  private cleanupUIHandlers(messageId: string, delay: number = 2000): void {
    setTimeout(() => {
      if (this.uiHandlersRegistry.has(messageId)) {
        this.uiHandlersRegistry.delete(messageId);
        console.log(`[BulletproofWebSocket] 🧹 Cleaned up UI handlers for message: ${messageId}`);
        console.log(`[BulletproofWebSocket] 📊 Remaining UI handlers:`, this.uiHandlersRegistry.size);
      }
    }, delay);
  }

  /**
   * 📦 Event queuing for multi-host timing issues
   */
  private queueEvent(messageId: string, eventName: string, data: any): void {
    if (!this.eventQueue.has(messageId)) {
      this.eventQueue.set(messageId, []);
    }
    
    const queue = this.eventQueue.get(messageId)!;
    
    // Prevent queue overflow
    if (queue.length >= this.EVENT_QUEUE_MAX_SIZE) {
      console.warn(`[BulletproofWebSocket] ⚠️ Event queue full for ${messageId}, dropping oldest event`);
      queue.shift();
    }
    
    queue.push({
      event: eventName,
      data,
      timestamp: Date.now(),
      retryCount: 0
    });
    
    console.log(`[BulletproofWebSocket] 📦 Queued ${eventName} for ${messageId} (queue size: ${queue.length})`);
  }

  /**
   * 🔄 Retry processing of queued events
   */
  private retryQueuedEvent(messageId: string, eventName: string): void {
    const queue = this.eventQueue.get(messageId);
    if (!queue || queue.length === 0) return;

    const queuedEvent = queue.find(e => e.event === eventName);
    if (!queuedEvent) return;

    // CRITICAL FIX: Check UI handlers first before lifecycle manager
    const uiHandlers = this.uiHandlersRegistry.get(messageId);
    const lifecycle = messageLifecycleManager.getMessageLifecycle(messageId);
    
    if (uiHandlers || lifecycle) {
      console.log(`[BulletproofWebSocket] 🔄 Retrying queued ${eventName} for ${messageId}`);
      
      // Re-process using the UI bridge
      this.processEventSafelyWithUIBridge(messageId, eventName, queuedEvent.data, () => {
        // Process the event based on type for lifecycle manager
        switch (eventName) {
          case 'thinking':
            messageLifecycleManager.updateMessageState(messageId, 'thinking');
            break;
          case 'generating':
            messageLifecycleManager.updateMessageState(messageId, 'generating');
            break;
          case 'token':
            messageLifecycleManager.updateMessageState(messageId, 'streaming', { token: queuedEvent.data.token });
            break;
          case 'complete':
            messageLifecycleManager.updateMessageState(messageId, 'complete', {
              conversationId: queuedEvent.data.conversationId,
              metadata: queuedEvent.data.metadata
            });
            break;
          case 'error':
            messageLifecycleManager.updateMessageState(messageId, 'error', { error: queuedEvent.data.error });
            break;
        }
      });

      // Remove processed event from queue
      const index = queue.indexOf(queuedEvent);
      if (index > -1) {
        queue.splice(index, 1);
      }

      // Clean up empty queue
      if (queue.length === 0) {
        this.eventQueue.delete(messageId);
      }
    } else {
      // Increment retry count
      queuedEvent.retryCount++;
      
      // Give up after too many retries
      if (queuedEvent.retryCount > 5) {
        console.warn(`[BulletproofWebSocket] ❌ Giving up on queued ${eventName} for ${messageId} after ${queuedEvent.retryCount} retries`);
        const index = queue.indexOf(queuedEvent);
        if (index > -1) {
          queue.splice(index, 1);
        }
      } else {
        // Schedule another retry with exponential backoff
        const delay = Math.min(1000 * Math.pow(2, queuedEvent.retryCount), 10000);
        setTimeout(() => {
          this.retryQueuedEvent(messageId, eventName);
        }, delay);
      }
    }
  }

  /**
   * 🔄 Process all queued events after reconnection
   */
  private processAllQueuedEvents(): void {
    if (this.eventQueue.size === 0) return;

    console.log(`[BulletproofWebSocket] 🔄 Processing ${this.eventQueue.size} queued message events`);
    
    for (const [messageId, queue] of this.eventQueue.entries()) {
      for (const queuedEvent of queue) {
        this.retryQueuedEvent(messageId, queuedEvent.event);
      }
    }
  }

  /**
   * ❌ Cancel message
   */
  cancelMessage(messageId: string): void {
    if (this.socket?.connected) {
      console.log('[BulletproofWebSocket] ❌ Cancelling message:', messageId);
      this.socket.emit('chat:cancel', { messageId });
    }
    
    messageLifecycleManager.cancelMessage(messageId);
    
    // CRITICAL FIX: Clean up UI handlers immediately for cancelled messages
    this.cleanupUIHandlers(messageId, 0);
  }

  /**
   * 🏓 Keep-alive management
   */
  private startKeepAlive(): void {
    this.keepAliveInterval = setInterval(() => {
      if (this.socket?.connected) {
        console.log('[BulletproofWebSocket] 🏓 Sending keepalive ping');
        this.socket.emit('ping');
        this.lastHeartbeat = Date.now();
      }
    }, 25000);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * 📊 Connection health monitoring
   */
  private startConnectionCheck(): void {
    this.connectionCheckInterval = setInterval(() => {
      if (this.socket) {
        const stats = messageLifecycleManager.getStats();
        console.log('[BulletproofWebSocket] 📊 Connection health check:', {
          connected: this.socket.connected,
          transport: this.socket.io.engine.transport.name,
          readyState: this.socket.io.engine.readyState,
          activeMessages: stats.totalMessages,
          uiHandlers: this.uiHandlersRegistry.size,
          queuedEvents: this.getTotalQueuedEvents(),
          lastHeartbeat: Math.round((Date.now() - this.lastHeartbeat) / 1000) + 's ago',
          isHealthy: this.isHealthy
        });

        // Clean up old queued events
        this.cleanOldQueuedEvents();
      }
    }, 60000);
  }

  private stopConnectionCheck(): void {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
      this.connectionCheckInterval = null;
    }
  }

  /**
   * 🧹 Clean up old queued events
   */
  private cleanOldQueuedEvents(): void {
    const now = Date.now();
    
    for (const [messageId, queue] of this.eventQueue.entries()) {
      const validEvents = queue.filter(event => (now - event.timestamp) < this.EVENT_QUEUE_MAX_AGE);
      
      if (validEvents.length !== queue.length) {
        console.log(`[BulletproofWebSocket] 🧹 Cleaned ${queue.length - validEvents.length} old events for ${messageId}`);
      }
      
      if (validEvents.length === 0) {
        this.eventQueue.delete(messageId);
      } else {
        this.eventQueue.set(messageId, validEvents);
      }
    }
  }

  private getTotalQueuedEvents(): number {
    let total = 0;
    this.eventQueue.forEach(queue => total += queue.length);
    return total;
  }

  /**
   * 🔌 Disconnect and cleanup
   */
  disconnect(): void {
    console.log('[BulletproofWebSocket] 🔌 Disconnecting...');
    
    this.stopKeepAlive();
    this.stopConnectionCheck();
    
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    
    // Clear event queue
    this.eventQueue.clear();
    
    // CRITICAL FIX: Clear UI handlers registry
    this.uiHandlersRegistry.clear();
    
    // Shutdown message lifecycle manager
    messageLifecycleManager.shutdown();
    
    this.isHealthy = false;
    console.log('[BulletproofWebSocket] ✅ Disconnected and cleaned up');
  }

  /**
   * 📊 Public API for debugging
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getConnectionInfo() {
    if (!this.socket) return null;
    
    const messageStats = messageLifecycleManager.getStats();
    
    return {
      connected: this.socket.connected,
      id: this.socket.id,
      transport: this.socket.io.engine.transport.name,
      readyState: this.socket.io.engine.readyState,
      reconnectAttempts: this.reconnectAttempts,
      url: this.baseUrl,
      lastHeartbeat: this.lastHeartbeat,
      heartbeatAge: Math.round((Date.now() - this.lastHeartbeat) / 1000),
      isHealthy: this.isHealthy,
      messageStats,
      uiHandlers: this.uiHandlersRegistry.size,
      queuedEvents: this.getTotalQueuedEvents()
    };
  }

  getMessageStates() {
    return messageLifecycleManager.getAllActiveMessages().map(lifecycle => ({
      messageId: lifecycle.id,
      state: lifecycle.state,
      duration: Math.round((Date.now() - lifecycle.createdAt) / 1000),
      lastActivity: Math.round((Date.now() - lifecycle.lastActivity) / 1000),
      tokenCount: lifecycle.tokenCount,
      hasUIHandlers: this.uiHandlersRegistry.has(lifecycle.id)
    }));
  }
}

// Export singleton instance
export const bulletproofWebSocketChatService = new BulletproofWebSocketChatService();

// For backward compatibility, also export as the original name
export const webSocketChatService = bulletproofWebSocketChatService;
