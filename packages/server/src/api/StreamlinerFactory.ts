import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { ToolEnabledOllamaStreamliner } from '../services/ToolEnabledOllamaStreamliner';
import { MCPStreamliner } from "../services/MCPStreamliner";
import { MCPService } from '../services/MCPService';

/**
 * Factory function to create the appropriate streamliner based on deployment mode
 * 
 * For subproject 3, returns a tool-enabled streamliner if MCP service is available
 * For other subprojects, returns the standard streamliner
 */
export function createStreamlinerForDeployment(mcpService?: MCPService | null): OllamaStreamliner {
  const subproject = process.env.SUBPROJECT || '1';
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'development';
  const isSubproject3 = subproject === '3' || deploymentMode === 'docker-multi-host';
  
  if (isSubproject3 && mcpService) {
    console.log('🔧 [StreamlinerFactory] Creating tool-enabled streamliner for subproject 3');
    const toolEnabledStreamliner = new ToolEnabledOllamaStreamliner();
            await toolEnabledStreamliner.initialize();
    toolEnabledStreamliner.setMCPService(mcpService);
    return toolEnabledStreamliner;
  }
  
  console.log('📦 [StreamlinerFactory] Creating standard streamliner');
  return new OllamaStreamliner();
}

/**
 * Get the streamliner instance to use in chat API
 * This allows dynamic switching based on configuration
 */
let streamlinerInstance: OllamaStreamliner | null = null;

export function getStreamlinerInstance(): OllamaStreamliner {
  if (!streamlinerInstance) {
    // Try to get MCP service if available
    let mcpService: MCPService | null = null;
    
    try {
      // Dynamic import to avoid circular dependencies
      const { mcpService: globalMcpService } = require('../index');
      mcpService = globalMcpService;
    } catch (error) {
      console.warn('⚠️ [StreamlinerFactory] Could not get MCP service:', error);
    }
    
    streamlinerInstance = createStreamlinerForDeployment(mcpService);
  }
  
  return streamlinerInstance;
}

/**
 * Update the MCP service reference in the streamliner
 * Call this after MCP service is initialized
 */
export function updateStreamlinerMCPService(mcpService: MCPService): void {
  const subproject = process.env.SUBPROJECT || '1';
  const deploymentMode = process.env.DEPLOYMENT_MODE || 'development';
  const isSubproject3 = subproject === '3' || deploymentMode === 'docker-multi-host';
  
  if (isSubproject3 && streamlinerInstance && streamlinerInstance instanceof ToolEnabledOllamaStreamliner) {
    console.log('🔧 [StreamlinerFactory] Updating MCP service in tool-enabled streamliner');
    streamlinerInstance.setMCPService(mcpService);
  }
}
