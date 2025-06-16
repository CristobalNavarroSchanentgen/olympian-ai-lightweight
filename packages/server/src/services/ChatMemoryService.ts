import { Message } from '@olympian/shared';
import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';

export interface MemoryConfig {
  maxMessages?: number; // Max number of messages to include in context
  maxTokens?: number; // Max estimated tokens to include
  includeSystemPrompt?: boolean;
  systemPrompt?: string;
}

export class ChatMemoryService {
  private static instance: ChatMemoryService;
  private db: DatabaseService;
  private defaultConfig: MemoryConfig = {
    maxMessages: 20, // Default to last 20 messages
    maxTokens: 4000, // Reserve ~4k tokens for history
    includeSystemPrompt: true,
    systemPrompt: 'You are a helpful AI assistant. You have access to conversation history to maintain context.',
  };

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  static getInstance(): ChatMemoryService {
    if (!ChatMemoryService.instance) {
      ChatMemoryService.instance = new ChatMemoryService();
    }
    return ChatMemoryService.instance;
  }

  /**
   * Get conversation history formatted for the model
   */
  async getConversationHistory(
    conversationId: string,
    config?: MemoryConfig
  ): Promise<Array<{ role: string; content: string; images?: string[] }>> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    const messages: Array<{ role: string; content: string; images?: string[] }> = [];

    try {
      // Add system prompt if configured
      if (mergedConfig.includeSystemPrompt && mergedConfig.systemPrompt) {
        messages.push({
          role: 'system',
          content: mergedConfig.systemPrompt,
        });
      }

      // Fetch messages from database
      const dbMessages = await this.db.messages
        .find({ conversationId })
        .sort({ createdAt: -1 }) // Get newest first
        .limit(mergedConfig.maxMessages!)
        .toArray();

      // Reverse to get chronological order
      dbMessages.reverse();

      // Process messages with token limit
      let estimatedTokens = 0;
      const maxTokens = mergedConfig.maxTokens!;

      for (const msg of dbMessages) {
        // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
        const messageTokens = Math.ceil((msg.content?.length || 0) / 4);
        
        if (estimatedTokens + messageTokens > maxTokens) {
          logger.debug(`Truncating history at ${messages.length} messages due to token limit`);
          break;
        }

        messages.push({
          role: msg.role,
          content: msg.content || '',
          ...(msg.images && { images: msg.images }),
        });

        estimatedTokens += messageTokens;
      }

      logger.debug(`Retrieved ${messages.length} messages for conversation ${conversationId}`);
      return messages;
    } catch (error) {
      logger.error('Error retrieving conversation history:', error);
      return messages; // Return what we have so far
    }
  }

  /**
   * Clear conversation history (useful for memory management)
   */
  async clearOldMessages(conversationId: string, keepLast: number = 100): Promise<void> {
    try {
      // Get message IDs to keep
      const messagesToKeep = await this.db.messages
        .find({ conversationId })
        .sort({ createdAt: -1 })
        .limit(keepLast)
        .project({ _id: 1 })
        .toArray();

      const idsToKeep = messagesToKeep.map(msg => msg._id);

      // Delete older messages
      const result = await this.db.messages.deleteMany({
        conversationId,
        _id: { $nin: idsToKeep },
      });

      if (result.deletedCount > 0) {
        logger.info(`Cleared ${result.deletedCount} old messages from conversation ${conversationId}`);
      }
    } catch (error) {
      logger.error('Error clearing old messages:', error);
    }
  }

  /**
   * Get conversation summary for long conversations
   */
  async getConversationSummary(conversationId: string): Promise<string | null> {
    try {
      const conversation = await this.db.conversations.findOne({ _id: conversationId });
      if (!conversation) return null;

      // For now, return the title. In future, this could generate an AI summary
      return conversation.title || 'Untitled conversation';
    } catch (error) {
      logger.error('Error getting conversation summary:', error);
      return null;
    }
  }

  /**
   * Update memory configuration for a specific conversation
   */
  async updateConversationMemoryConfig(
    conversationId: string,
    config: Partial<MemoryConfig>
  ): Promise<void> {
    try {
      await this.db.conversations.updateOne(
        { _id: conversationId },
        {
          $set: {
            memoryConfig: config,
            updatedAt: new Date(),
          },
        }
      );
    } catch (error) {
      logger.error('Error updating conversation memory config:', error);
    }
  }

  /**
   * Get memory statistics for monitoring
   */
  async getMemoryStats(conversationId: string): Promise<{
    messageCount: number;
    estimatedTokens: number;
    oldestMessage?: Date;
    newestMessage?: Date;
  }> {
    try {
      const messages = await this.db.messages
        .find({ conversationId })
        .sort({ createdAt: 1 })
        .toArray();

      if (messages.length === 0) {
        return { messageCount: 0, estimatedTokens: 0 };
      }

      const estimatedTokens = messages.reduce(
        (sum, msg) => sum + Math.ceil((msg.content?.length || 0) / 4),
        0
      );

      return {
        messageCount: messages.length,
        estimatedTokens,
        oldestMessage: messages[0].createdAt,
        newestMessage: messages[messages.length - 1].createdAt,
      };
    } catch (error) {
      logger.error('Error getting memory stats:', error);
      return { messageCount: 0, estimatedTokens: 0 };
    }
  }
}
