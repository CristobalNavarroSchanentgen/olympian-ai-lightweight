import { MCPTool } from '@olympian/shared';
import { ToolNamespaceManager } from './ToolNamespaceManager';
import { logger } from '../utils/logger';

interface ToolSelectionState {
  enabledTools: Set<string>;
  availableTools: Map<string, MCPTool>;
  serverGroups: Map<string, string[]>; // serverId -> tool names
}

/**
 * Tool Selection Service based on MCP Client for Ollama patterns
 * Manages tool enabling/disabling with server grouping
 */
export class ToolSelectionService {
  private static instance: ToolSelectionService;
  private state: ToolSelectionState;
  private namespaceManager: ToolNamespaceManager;
  
  private constructor() {
    this.namespaceManager = ToolNamespaceManager.getInstance();
    this.state = {
      enabledTools: new Set(),
      availableTools: new Map(),
      serverGroups: new Map()
    };
  }
  
  static getInstance(): ToolSelectionService {
    if (!ToolSelectionService.instance) {
      ToolSelectionService.instance = new ToolSelectionService();
    }
    return ToolSelectionService.instance;
  }
  
  /**
   * Initialize with available tools
   */
  initialize(tools: MCPTool[]): void {
    this.state.availableTools.clear();
    this.state.serverGroups.clear();
    this.state.enabledTools.clear();
    
    // Group tools by server
    for (const tool of tools) {
      this.state.availableTools.set(tool.name, tool);
      
      // Parse server from qualified name
      const parts = tool.name.split('.');
      if (parts.length >= 2) {
        const serverId = parts[0];
        
        if (!this.state.serverGroups.has(serverId)) {
          this.state.serverGroups.set(serverId, []);
        }
        this.state.serverGroups.get(serverId)!.push(tool.name);
      }
      
      // Enable all tools by default
      this.state.enabledTools.add(tool.name);
    }
    
    logger.info(\`Tool selection initialized: \${tools.length} tools from \${this.state.serverGroups.size} servers\`);
  }
  
  /**
   * Toggle a specific tool
   */
  toggleTool(toolName: string): boolean {
    if (this.state.enabledTools.has(toolName)) {
      this.state.enabledTools.delete(toolName);
      return false;
    } else {
      this.state.enabledTools.add(toolName);
      return true;
    }
  }
  
  /**
   * Toggle all tools for a server
   */
  toggleServer(serverId: string): boolean {
    const tools = this.state.serverGroups.get(serverId);
    if (!tools) return false;
    
    // Check if all tools are enabled
    const allEnabled = tools.every(t => this.state.enabledTools.has(t));
    
    if (allEnabled) {
      // Disable all
      tools.forEach(t => this.state.enabledTools.delete(t));
      return false;
    } else {
      // Enable all
      tools.forEach(t => this.state.enabledTools.add(t));
      return true;
    }
  }
  
  /**
   * Enable all tools
   */
  enableAll(): void {
    for (const toolName of this.state.availableTools.keys()) {
      this.state.enabledTools.add(toolName);
    }
  }
  
  /**
   * Disable all tools
   */
  disableAll(): void {
    this.state.enabledTools.clear();
  }
  
  /**
   * Get enabled tools
   */
  getEnabledTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    
    for (const toolName of this.state.enabledTools) {
      const tool = this.state.availableTools.get(toolName);
      if (tool) {
        tools.push(tool);
      }
    }
    
    return tools;
  }
  
  /**
   * Check if tool is enabled
   */
  isToolEnabled(toolName: string): boolean {
    return this.state.enabledTools.has(toolName);
  }
  
  /**
   * Get tool selection state for UI
   */
  getSelectionState(): {
    servers: Array<{
      id: string;
      tools: Array<{
        name: string;
        enabled: boolean;
        description: string;
      }>;
      allEnabled: boolean;
    }>;
    totalTools: number;
    enabledCount: number;
  } {
    const servers = [];
    
    for (const [serverId, toolNames] of this.state.serverGroups) {
      const tools = toolNames.map(name => ({
        name,
        enabled: this.state.enabledTools.has(name),
        description: this.state.availableTools.get(name)?.description || ''
      }));
      
      servers.push({
        id: serverId,
        tools,
        allEnabled: tools.every(t => t.enabled)
      });
    }
    
    return {
      servers,
      totalTools: this.state.availableTools.size,
      enabledCount: this.state.enabledTools.size
    };
  }
  
  /**
   * Process selection command (supports ranges like "1,3,5-8")
   */
  processSelectionCommand(command: string): {
    success: boolean;
    message: string;
    changes: number;
  } {
    try {
      const parts = command.split(',').map(p => p.trim());
      const indices: number[] = [];
      
      for (const part of parts) {
        if (part.includes('-')) {
          // Range
          const [start, end] = part.split('-').map(n => parseInt(n));
          for (let i = start; i <= end; i++) {
            indices.push(i);
          }
        } else {
          // Single number
          indices.push(parseInt(part));
        }
      }
      
      // Convert indices to tool names and toggle
      const toolArray = Array.from(this.state.availableTools.keys());
      let changes = 0;
      
      for (const idx of indices) {
        if (idx > 0 && idx <= toolArray.length) {
          const toolName = toolArray[idx - 1];
          this.toggleTool(toolName);
          changes++;
        }
      }
      
      return {
        success: true,
        message: \`Toggled \${changes} tools\`,
        changes
      };
      
    } catch (error: any) {
      return {
        success: false,
        message: \`Invalid command: \${error.message}\`,
        changes: 0
      };
    }
  }
  
  /**
   * Set enabled tools from a list
   */
  setEnabledTools(toolNames: string[]): void {
    this.state.enabledTools.clear();
    for (const name of toolNames) {
      if (this.state.availableTools.has(name)) {
        this.state.enabledTools.add(name);
      }
    }
  }
  
  /**
   * Get stats
   */
  getStats(): {
    totalTools: number;
    enabledTools: number;
    servers: number;
  } {
    return {
      totalTools: this.state.availableTools.size,
      enabledTools: this.state.enabledTools.size,
      servers: this.state.serverGroups.size
    };
  }
}
