import { MCPManager } from './MCPManager';
import { MCPTool, MCPInvokeRequest, MCPInvokeResponse } from '@olympian/shared';
import { logger } from '../utils/logger';

/**
 * MCP Service - Simplified interface for tool integration
 * 
 * For subproject 3, this provides a clean interface to the MCPManager
 * Used by StreamlinerFactory and ToolEnabledOllamaStreamliner
 */
export class MCPService {
  private static instance: MCPService;
  private mcpManager: MCPManager;
  private initialized = false;

  private constructor() {
    this.mcpManager = MCPManager.getInstance();
  }

  static getInstance(): MCPService {
    if (!MCPService.instance) {
      MCPService.instance = new MCPService();
    }
    return MCPService.instance;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.info('🔧 [MCPService] Initializing MCP service for subproject 3...');
    
    try {
      await this.mcpManager.initialize();
      this.initialized = true;
      logger.info('✅ [MCPService] MCP service initialized successfully');
    } catch (error) {
      logger.error('❌ [MCPService] Failed to initialize MCP service:', error);
      throw error;
    }
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * List all available tools
   */
  async listTools(): Promise<MCPTool[]> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.mcpManager.listTools();
  }

  /**
   * Call a tool
   */
  async callTool(serverId: string, toolName: string, args: any): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.mcpManager.callTool(serverId, toolName, args);
  }

  /**
   * Invoke tool with request/response format
   */
  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.mcpManager.invokeTool(request);
  }

  /**
   * Get server status
   */
  getServers() {
    return this.mcpManager.getServers();
  }

  /**
   * Get statistics
   */
  getStats() {
    return this.mcpManager.getStats();
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    if (this.initialized) {
      await this.mcpManager.cleanup();
      this.initialized = false;
    }
  }
}

// Export singleton instance
export const mcpService = MCPService.getInstance();
