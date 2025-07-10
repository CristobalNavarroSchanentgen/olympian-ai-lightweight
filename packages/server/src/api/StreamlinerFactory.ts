import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { ToolEnabledOllamaStreamliner } from '../services/ToolEnabledOllamaStreamliner';

/**
 * Factory function to create the appropriate streamliner based on deployment mode
 * 
 * For subproject 3, returns a tool-enabled streamliner
 * For other subprojects, returns the standard streamliner
 */
export async function createStreamlinerForDeployment(): Promise<OllamaStreamliner> {
  const subproject = process.env.SUBPROJECT || '1';
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'development';
  const isSubproject3 = subproject === '3' || deploymentMode === 'docker-multi-host';
  const mcpEnabled = process.env.MCP_ENABLED === 'true';
  
  if (isSubproject3 && mcpEnabled) {
    console.log('🔧 [StreamlinerFactory] Creating tool-enabled streamliner for subproject 3');
    const toolEnabledStreamliner = new ToolEnabledOllamaStreamliner();
    await toolEnabledStreamliner.initialize();
    return toolEnabledStreamliner;
  }
  
  console.log('📦 [StreamlinerFactory] Creating standard streamliner');
  const standardStreamliner = new OllamaStreamliner();
  await standardStreamliner.initialize();
  return standardStreamliner;
}

/**
 * Get the streamliner instance to use in chat API
 * This allows dynamic switching based on configuration
 */
let streamlinerInstance: OllamaStreamliner | null = null;

export async function getStreamlinerInstance(): Promise<OllamaStreamliner> {
  if (!streamlinerInstance) {
    streamlinerInstance = await createStreamlinerForDeployment();
  }
  
  return streamlinerInstance;
}

/**
 * Reset the streamliner instance (useful for testing or config changes)
 */
export function resetStreamlinerInstance(): void {
  streamlinerInstance = null;
  console.log('🔄 [StreamlinerFactory] Streamliner instance reset');
}
