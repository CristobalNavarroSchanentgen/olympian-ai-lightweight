import { logger } from '../utils/logger';
import { MCPService } from './MCPService';
import { MCPTool } from '@olympian/shared';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
  error?: boolean;
}

export interface OllamaToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
    };
  };
}

/**
 * MCP Tool Integration Service
 * 
 * This service bridges the gap between Ollama models with tool capabilities
 * and the MCP tool ecosystem. It handles:
 * - Converting MCP tools to Ollama-compatible tool definitions
 * - Parsing tool calls from model responses
 * - Executing tool calls via MCP
 * - Formatting tool results for the model
 */
export class MCPToolIntegrationService {
  private static instance: MCPToolIntegrationService;
  private mcpService: MCPService | null = null;
  private toolCache: Map<string, MCPTool> = new Map();
  private lastToolRefresh: Date | null = null;
  private readonly TOOL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): MCPToolIntegrationService {
    if (!MCPToolIntegrationService.instance) {
      MCPToolIntegrationService.instance = new MCPToolIntegrationService();
    }
    return MCPToolIntegrationService.instance;
  }

  /**
   * Set the MCP service reference
   */
  setMCPService(service: MCPService): void {
    this.mcpService = service;
    logger.info('✅ [MCPToolIntegration] MCP service reference set');
  }

  /**
   * Check if MCP tools are available
   */
  isAvailable(): boolean {
    return this.mcpService !== null;
  }

  /**
   * Get all available tools formatted for Ollama
   */