import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { ClientEvents, ServerEvents, Message, ScanProgress } from '@olympian/shared';
import { DatabaseService } from './DatabaseService';
import { ConnectionScanner } from './ConnectionScanner';
import { OllamaStreamliner } from './OllamaStreamliner';
import { ChatMemoryService } from './ChatMemoryService';

export class WebSocketService {
  private io: Server;
  private db: DatabaseService;
  private scanner: ConnectionScanner;
  private streamliner: OllamaStreamliner;
  private memoryService: ChatMemoryService;
  private activeChats: Map<string, AbortController> = new Map();
  private connectedClients: Map<string, Date> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.db = DatabaseService.getInstance();
    this.scanner = new ConnectionScanner();
    this.streamliner = new OllamaStreamliner();
    this.memoryService = ChatMemoryService.getInstance();
  }

  initialize(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`🔌 Client connected: ${socket.id}`);
      logger.info(`📊 Connection details:`, {
        socketId: socket.id,
        transport: socket.conn.transport.name,
        remoteAddress: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        origin: socket.handshake.headers.origin,
        referer: socket.handshake.headers.referer
      });
      
      this.connectedClients.set(socket.id, new Date());

      // Enhanced transport logging
      socket.conn.on('upgrade', () => {
        logger.info(`⬆️ Transport upgraded for ${socket.id}: ${socket.conn.transport.name}`);
      });

      socket.conn.on('upgradeError', (error) => {
        logger.warn(`⚠️ Transport upgrade error for ${socket.id}:`, error);
      });

      // Chat events
      socket.on('chat:message', async (data: ClientEvents['chat:message']) => {
        logger.info(`📨 Received chat:message from ${socket.id}:`, {
          model: data.model,
          contentLength: data.content?.length || 0,
          hasImages: !!data.images?.length,
          imageCount: data.images?.length || 0,
          conversationId: data.conversationId
        });
        await this.handleChatMessage(socket, data);
      });

      socket.on('chat:cancel', (data: ClientEvents['chat:cancel']) => {
        logger.info(`❌ Received chat:cancel from ${socket.id}:`, { messageId: data.messageId });
        this.handleChatCancel(data.messageId);
      });

      socket.on('model:select', async (data: ClientEvents['model:select']) => {
        logger.debug(`🎯 Received model:select from ${socket.id}:`, { model: data.model });
        await this.handleModelSelect(socket, data);
      });

      // Memory management events
      socket.on('memory:stats', async (data: { conversationId: string }) => {
        logger.debug(`📊 Received memory:stats from ${socket.id}:`, { conversationId: data.conversationId });
        await this.handleMemoryStats(socket, data);
      });

      socket.on('memory:clear', async (data: { conversationId: string; keepLast?: number }) => {
        logger.info(`🧹 Received memory:clear from ${socket.id}:`, data);
        await this.handleMemoryClear(socket, data);
      });

      // Connection scanning events
      socket.on('scan:start', async (data: ClientEvents['scan:start']) => {
        logger.info(`🔍 Received scan:start from ${socket.id}:`, { types: data.types });
        await this.handleScanStart(socket, data);
      });

      socket.on('connection:test', async (data: ClientEvents['connection:test']) => {
        logger.debug(`🧪 Received connection:test from ${socket.id}:`, { connectionId: data.connectionId });
        await this.handleConnectionTest(socket, data);
      });

      // Keep-alive ping/pong with enhanced logging
      socket.on('ping', () => {
        logger.debug(`🏓 Received ping from ${socket.id}, responding with pong`);
        socket.emit('pong');
      });

      socket.on('disconnect', (reason) => {
        const connectionDuration = this.connectedClients.get(socket.id);
        if (connectionDuration) {
          const duration = Date.now() - connectionDuration.getTime();
          logger.info(`🔌 Client disconnected: ${socket.id}`, {
            reason,
            duration: `${duration}ms`,
            transport: socket.conn.transport.name
          });
          this.connectedClients.delete(socket.id);
        } else {
          logger.info(`🔌 Client disconnected: ${socket.id}, reason: ${reason}`);
        }
        
        // Clean up any active chats for this socket
        let cleanedUp = 0;
        this.activeChats.forEach((controller, messageId) => {
          if (messageId.includes(socket.id)) {
            controller.abort();
            this.activeChats.delete(messageId);
            cleanedUp++;
          }
        });
        
        if (cleanedUp > 0) {
          logger.info(`🧹 Cleaned up ${cleanedUp} active chats for disconnected client ${socket.id}`);
        }
      });

      // Error handling
      socket.on('error', (error) => {
        logger.error(`❌ Socket error for ${socket.id}:`, error);
      });
    });

    // Setup scanner event listeners
    this.scanner.on('progress', (progress: ScanProgress) => {
      logger.debug('📡 Broadcasting scan progress to all clients:', progress);
      this.io.emit('scan:progress', progress);
    });

    // Enhanced connection statistics
    setInterval(() => {
      const clientCount = this.connectedClients.size;
      const activeChats = this.activeChats.size;
      
      if (clientCount > 0 || activeChats > 0) {
        logger.debug(`📊 WebSocket status: ${clientCount} connected clients, ${activeChats} active chats`);
        
        // Log transport distribution
        const transports: { [key: string]: number } = {};
        this.io.sockets.sockets.forEach(socket => {
          const transport = socket.conn.transport.name;
          transports[transport] = (transports[transport] || 0) + 1;
        });
        
        if (Object.keys(transports).length > 0) {
          logger.debug('🚗 Transport distribution:', transports);
        }
      }
    }, 60000); // Every minute
  }

  private async handleChatMessage(
    socket: Socket,
    data: ClientEvents['chat:message']
  ): Promise<void> {
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const abortController = new AbortController();
    this.activeChats.set(messageId, abortController);

    logger.info(`🚀 Starting chat message processing`, {
      messageId,
      socketId: socket.id,
      model: data.model,
      hasImages: !!data.images?.length,
      imageCount: data.images?.length || 0,
      hasVisionModel: !!data.visionModel,
      conversationId: data.conversationId,
      contentPreview: data.content.substring(0, 100) + (data.content.length > 100 ? '...' : '')
    });

    try {
      // Emit thinking state with enhanced logging
      logger.info(`🤔 Emitting thinking state for message ${messageId} to socket ${socket.id}`);
      socket.emit('chat:thinking', { messageId });
      logger.debug(`✅ thinking event emitted successfully for ${messageId}`);

      // Get or create conversation
      let conversationId: string;
      if (data.conversationId) {
        conversationId = data.conversationId;
        logger.debug(`Using existing conversation: ${conversationId}`);
      } else {
        const conversation = await this.db.conversations.insertOne({
          title: data.content.substring(0, 50) + '...',
          model: data.model,
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 0,
        });
        conversationId = conversation.insertedId.toString();
        logger.info(`📝 Created new conversation: ${conversationId}`);
        
        // Emit new conversation created
        logger.info(`🆕 Emitting conversation:created for ${conversationId} to socket ${socket.id}`);
        socket.emit('conversation:created', { conversationId });
        logger.debug(`✅ conversation:created event emitted successfully`);
      }

      // Save user message BEFORE processing to ensure it's in history
      await this.db.messages.insertOne({
        conversationId,
        role: 'user',
        content: data.content,
        images: data.images,
        createdAt: new Date(),
      });
      logger.debug(`💾 Saved user message to database for conversation ${conversationId}`);

      // Process the request with conversation history
      logger.info(`⚙️ Processing request for model ${data.model} with streamliner`);
      const processedRequest = await this.streamliner.processRequest({
        ...data,
        conversationId,
      });
      logger.info(`✅ Request processed successfully`, {
        model: processedRequest.model,
        messageCount: processedRequest.messages.length
      });

      // Emit generating state with enhanced logging
      logger.info(`⚡ Emitting generating state for message ${messageId} to socket ${socket.id}`);
      socket.emit('chat:generating', { messageId });
      logger.debug(`✅ generating event emitted successfully for ${messageId}`);

      // Stream the response
      let assistantContent = '';
      const startTime = Date.now();
      let tokenCount = 0;
      let firstTokenTime: number | null = null;

      logger.info(`🌊 Starting stream chat for message ${messageId}`);

      await this.streamliner.streamChat(processedRequest, (token: string) => {
        if (abortController.signal.aborted) {
          logger.warn(`❌ Chat cancelled for message ${messageId}`);
          throw new Error('Chat cancelled');
        }
        
        assistantContent += token;
        tokenCount++;
        
        if (tokenCount === 1) {
          firstTokenTime = Date.now();
          logger.info(`🎯 First token received for message ${messageId}, latency: ${firstTokenTime - startTime}ms`);
          logger.info(`📤 First token received and sent to client`);
        }
        
        // Emit token to client with enhanced logging
        if (tokenCount <= 5 || tokenCount % 20 === 0) {
          logger.debug(`🔤 Emitting token ${tokenCount} for message ${messageId} to socket ${socket.id}`);
        }
        
        socket.emit('chat:token', { messageId, token });
        
        if (tokenCount === 1) {
          logger.info(`✅ First token successfully emitted to client ${socket.id}`);
        }
      });

      const totalTime = Date.now() - startTime;
      logger.info(`🏁 Stream completed for message ${messageId}`, {
        totalTokens: tokenCount,
        totalTime: `${totalTime}ms`,
        firstTokenLatency: firstTokenTime ? `${firstTokenTime - startTime}ms` : 'N/A',
        contentLength: assistantContent.length,
        tokensPerSecond: tokenCount > 0 ? Math.round((tokenCount / totalTime) * 1000) : 0,
        socketId: socket.id
      });

      // Save assistant message
      const assistantMessage: Message = {
        conversationId,
        role: 'assistant',
        content: assistantContent,
        metadata: {
          model: data.model,
          tokens: tokenCount,
          generationTime: totalTime,
        },
        createdAt: new Date(),
      };
      await this.db.messages.insertOne(assistantMessage);
      logger.debug(`💾 Saved assistant message to database (${assistantContent.length} chars)`);

      // Update conversation
      await this.db.conversations.updateOne(
        { _id: conversationId },
        {
          $set: { updatedAt: new Date() },
          $inc: { messageCount: 2 },
        }
      );

      // Check if we should clear old messages (auto-cleanup)
      const stats = await this.memoryService.getMemoryStats(conversationId);
      if (stats.messageCount > 200) {
        logger.info(`🧹 Auto-clearing old messages for conversation ${conversationId}`);
        await this.memoryService.clearOldMessages(conversationId, 100);
      }

      // Emit completion with enhanced logging
      logger.info(`🎉 Emitting completion for message ${messageId} to socket ${socket.id}`);
      socket.emit('chat:complete', {
        messageId,
        conversationId,
        metadata: assistantMessage.metadata!,
      });
      logger.info(`✅ Chat completed successfully for message ${messageId}`);

    } catch (error) {
      logger.error(`❌ Chat error for message ${messageId}:`, {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
        messageId,
        socketId: socket.id,
        model: data.model,
        hasImages: !!data.images?.length
      });
      
      logger.info(`📤 Emitting error for message ${messageId} to socket ${socket.id}`);
      socket.emit('chat:error', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      logger.debug(`✅ error event emitted for ${messageId}`);
    } finally {
      this.activeChats.delete(messageId);
      logger.debug(`🧹 Cleaned up active chat for message ${messageId}`);
    }
  }

  private handleChatCancel(messageId: string): void {
    const controller = this.activeChats.get(messageId);
    if (controller) {
      logger.info(`❌ Cancelling chat for message ${messageId}`);
      controller.abort();
      this.activeChats.delete(messageId);
    } else {
      logger.warn(`⚠️ Attempted to cancel non-existent chat: ${messageId}`);
    }
  }

  private async handleModelSelect(
    socket: Socket,
    data: ClientEvents['model:select']
  ): Promise<void> {
    try {
      logger.debug(`🎯 Model selected by ${socket.id}: ${data.model}`);
      const capabilities = await this.streamliner.detectCapabilities(data.model);
      socket.emit('model:capabilities', capabilities);
      logger.debug(`✅ Emitted capabilities for model ${data.model} to ${socket.id}:`, capabilities);
    } catch (error) {
      logger.error(`❌ Model select error for ${socket.id}:`, error);
    }
  }

  private async handleMemoryStats(
    socket: Socket,
    data: { conversationId: string }
  ): Promise<void> {
    try {
      const stats = await this.memoryService.getMemoryStats(data.conversationId);
      socket.emit('memory:stats', { conversationId: data.conversationId, stats });
      logger.debug(`📊 Emitted memory stats for conversation ${data.conversationId} to ${socket.id}`);
    } catch (error) {
      logger.error(`❌ Memory stats error for ${socket.id}:`, error);
      socket.emit('memory:error', {
        error: error instanceof Error ? error.message : 'Failed to get memory stats',
      });
    }
  }

  private async handleMemoryClear(
    socket: Socket,
    data: { conversationId: string; keepLast?: number }
  ): Promise<void> {
    try {
      const keepLast = data.keepLast || 100;
      await this.memoryService.clearOldMessages(data.conversationId, keepLast);
      socket.emit('memory:cleared', {
        conversationId: data.conversationId,
        message: `Old messages cleared, keeping last ${keepLast} messages`,
      });
      logger.info(`🧹 Memory cleared for conversation ${data.conversationId}, keeping ${keepLast} messages`);
    } catch (error) {
      logger.error(`❌ Memory clear error for ${socket.id}:`, error);
      socket.emit('memory:error', {
        error: error instanceof Error ? error.message : 'Failed to clear messages',
      });
    }
  }

  private async handleScanStart(
    socket: Socket,
    data: ClientEvents['scan:start']
  ): Promise<void> {
    try {
      logger.info(`🔍 Starting scan for ${socket.id} with types:`, data.types);
      const results = await this.scanner.scan(data.types);
      
      // Save results to database
      for (const result of results) {
        await this.db.connections.updateOne(
          { endpoint: result.endpoint },
          {
            $set: {
              ...result,
              updatedAt: new Date(),
              isManual: false,
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      }

      socket.emit('scan:complete', { results });
      logger.info(`✅ Scan completed for ${socket.id}, found ${results.length} results`);
    } catch (error) {
      logger.error(`❌ Scan error for ${socket.id}:`, error);
      socket.emit('scan:error', {
        error: error instanceof Error ? error.message : 'Scan failed',
      });
    }
  }

  private async handleConnectionTest(
    socket: Socket,
    data: ClientEvents['connection:test']
  ): Promise<void> {
    try {
      const connection = await this.db.connections.findOne({
        _id: data.connectionId,
      });

      if (!connection) {
        socket.emit('connection:test:result', {
          success: false,
          message: 'Connection not found',
        });
        return;
      }

      const isOnline = await this.scanner.testConnection(connection);
      
      // Update connection status
      await this.db.connections.updateOne(
        { _id: data.connectionId },
        {
          $set: {
            status: isOnline ? 'online' : 'offline',
            lastChecked: new Date(),
          },
        }
      );

      socket.emit('connection:status', {
        connectionId: data.connectionId,
        status: isOnline ? 'online' : 'offline',
      });
      
      logger.debug(`🧪 Connection test completed for ${socket.id}: ${data.connectionId} is ${isOnline ? 'online' : 'offline'}`);
    } catch (error) {
      logger.error(`❌ Connection test error for ${socket.id}:`, error);
    }
  }

  // Method to get service statistics
  getStats() {
    return {
      connectedClients: this.connectedClients.size,
      activeChats: this.activeChats.size,
      clientDetails: Array.from(this.io.sockets.sockets.values()).map(socket => ({
        id: socket.id,
        transport: socket.conn.transport.name,
        connected: socket.connected,
        address: socket.handshake.address
      }))
    };
  }
}
