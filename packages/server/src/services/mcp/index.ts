// MCP Services consolidated exports
export { ToolNamespaceManager } from '../ToolNamespaceManager';
export { EnhancedOllamaStreamliner } from '../EnhancedOllamaStreamliner';
export { HILManager } from '../HILManager';
export { ToolSelectionService } from '../ToolSelectionService';
export { MCPManager } from '../MCPManager';

// Compatible models list for reference
export const COMPATIBLE_MODELS = (process.env.COMPATIBLE_MODELS || 'qwen2.5,qwen3,llama3.1,llama3.2,mistral,deepseek-r1').split(',');

export function isCompatibleModel(model: string): boolean {
  return COMPATIBLE_MODELS.includes(model.split(':')[0]);
}
