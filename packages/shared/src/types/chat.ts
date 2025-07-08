// Import from artifacts.ts instead of redefining
import type { ArtifactReference } from './artifacts';
import type { MCPTool } from './mcp';

export interface Conversation {
  _id?: string;
  title: string;
  model: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface Message {
  _id?: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: string[]; // Array of base64 images
  metadata?: MessageMetadata;
  createdAt: Date;
}

// NEW: Thinking models support
export interface ThinkingData {
  content: string; // Raw thinking content from <think> tags
  hasThinking: boolean; // Whether this message contains thinking
  processedAt: Date; // When thinking was extracted
}

// NEW: Tool execution data for MCP integration
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string; // Format: "serverId.toolName" or just "toolName"
    arguments: Record<string, any>;
  };
  serverId?: string; // MCP server ID
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  startTime?: Date;
  endTime?: Date;
}

export interface ToolResult {
  id: string; // Matches ToolCall.id
  success: boolean;
  result?: any;
  error?: string;
  duration?: number; // in milliseconds
  serverId?: string;
  toolName?: string;
}

export interface MessageMetadata {
  tokens?: number;
  generationTime?: number;
  model?: string;
  error?: string;
  visionModel?: string; // Vision model used for image processing
  
  // NEW: Thinking models support
  thinking?: ThinkingData; // Thinking/reasoning content
  originalContentWithThinking?: string; // Original content before thinking extraction
  
  // NEW: MCP Tool integration support for subproject 3
  toolCalls?: ToolCall[]; // Tools that were called during this message
  toolResults?: ToolResult[]; // Results from tool executions
  toolsUsed?: string[]; // Simple list of tool names used (for quick lookup)
  toolExecutionTime?: number; // Total time spent executing tools
  mcpServersUsed?: string[]; // List of MCP server IDs that were used
  
  // NEW: Multi-artifact support (Phase 1)
  artifacts?: ArtifactReference[]; // Array of artifacts for multi-artifact support
  
  // LEGACY: Single artifact metadata (deprecated but kept for backward compatibility)
  artifactId?: string;
  artifactType?: 'text' | 'code' | 'html' | 'react' | 'svg' | 'mermaid' | 'json' | 'csv' | 'markdown';
  hasArtifact?: boolean;
  
  // Code block removal metadata
  originalContent?: string; // Original content before code block removal
  codeBlocksRemoved?: boolean; // Whether code blocks were removed for display
  
  // Multi-artifact processing metadata
  artifactCount?: number; // Total number of artifacts created from this message
  artifactCreationStrategy?: string; // Strategy used for artifact grouping/creation
  multipleCodeBlocks?: boolean; // Whether message contained multiple code blocks
  
  // Artifact recreation metadata for subproject 3
  recreationSuccess?: boolean; // Whether artifact recreation was successful
  recreationFailed?: boolean; // Whether artifact recreation failed
  recreationAttempts?: number; // Number of recreation attempts
  fallbackUsed?: boolean; // Whether fallback strategy was used
  
  // Typewriter effect metadata
  typewriterCompleted?: boolean; // Whether typewriter effect has completed for this message
}

export interface ChatRequest {
  conversationId?: string;
  content: string;
  images?: string[];
  model: string;
  visionModel?: string; // Optional vision model for hybrid processing
}

export interface ProcessedRequest {
  model: string;
  messages: Array<{
    role: string;
    content: string;
    images?: string[];
    tool_calls?: ToolCall[]; // Tool calls from previous assistant messages
  }>;
  stream?: boolean;
  options?: Record<string, unknown>;
  tools?: any[]; // MCP tools array formatted for Ollama
  tool_choice?: string; // Tool choice strategy (e.g., 'auto', 'none', or specific tool)
}

export interface ModelCapability {
  name: string;
  vision: boolean;
  tools: boolean;
  reasoning: boolean; // Added reasoning capability
  maxTokens: number;
  contextWindow: number;
  description?: string;
}

export interface VisionError {
  error: 'VISION_UNSUPPORTED';
  message: string;
  available_vision_models: string[];
}

// Multi-artifact detection and creation utilities
export interface MultiArtifactDetectionResult {
  shouldCreateArtifacts: boolean;
  artifacts: Array<{
    type: 'text' | 'code' | 'html' | 'react' | 'svg' | 'mermaid' | 'json' | 'csv' | 'markdown';
    title: string;
    language?: string;
    content: string;
    startIndex: number;
    endIndex: number;
  }>;
  processedContent: string; // Content with artifacts removed
  artifactCount: number;
  detectionStrategy: string;
}

// NEW: Thinking processing utilities
export interface ThinkingProcessingResult {
  hasThinking: boolean;
  thinkingContent: string;
  processedContent: string; // Content with <think> tags removed
  thinkingData?: ThinkingData;
}

// NEW: Tool-related streaming events for WebSocket communication
export interface ToolExecutionEvent {
  type: 'tool_start' | 'tool_end' | 'tool_error';
  toolCall: ToolCall;
  result?: ToolResult;
  timestamp: Date;
}

// Helper functions for backward compatibility
export function hasMultipleArtifacts(metadata?: MessageMetadata): boolean {
  return !!(metadata?.artifacts && metadata.artifacts.length > 1);
}

export function getArtifactCount(metadata?: MessageMetadata): number {
  if (metadata?.artifacts) {
    return metadata.artifacts.length;
  }
  return metadata?.hasArtifact ? 1 : 0;
}

export function getFirstArtifact(metadata?: MessageMetadata): ArtifactReference | undefined {
  if (metadata?.artifacts && metadata.artifacts.length > 0) {
    return metadata.artifacts[0];
  }
  // Fallback to legacy format
  if (metadata?.artifactId && metadata?.artifactType) {
    return {
      artifactId: metadata.artifactId,
      artifactType: metadata.artifactType,
      order: 0
    };
  }
  return undefined;
}

export function isLegacyArtifactFormat(metadata?: MessageMetadata): boolean {
  return !!(metadata?.artifactId && !metadata?.artifacts);
}

// NEW: Tool-related utility functions for MCP integration
export function hasToolCalls(metadata?: MessageMetadata): boolean {
  return !!(metadata?.toolCalls && metadata.toolCalls.length > 0);
}

export function getToolCallCount(metadata?: MessageMetadata): number {
  return metadata?.toolCalls?.length || 0;
}

export function getCompletedToolCalls(metadata?: MessageMetadata): ToolCall[] {
  if (!metadata?.toolCalls) return [];
  return metadata.toolCalls.filter(call => call.status === 'completed');
}

export function getFailedToolCalls(metadata?: MessageMetadata): ToolCall[] {
  if (!metadata?.toolCalls) return [];
  return metadata.toolCalls.filter(call => call.status === 'failed');
}

export function getToolResultById(metadata?: MessageMetadata, toolCallId?: string): ToolResult | undefined {
  if (!metadata?.toolResults || !toolCallId) return undefined;
  return metadata.toolResults.find(result => result.id === toolCallId);
}

export function getUniqueToolsUsed(metadata?: MessageMetadata): string[] {
  if (!metadata?.toolCalls) return [];
  return Array.from(new Set(metadata.toolCalls.map(call => call.function.name)));
}

export function getUniqueMCPServersUsed(metadata?: MessageMetadata): string[] {
  if (!metadata?.toolCalls) return [];
  return Array.from(new Set(
    metadata.toolCalls
      .map(call => call.serverId)
      .filter(serverId => serverId !== undefined)
  )) as string[];
}

// NEW: Tool execution summary
export interface ToolExecutionSummary {
  totalCalls: number;
  completedCalls: number;
  failedCalls: number;
  totalDuration: number;
  toolsUsed: string[];
  serversUsed: string[];
}

export function getToolExecutionSummary(metadata?: MessageMetadata): ToolExecutionSummary {
  const toolCalls = metadata?.toolCalls || [];
  const toolResults = metadata?.toolResults || [];
  
  const completedCalls = toolCalls.filter(call => call.status === 'completed').length;
  const failedCalls = toolCalls.filter(call => call.status === 'failed').length;
  
  const totalDuration = toolResults.reduce((sum, result) => sum + (result.duration || 0), 0);
  
  return {
    totalCalls: toolCalls.length,
    completedCalls,
    failedCalls,
    totalDuration,
    toolsUsed: getUniqueToolsUsed(metadata),
    serversUsed: getUniqueMCPServersUsed(metadata)
  };
}

// ENHANCED: Thinking utility functions with improved validation
export function hasThinking(metadata?: MessageMetadata): boolean {
  if (!metadata?.thinking) {
    return false;
  }
  
  // Primary check: explicit hasThinking flag
  if (metadata.thinking.hasThinking === true) {
    return true;
  }
  
  // Fallback check: if thinking content exists and is non-empty
  if (metadata.thinking.content && metadata.thinking.content.trim().length > 0) {
    console.log('🧠 [hasThinking] Found thinking content via fallback check:', {
      hasThinkingFlag: metadata.thinking.hasThinking,
      contentLength: metadata.thinking.content.length,
      contentPreview: metadata.thinking.content.substring(0, 100) + '...'
    });
    return true;
  }
  
  // Additional fallback: check originalContentWithThinking for <think> tags
  if (metadata.originalContentWithThinking) {
    const hasThinkTags = /<think>[\s\S]*?<\/think>/i.test(metadata.originalContentWithThinking);
    if (hasThinkTags) {
      console.log('🧠 [hasThinking] Found thinking via originalContentWithThinking:', {
        hasThinkTags,
        originalContentLength: metadata.originalContentWithThinking.length
      });
      return true;
    }
  }
  
  return false;
}

export function getThinkingContent(metadata?: MessageMetadata): string {
  if (!metadata?.thinking) {
    return '';
  }
  
  // Primary source: processed thinking content
  if (metadata.thinking.content && metadata.thinking.content.trim()) {
    return metadata.thinking.content;
  }
  
  // Fallback: extract from originalContentWithThinking
  if (metadata.originalContentWithThinking) {
    const result = parseThinkingFromContent(metadata.originalContentWithThinking);
    if (result.hasThinking) {
      return result.thinkingContent;
    }
  }
  
  return '';
}

// ENHANCED: More robust thinking parsing with better debugging
export function parseThinkingFromContent(content: string): ThinkingProcessingResult {
  if (!content || typeof content !== 'string') {
    return {
      hasThinking: false,
      thinkingContent: '',
      processedContent: content || ''
    };
  }
  
  // Match <think>...</think> tags (case insensitive, multiline, support multiple variants)
  const thinkingRegexes = [
    /<think>([\s\S]*?)<\/think>/gi,           // Standard <think> tags
    /<think>([\s\S]*?)<\/antml:think>/gi, // Anthropic thinking tags
    /<thinking>([\s\S]*?)<\/thinking>/gi      // Alternative thinking tags
  ];
  
  let allMatches: RegExpMatchArray[] = [];
  
  // Collect all matches from all regex patterns
  for (const regex of thinkingRegexes) {
    const matches = Array.from(content.matchAll(regex));
    allMatches = allMatches.concat(matches);
  }
  
  if (allMatches.length === 0) {
    return {
      hasThinking: false,
      thinkingContent: '',
      processedContent: content
    };
  }
  
  console.log('🧠 [parseThinkingFromContent] Found thinking content:', {
    matchCount: allMatches.length,
    contentLength: content.length,
    contentPreview: content.substring(0, 200) + '...'
  });
  
  // Extract all thinking content
  const thinkingContent = allMatches
    .map(match => match[1].trim())
    .filter(content => content.length > 0) // Filter out empty matches
    .join('\n\n---\n\n'); // Separate multiple thinking blocks
  
  // Remove all thinking tags from content
  let processedContent = content;
  for (const regex of thinkingRegexes) {
    processedContent = processedContent.replace(regex, '');
  }
  processedContent = processedContent.trim();
  
  // Ensure processedContent is not empty
  if (!processedContent) {
    processedContent = 'I was thinking about this...'; // Fallback message
  }
  
  const thinkingData: ThinkingData = {
    content: thinkingContent,
    hasThinking: true,
    processedAt: new Date()
  };
  
  console.log('🧠 [parseThinkingFromContent] Parsed result:', {
    hasThinking: true,
    thinkingContentLength: thinkingContent.length,
    processedContentLength: processedContent.length,
    thinkingPreview: thinkingContent.substring(0, 100) + '...',
    processedPreview: processedContent.substring(0, 100) + '...'
  });
  
  return {
    hasThinking: true,
    thinkingContent,
    processedContent,
    thinkingData
  };
}

// ENHANCED: Get display content with thinking fallback
export function getDisplayContentForMessage(message: Message): string {
  // If thinking was processed, return the processed content (without <think> tags)
  if (message.metadata?.thinking?.hasThinking) {
    // Use processed content if available, otherwise fall back to message content
    if (message.content && message.content.trim()) {
      return message.content; // Content should already be processed at this point
    }
    
    // Emergency fallback: re-parse from originalContentWithThinking
    if (message.metadata.originalContentWithThinking) {
      const result = parseThinkingFromContent(message.metadata.originalContentWithThinking);
      return result.processedContent;
    }
  }
  
  // For backward compatibility, check for artifacts
  if (message.metadata?.originalContent) {
    return message.metadata.originalContent;
  }
  
  return message.content;
}

// Helper function to detect if we're in a browser environment with proper typing
function isBrowserEnvironment(): boolean {
  try {
    return typeof globalThis !== 'undefined' && 
           typeof (globalThis as any).window !== 'undefined' && 
           (globalThis as any).window === globalThis;
  } catch {
    return false;
  }
}

// Helper function to check if we're in development mode with proper typing
function isDevelopmentMode(): boolean {
  try {
    return typeof process !== 'undefined' && 
           process.env && 
           process.env.NODE_ENV === 'development';
  } catch {
    return false;
  }
}

// NEW: Debug utility to validate thinking data structure
export function debugThinkingData(metadata?: MessageMetadata): void {
  if (isBrowserEnvironment() && isDevelopmentMode()) {
    console.group('🧠 [debugThinkingData] Thinking data analysis');
    console.log('Metadata:', metadata);
    console.log('Has thinking object:', !!metadata?.thinking);
    console.log('Thinking hasThinking flag:', metadata?.thinking?.hasThinking);
    console.log('Thinking content length:', metadata?.thinking?.content?.length || 0);
    console.log('Thinking content preview:', metadata?.thinking?.content?.substring(0, 100) + '...');
    console.log('Original content with thinking:', !!metadata?.originalContentWithThinking);
    console.log('hasThinking() result:', hasThinking(metadata));
    console.log('getThinkingContent() result length:', getThinkingContent(metadata).length);
    console.groupEnd();
  }
}

// NEW: Debug utility for tool data
export function debugToolData(metadata?: MessageMetadata): void {
  if (isBrowserEnvironment() && isDevelopmentMode()) {
    console.group('🔧 [debugToolData] Tool data analysis');
    console.log('Metadata:', metadata);
    console.log('Has tool calls:', hasToolCalls(metadata));
    console.log('Tool call count:', getToolCallCount(metadata));
    console.log('Tool calls:', metadata?.toolCalls);
    console.log('Tool results:', metadata?.toolResults);
    console.log('Tools used:', getUniqueToolsUsed(metadata));
    console.log('MCP servers used:', getUniqueMCPServersUsed(metadata));
    console.log('Execution summary:', getToolExecutionSummary(metadata));
    console.groupEnd();
  }
}
