import { MCPService } from './MCPService';
import { MCPTool } from '@olympian/shared';
import { logger } from '../utils/logger';

/**
 * Tool Integration Service for Subproject 3
 * 
 * Handles integration between Ollama streamliner and MCP tools
 * Simplified service that manages tool discovery and execution
 */
export class ToolIntegrationService {
  private static instance: ToolIntegrationService;
  private mcpService: MCPService;
  private toolCache = new Map<string, MCPTool[]>();
  private lastCacheUpdate = 0;
  private readonly CACHE_TTL = 30000; // 30 seconds

  private constructor() {
    this.mcpService = MCPService.getInstance();
  }

  static getInstance(): ToolIntegrationService {
    if (!ToolIntegrationService.instance) {
      ToolIntegrationService.instance = new ToolIntegrationService();
    }
    return ToolIntegrationService.instance;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    logger.info('🔧 [ToolIntegration] Initializing tool integration service...');
    
    try {
      await this.mcpService.initialize();
      await this.refreshToolCache();
      logger.info('✅ [ToolIntegration] Tool integration service initialized');
    } catch (error) {
      logger.error('❌ [ToolIntegration] Failed to initialize tool integration service:', error);
      throw error;
    }
  }

  /**
   * Get available tools (cached)
   */
  async getAvailableTools(): Promise<MCPTool[]> {
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - this.lastCacheUpdate < this.CACHE_TTL && this.toolCache.size > 0) {
      const tools: MCPTool[] = [];
      for (const serverTools of this.toolCache.values()) {
        tools.push(...serverTools);
      }
      return tools;
    }

    // Refresh cache
    await this.refreshToolCache();
    
    const tools: MCPTool[] = [];
    for (const serverTools of this.toolCache.values()) {
      tools.push(...serverTools);
    }
    
    return tools;
  }

  /**
   * Check if a model supports tools
   */
  async isToolCapable(modelName: string): Promise<boolean> {
    // Simple heuristic for tool capability detection
    const toolCapableModels = [
      'llama3.1',
      'llama3.2',
      'mistral',
      'mixtral',
      'qwen',
      'deepseek',
      'phi3.5'
    ];

    return toolCapableModels.some(capable => 
      modelName.toLowerCase().includes(capable.toLowerCase())
    );
  }

  /**
   * Execute a tool call
   */
  async executeTool(serverId: string, toolName: string, args: any): Promise<any> {
    try {
      logger.info(`🔨 [ToolIntegration] Executing tool: ${serverId}.${toolName}`);
      
      const result = await this.mcpService.callTool(serverId, toolName, args);
      
      logger.info(`✅ [ToolIntegration] Tool execution completed: ${serverId}.${toolName}`);
      return result;
    } catch (error) {
      logger.error(`❌ [ToolIntegration] Tool execution failed: ${serverId}.${toolName}`, error);
      throw error;
    }
  }

  /**
   * Format tools for Ollama function calling
   */
  formatToolsForOllama(tools: MCPTool[]): any[] {
    return tools.map(tool => ({
      type: 'function',
      function: {
        name: `${tool.serverId}.${tool.name}`,
        description: tool.description,
        parameters: tool.inputSchema || {}
      }
    }));
  }

  /**
   * Parse tool calls from Ollama response
   */
  parseToolCalls(content: string): any[] {
    try {
      // Look for tool_calls in the response
      const toolCallMatch = content.match(/"tool_calls"\s*:\s*(\[[^\]]*\])/);
      
      if (toolCallMatch) {
        return JSON.parse(toolCallMatch[1]);
      }
      
      // Alternative: Look for function calls in different formats
      const functionMatch = content.match(/"function"\s*:\s*{[^}]*}/g);
      if (functionMatch) {
        return functionMatch.map((match, index) => ({
          id: `call_${index}`,
          type: 'function',
          function: JSON.parse(match.replace('"function":', ''))
        }));
      }
      
      return [];
    } catch (error) {
      logger.warn('⚠️ [ToolIntegration] Failed to parse tool calls from content:', error);
      return [];
    }
  }

  /**
   * Get tool statistics
   */
  getStats(): {
    totalServers: number;
    totalTools: number;
    cacheAge: number;
  } {
    const totalServers = this.toolCache.size;
    let totalTools = 0;
    
    for (const serverTools of this.toolCache.values()) {
      totalTools += serverTools.length;
    }
    
    return {
      totalServers,
      totalTools,
      cacheAge: Date.now() - this.lastCacheUpdate
    };
  }

  /**
   * Refresh tool cache
   */
  private async refreshToolCache(): Promise<void> {
    try {
      const tools = await this.mcpService.listTools();
      
      // Group tools by server
      this.toolCache.clear();
      for (const tool of tools) {
        if (!this.toolCache.has(tool.serverId)) {
          this.toolCache.set(tool.serverId, []);
        }
        this.toolCache.get(tool.serverId)!.push(tool);
      }
      
      this.lastCacheUpdate = Date.now();
      
      logger.debug(`🔄 [ToolIntegration] Tool cache refreshed: ${tools.length} tools from ${this.toolCache.size} servers`);
    } catch (error) {
      logger.error('❌ [ToolIntegration] Failed to refresh tool cache:', error);
    }
  }

  /**
   * Cleanup
   */
  async cleanup(): Promise<void> {
    this.toolCache.clear();
    await this.mcpService.cleanup();
  }
}
