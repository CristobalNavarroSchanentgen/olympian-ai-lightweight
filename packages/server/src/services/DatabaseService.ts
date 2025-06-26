import { MongoClient, Db, Collection, ServerApiVersion, CreateIndexesOptions } from 'mongodb';
import { Message, Conversation, ArtifactDocument } from '@olympian/shared';

export interface DatabaseCollections {
  conversations: Collection<Conversation>;
  messages: Collection<Message>;
  artifacts: Collection<ArtifactDocument>; // NEW: Artifacts collection
  connections: Collection<any>;
  config: Collection<any>;
}

export class DatabaseService {
  private static instance: DatabaseService;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  
  // Collection references
  public conversations!: Collection<Conversation>;
  public messages!: Collection<Message>;
  public artifacts!: Collection<ArtifactDocument>; // NEW: Artifacts collection
  public connections!: Collection<any>;
  public config!: Collection<any>;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  // NEW: Add isHealthy property for multi-host deployment (Subproject 3)
  public get isHealthy(): boolean {
    return this.isConnected();
  }

  public async connect(uri: string): Promise<void> {
    try {
      console.log('🔌 [DatabaseService] Connecting to MongoDB...');
      
      // Check deployment mode to configure MongoDB client appropriately
      const deploymentMode = process.env.DEPLOYMENT_MODE || 'single-host';
      const isMultiHost = deploymentMode === 'multi-host';
      
      // For multi-host deployment (subproject 3), disable strict mode to support text indexes
      const clientOptions: any = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      if (isMultiHost) {
        console.log('🌐 [DatabaseService] Multi-host deployment detected - using compatible MongoDB settings');
        // Use compatible settings for multi-host deployment
        clientOptions.serverApi = {
          version: ServerApiVersion.v1,
          strict: false, // Disable strict mode for text index compatibility
          deprecationErrors: false,
        };
      } else {
        console.log('🏠 [DatabaseService] Single-host deployment - using strict MongoDB settings');
        // Use strict settings for single-host deployments
        clientOptions.serverApi = {
          version: ServerApiVersion.v1,
          strict: true,
          deprecationErrors: true,
        };
      }
      
      this.client = new MongoClient(uri, clientOptions);

      await this.client.connect();
      
      // Test the connection
      await this.client.db('admin').command({ ping: 1 });
      console.log('✅ [DatabaseService] Successfully connected to MongoDB!');

      // Initialize database and collections
      this.db = this.client.db('olympian-ai');
      await this.initializeCollections();
      
    } catch (error) {
      console.error('❌ [DatabaseService] Failed to connect to MongoDB:', error);
      throw error;
    }
  }

  private async initializeCollections(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    console.log('🏗️ [DatabaseService] Initializing collections...');

    // Initialize collections
    this.conversations = this.db.collection<Conversation>('conversations');
    this.messages = this.db.collection<Message>('messages');
    this.artifacts = this.db.collection<ArtifactDocument>('artifacts'); // NEW
    this.connections = this.db.collection('connections');
    this.config = this.db.collection('config');

    // Create indexes
    await this.createIndexes();
    
    console.log('✅ [DatabaseService] Collections initialized');
  }

  private async createIndexes(): Promise<void> {
    console.log('📊 [DatabaseService] Creating indexes...');

    try {
      // Existing conversation indexes
      await this.conversations.createIndex({ createdAt: -1 });
      await this.conversations.createIndex({ updatedAt: -1 });

      // Existing message indexes
      await this.messages.createIndex({ conversationId: 1, createdAt: 1 });
      
      // Text index for content search - only create if not in strict mode
      const deploymentMode = process.env.DEPLOYMENT_MODE || 'single-host';
      const isMultiHost = deploymentMode === 'multi-host';
      
      try {
        await this.messages.createIndex({ content: 'text' });
        console.log('✅ [DatabaseService] Text index created for message content search');
      } catch (textIndexError: any) {
        if (textIndexError.code === 323 || textIndexError.codeName === 'APIStrictError') {
          console.log('ℹ️ [DatabaseService] Skipping text index due to strict API mode - using alternative indexing');
          // Create a regular index on content for basic search capabilities
          await this.messages.createIndex({ content: 1 });
        } else {
          throw textIndexError;
        }
      }

      // NEW: Comprehensive artifact indexes for multi-host optimization
      console.log('📊 [DatabaseService] Creating artifact indexes...');
      
      // Primary indexes for artifact retrieval
      await this.artifacts.createIndex({ conversationId: 1 }, { 
        name: 'artifacts_conversation_idx',
        background: true 
      });
      
      await this.artifacts.createIndex({ messageId: 1 }, { 
        name: 'artifacts_message_idx',
        background: true 
      });
      
      // Compound index for conversation + creation order
      await this.artifacts.createIndex(
        { conversationId: 1, createdAt: 1 }, 
        { 
          name: 'artifacts_conversation_time_idx',
          background: true 
        }
      );
      
      // Unique index on client-compatible ID
      await this.artifacts.createIndex({ id: 1 }, { 
        unique: true,
        name: 'artifacts_client_id_unique',
        background: true 
      });
      
      // Multi-host coordination indexes
      await this.artifacts.createIndex({ checksum: 1 }, { 
        name: 'artifacts_checksum_idx',
        background: true 
      });
      
      await this.artifacts.createIndex({ 'metadata.syncStatus': 1 }, { 
        name: 'artifacts_sync_status_idx',
        background: true 
      });
      
      await this.artifacts.createIndex({ serverInstance: 1, updatedAt: -1 }, { 
        name: 'artifacts_server_time_idx',
        background: true 
      });
      
      // Performance optimization indexes
      await this.artifacts.createIndex({ lastAccessedAt: -1 }, { 
        name: 'artifacts_access_time_idx',
        background: true,
        expireAfterSeconds: 2592000 // 30 days TTL for cache management
      });
      
      // Compound index for conflict detection
      await this.artifacts.createIndex(
        { conversationId: 1, id: 1, version: -1 }, 
        { 
          name: 'artifacts_conflict_detection_idx',
          background: true 
        }
      );

      // Existing connection and config indexes
      await this.connections.createIndex({ type: 1 });
      await this.connections.createIndex({ status: 1 });
      await this.config.createIndex({ key: 1 }, { unique: true });

      console.log('✅ [DatabaseService] All indexes created successfully');
      
    } catch (error) {
      console.error('❌ [DatabaseService] Failed to create indexes:', error);
      throw error;
    }
  }

  /**
   * NEW: Get artifacts collection with enhanced typing
   */
  public getArtifactsCollection(): Collection<ArtifactDocument> {
    if (!this.artifacts) {
      throw new Error('Artifacts collection not initialized');
    }
    return this.artifacts;
  }

  /**
   * NEW: Get all collections for transaction operations
   */
  public getAllCollections(): DatabaseCollections {
    return {
      conversations: this.conversations,
      messages: this.messages,
      artifacts: this.artifacts,
      connections: this.connections,
      config: this.config,
    };
  }

  /**
   * NEW: Health check specifically for artifacts collection
   */
  public async checkArtifactsHealth(): Promise<{
    isHealthy: boolean;
    totalCount: number;
    conflictCount: number;
    syncedCount: number;
    indexes: string[];
    issues: string[];
  }> {
    try {
      const [totalCount, conflictCount, syncedCount, indexInfo] = await Promise.all([
        this.artifacts.countDocuments({}),
        this.artifacts.countDocuments({ 'metadata.syncStatus': 'conflict' }),
        this.artifacts.countDocuments({ 'metadata.syncStatus': 'synced' }),
        this.artifacts.listIndexes().toArray()
      ]);

      const expectedIndexes = [
        'artifacts_conversation_idx',
        'artifacts_message_idx', 
        'artifacts_conversation_time_idx',
        'artifacts_client_id_unique',
        'artifacts_checksum_idx',
        'artifacts_sync_status_idx',
        'artifacts_server_time_idx',
        'artifacts_access_time_idx',
        'artifacts_conflict_detection_idx'
      ];

      const actualIndexes = indexInfo.map(idx => idx.name || '').filter(name => name);
      const missingIndexes = expectedIndexes.filter(idx => !actualIndexes.includes(idx));
      
      const issues: string[] = [];
      if (missingIndexes.length > 0) {
        issues.push(`Missing indexes: ${missingIndexes.join(', ')}`);
      }
      
      if (conflictCount > 0) {
        issues.push(`${conflictCount} artifacts have sync conflicts`);
      }

      return {
        isHealthy: issues.length === 0,
        totalCount,
        conflictCount,
        syncedCount,
        indexes: actualIndexes,
        issues
      };
      
    } catch (error) {
      console.error('❌ [DatabaseService] Artifacts health check failed:', error);
      return {
        isHealthy: false,
        totalCount: 0,
        conflictCount: 0,
        syncedCount: 0,
        indexes: [],
        issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * NEW: Initialize artifacts collection with validation schema
   */
  public async initializeArtifactsWithSchema(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    try {
      // Check if collection exists
      const collections = await this.db.listCollections({ name: 'artifacts' }).toArray();
      
      if (collections.length === 0) {
        console.log('🎨 [DatabaseService] Creating artifacts collection with schema validation...');
        
        // Create collection with JSON Schema validation
        await this.db.createCollection('artifacts', {
          validator: {
            $jsonSchema: {
              bsonType: 'object',
              required: ['id', 'conversationId', 'title', 'type', 'content', 'version', 'checksum', 'metadata'],
              properties: {
                id: {
                  bsonType: 'string',
                  description: 'Client-compatible artifact ID - required'
                },
                conversationId: {
                  bsonType: 'string', 
                  description: 'Reference to conversation - required'
                },
                messageId: {
                  bsonType: 'string',
                  description: 'Reference to message that created artifact'
                },
                title: {
                  bsonType: 'string',
                  minLength: 1,
                  maxLength: 200,
                  description: 'Artifact title - required and non-empty'
                },
                type: {
                  enum: ['text', 'code', 'html', 'react', 'svg', 'mermaid', 'json', 'csv', 'markdown'],
                  description: 'Artifact type - must be valid type'
                },
                content: {
                  bsonType: 'string',
                  description: 'Artifact content - required'
                },
                language: {
                  bsonType: 'string',
                  description: 'Programming language for code artifacts'
                },
                version: {
                  bsonType: 'int',
                  minimum: 1,
                  description: 'Version number - must be positive integer'
                },
                checksum: {
                  bsonType: 'string',
                  minLength: 1,
                  description: 'Content checksum for integrity verification'
                },
                serverInstance: {
                  bsonType: 'string',
                  description: 'Server instance identifier'
                },
                createdAt: {
                  bsonType: 'date',
                  description: 'Creation timestamp'
                },
                updatedAt: {
                  bsonType: 'date', 
                  description: 'Last update timestamp'
                },
                lastAccessedAt: {
                  bsonType: 'date',
                  description: 'Last access timestamp for cache management'
                },
                metadata: {
                  bsonType: 'object',
                  required: ['syncStatus', 'codeBlocksRemoved', 'detectionStrategy', 'originalContent', 'reconstructionHash', 'contentSize'],
                  properties: {
                    syncStatus: {
                      enum: ['synced', 'pending', 'conflict', 'error'],
                      description: 'Synchronization status'
                    },
                    codeBlocksRemoved: {
                      bsonType: 'bool',
                      description: 'Whether code blocks were removed'
                    },
                    detectionStrategy: {
                      bsonType: 'string',
                      description: 'How artifact was detected'
                    },
                    originalContent: {
                      bsonType: 'string', 
                      description: 'Original content before processing'
                    },
                    reconstructionHash: {
                      bsonType: 'string',
                      description: 'Hash for reconstruction verification'
                    },
                    contentSize: {
                      bsonType: 'int',
                      minimum: 0,
                      description: 'Content size in bytes'
                    }
                  }
                }
              }
            }
          },
          validationAction: 'error',
          validationLevel: 'strict'
        });
        
        console.log('✅ [DatabaseService] Artifacts collection created with validation schema');
      } else {
        console.log('📋 [DatabaseService] Artifacts collection already exists');
      }
      
      // Initialize the collection reference
      this.artifacts = this.db.collection<ArtifactDocument>('artifacts');
      
    } catch (error) {
      console.error('❌ [DatabaseService] Failed to initialize artifacts collection:', error);
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client) {
      console.log('🔌 [DatabaseService] Disconnecting from MongoDB...');
      await this.client.close();
      this.client = null;
      this.db = null;
      console.log('✅ [DatabaseService] Disconnected from MongoDB');
    }
  }

  public isConnected(): boolean {
    return this.client !== null && this.db !== null;
  }

  public getClient(): MongoClient {
    if (!this.client) {
      throw new Error('Database client not initialized');
    }
    return this.client;
  }

  public getDatabase(): Db {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }
}
