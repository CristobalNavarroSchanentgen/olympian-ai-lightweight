import { MongoClient, Db, Collection } from 'mongodb';
import { logger } from '../utils/logger';
import { mongoConfig } from '../config/database';
import { Conversation, Message, Connection } from '@olympian/shared';

export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient | null = null;
  private db: Db | null = null;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(connectionString: string = mongoConfig.connectionString): Promise<void> {
    try {
      this.client = new MongoClient(connectionString, mongoConfig.options);
      await this.client.connect();
      this.db = this.client.db();
      
      // Ensure collections and indexes
      await this.ensureSchema();
      
      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Database connection failed:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      logger.info('Database disconnected');
    }
  }

  private async ensureSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    const collections = [
      { name: 'conversations', indexes: [{ createdAt: -1 }, { updatedAt: -1 }] },
      { name: 'messages', indexes: [{ conversationId: 1, createdAt: 1 }, { content: 'text' }] },
      { name: 'connections', indexes: [{ type: 1 }, { status: 1 }] },
      { name: 'config', indexes: [{ key: 1 }] },
    ];

    for (const { name, indexes } of collections) {
      const exists = await this.db.listCollections({ name }).hasNext();
      if (!exists) {
        await this.db.createCollection(name);
      }

      const collection = this.db.collection(name);
      for (const index of indexes) {
        await collection.createIndex(index);
      }
    }
  }

  // Collections
  get conversations(): Collection<Conversation> {
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection<Conversation>('conversations');
  }

  get messages(): Collection<Message> {
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection<Message>('messages');
  }

  get connections(): Collection<Connection> {
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection<Connection>('connections');
  }

  get config(): Collection<{ key: string; value: unknown }> {
    if (!this.db) throw new Error('Database not connected');
    return this.db.collection<{ key: string; value: unknown }>('config');
  }
}