import { MCPTool } from '@olympian/shared';
import { logger } from '../utils/logger';

/**
 * Manages tool namespacing to prevent conflicts between MCP servers
 * Following the pattern from MCP Client for Ollama
 */
export class ToolNamespaceManager {
  private static instance: ToolNamespaceManager;
  
  // Map of qualified names to server info
  private toolRegistry = new Map<string, {
    serverId: string;
    originalName: string;
    tool: MCPTool;
  }>();
  
  static getInstance(): ToolNamespaceManager {
    if (!ToolNamespaceManager.instance) {
      ToolNamespaceManager.instance = new ToolNamespaceManager();
    }
    return ToolNamespaceManager.instance;
  }
  
  /**
   * Register tools with namespace qualification
   */
  registerTools(serverId: string, tools: MCPTool[]): void {
    logger.info(`📝 Registering ${tools.length} tools for server: ${serverId}`);
    
    for (const tool of tools) {
      // Create qualified name: serverId.toolName
      const qualifiedName = `${serverId}.${tool.name}`;
      
      this.toolRegistry.set(qualifiedName, {
        serverId,
        originalName: tool.name,
        tool: {
          ...tool,
          name: qualifiedName,
          description: `[${serverId}] ${tool.description}`
        }
      });
      
      logger.debug(`✓ Registered: ${qualifiedName}`);
    }
  }
  
  /**
   * Parse qualified tool name to get server and tool info
   */
  parseToolName(qualifiedName: string): {
    serverId: string;
    toolName: string;
  } | null {
    const parts = qualifiedName.split('.', 2);
    if (parts.length !== 2) {
      return null;
    }
    
    return {
      serverId: parts[0],
      toolName: parts[1]
    };
  }
  
  /**
   * Get all tools in Ollama format
   */
  getToolsForOllama(): any[] {
    const tools = [];
    
    for (const [qualifiedName, info] of this.toolRegistry) {
      tools.push({
        type: 'function',
        function: {
          name: qualifiedName,
          description: info.tool.description,
          parameters: info.tool.inputSchema || {}
        }
      });
    }
    
    return tools;
  }
  
  /**
   * Get tool info by qualified name
   */
  getTool(qualifiedName: string): MCPTool | null {
    const info = this.toolRegistry.get(qualifiedName);
    return info ? info.tool : null;
  }
  
  /**
   * Clear tools for a specific server
   */
  clearServerTools(serverId: string): void {
    for (const [name, info] of this.toolRegistry) {
      if (info.serverId === serverId) {
        this.toolRegistry.delete(name);
      }
    }
  }
  
  /**
   * Get original tool name from qualified name
   */
  getOriginalToolName(qualifiedName: string): string | null {
    const info = this.toolRegistry.get(qualifiedName);
    return info ? info.originalName : null;
  }
  
  /**
   * Get all registered tools
   */
  getAllTools(): MCPTool[] {
    return Array.from(this.toolRegistry.values()).map(info => info.tool);
  }
  
  /**
   * Get tools by server
   */
  getToolsByServer(serverId: string): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const info of this.toolRegistry.values()) {
      if (info.serverId === serverId) {
        tools.push(info.tool);
      }
    }
    return tools;
  }
  
  /**
   * Check if a tool exists
   */
  hasTool(qualifiedName: string): boolean {
    return this.toolRegistry.has(qualifiedName);
  }
  
  /**
   * Get registry size
   */
  getRegistrySize(): number {
    return this.toolRegistry.size;
  }
  
  /**
   * Clear all tools
   */
  clearAll(): void {
    this.toolRegistry.clear();
    logger.info('🧹 Cleared all tools from namespace registry');
  }
}
