import { MongoClient, Db, Collection, IndexSpecification } from 'mongodb';
import { logger } from '../utils/logger';
import { getDeploymentConfig } from '../config/deployment';
import { Conversation, Message, Connection } from '@olympian/shared';

export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private deploymentConfig = getDeploymentConfig();
  private retryCount = 0;
  private maxRetries = 5;
  private retryDelay = 2000; // Start with 2 seconds

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  async connect(connectionString?: string): Promise<void> {
    const uri = connectionString || this.deploymentConfig.mongodb.uri;
    
    logger.info(`Connecting to MongoDB in ${this.deploymentConfig.mode} mode...`);
    logger.info(`MongoDB URI: ${uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials
    
    while (this.retryCount < this.maxRetries) {
      try {
        // Enhanced connection options for multi-host deployments
        const connectionOptions = {
          ...this.deploymentConfig.mongodb.options,
          serverSelectionTimeoutMS: this.deploymentConfig.mode === 'multi-host' ? 10000 : 5000,
          connectTimeoutMS: this.deploymentConfig.mode === 'multi-host' ? 10000 : 5000,
          maxPoolSize: 10,
          minPoolSize: 1,
          retryWrites: true,
          retryReads: true,
        };

        this.client = new MongoClient(uri, connectionOptions);
        await this.client.connect();
        
        // Test the connection
        await this.client.db().admin().ping();
        
        this.db = this.client.db();
        
        // Ensure collections and indexes
        await this.ensureSchema();
        
        logger.info('Database connected successfully');
        this.retryCount = 0; // Reset retry count on success
        return;
        
      } catch (error) {
        this.retryCount++;
        const isLastAttempt = this.retryCount >= this.maxRetries;
        
        logger.error(`Database connection attempt ${this.retryCount}/${this.maxRetries} failed:`, error);
        
        if (isLastAttempt) {
          logger.error('Max database connection retries exceeded');
          throw new Error(`Database connection failed after ${this.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        
        // Exponential backoff with jitter
        const delay = this.retryDelay * Math.pow(2, this.retryCount - 1) + Math.random() * 1000;
        logger.info(`Retrying database connection in ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        logger.info('Database disconnected');
      } catch (error) {
        logger.error('Error during database disconnect:', error);
      } finally {
        this.client = null;
        this.db = null;
      }
    }
  }

  private async ensureSchema(): Promise<void> {
    if (!this.db) throw new Error('Database not connected');

    try {
      const collections: Array<{ name: string; indexes: IndexSpecification[] }> = [
        { 
          name: 'conversations', 
          indexes: [
            { createdAt: -1 } as IndexSpecification,
            { updatedAt: -1 } as IndexSpecification
          ] 
        },
        { 
          name: 'messages', 
          indexes: [
            { conversationId: 1, createdAt: 1 } as IndexSpecification,
            { content: 'text' } as IndexSpecification
          ] 
        },
        { 
          name: 'connections', 
          indexes: [
            { type: 1 } as IndexSpecification,
            { status: 1 } as IndexSpecification
          ] 
        },
        { 
          name: 'config', 
          indexes: [
            { key: 1 } as IndexSpecification
          ] 
        },
      ];

      for (const { name, indexes } of collections) {
        try {
          const exists = await this.db.listCollections({ name }).hasNext();
          if (!exists) {
            await this.db.createCollection(name);
            logger.info(`Created collection: ${name}`);
          }

          const collection = this.db.collection(name);
          for (const index of indexes) {
            try {
              await collection.createIndex(index);
            } catch (indexError) {
              // Index creation failures are usually non-critical (e.g., index already exists)
              logger.warn(`Failed to create index on ${name}:`, indexError);
            }
          }
        } catch (collectionError) {
          logger.error(`Failed to set up collection ${name}:`, collectionError);
          // Continue with other collections
        }
      }
      
      logger.info('Database schema initialization completed');
    } catch (error) {
      logger.error('Schema initialization failed:', error);
      // Don't throw here - allow the application to continue with basic functionality
    }
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      if (!this.client || !this.db) {
        return false;
      }
      
      await this.client.db().admin().ping();
      return true;
    } catch (error) {
      logger.warn('Database health check failed:', error);
      return false;
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
