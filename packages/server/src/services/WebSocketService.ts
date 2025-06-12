import { Server, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import { ClientEvents, ServerEvents, Message, ScanProgress } from '@olympian/shared';
import { DatabaseService } from './DatabaseService';
import { ConnectionScanner } from './ConnectionScanner';
import { OllamaStreamliner } from './OllamaStreamliner';

export class WebSocketService {
  private io: Server;
  private db: DatabaseService;
  private scanner: ConnectionScanner;
  private streamliner: OllamaStreamliner;
  private activeChats: Map<string, AbortController> = new Map();

  constructor(io: Server) {
    this.io = io;
    this.db = DatabaseService.getInstance();
    this.scanner = new ConnectionScanner();
    this.streamliner = new OllamaStreamliner();
  }

  initialize(): void {
    this.io.on('connection', (socket: Socket) => {
      logger.info(`Client connected: ${socket.id}`);

      // Chat events
      socket.on('chat:message', async (data: ClientEvents['chat:message']) => {
        await this.handleChatMessage(socket, data);
      });

      socket.on('chat:cancel', (data: ClientEvents['chat:cancel']) => {
        this.handleChatCancel(data.messageId);
      });

      socket.on('model:select', async (data: ClientEvents['model:select']) => {
        await this.handleModelSelect(socket, data);
      });

      // Connection scanning events
      socket.on('scan:start', async (data: ClientEvents['scan:start']) => {
        await this.handleScanStart(socket, data);
      });

      socket.on('connection:test', async (data: ClientEvents['connection:test']) => {
        await this.handleConnectionTest(socket, data);
      });

      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    // Setup scanner event listeners
    this.scanner.on('progress', (progress: ScanProgress) => {
      this.io.emit('scan:progress', progress);
    });
  }

  private async handleChatMessage(
    socket: Socket,
    data: ClientEvents['chat:message']
  ): Promise<void> {
    const messageId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const abortController = new AbortController();
    this.activeChats.set(messageId, abortController);

    try {
      // Emit thinking state
      socket.emit('chat:thinking', { messageId });

      // Process the request
      const processedRequest = await this.streamliner.processRequest(data);

      // Get or create conversation
      let conversationId: string;
      if (data.conversationId) {
        conversationId = data.conversationId;
      } else {
        const conversation = await this.db.conversations.insertOne({
          title: data.content.substring(0, 50) + '...',
          model: data.model,
          createdAt: new Date(),
          updatedAt: new Date(),
          messageCount: 0,
        });
        conversationId = conversation.insertedId.toString();
      }

      // Save user message
      await this.db.messages.insertOne({
        conversationId,
        role: 'user',
        content: data.content,
        images: data.images,
        createdAt: new Date(),
      });

      // Emit generating state
      socket.emit('chat:generating', { messageId });

      // Stream the response
      let assistantContent = '';
      const startTime = Date.now();
      let tokenCount = 0;

      await this.streamliner.streamChat(processedRequest, (token: string) => {
        if (abortController.signal.aborted) {
          throw new Error('Chat cancelled');
        }
        assistantContent += token;
        tokenCount++;
        socket.emit('chat:token', { messageId, token });
      });

      // Save assistant message
      const assistantMessage: Message = {
        conversationId,
        role: 'assistant',
        content: assistantContent,
        metadata: {
          model: data.model,
          tokens: tokenCount,
          generationTime: Date.now() - startTime,
        },
        createdAt: new Date(),
      };
      await this.db.messages.insertOne(assistantMessage);

      // Update conversation
      await this.db.conversations.updateOne(
        { _id: conversationId },
        {
          $set: { updatedAt: new Date() },
          $inc: { messageCount: 2 },
        }
      );

      // Emit completion
      socket.emit('chat:complete', {
        messageId,
        metadata: assistantMessage.metadata!,
      });
    } catch (error) {
      logger.error('Chat error:', error);
      socket.emit('chat:error', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      this.activeChats.delete(messageId);
    }
  }

  private handleChatCancel(messageId: string): void {
    const controller = this.activeChats.get(messageId);
    if (controller) {
      controller.abort();
      this.activeChats.delete(messageId);
    }
  }

  private async handleModelSelect(
    socket: Socket,
    data: ClientEvents['model:select']
  ): Promise<void> {
    try {
      const capabilities = await this.streamliner.detectCapabilities(data.model);
      socket.emit('model:capabilities', capabilities);
    } catch (error) {
      logger.error('Model select error:', error);
    }
  }

  private async handleScanStart(
    socket: Socket,
    data: ClientEvents['scan:start']
  ): Promise<void> {
    try {
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
    } catch (error) {
      logger.error('Scan error:', error);
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
    } catch (error) {
      logger.error('Connection test error:', error);
    }
  }
}