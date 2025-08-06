import { OllamaStreamliner } from '../services/OllamaStreamliner';
import { EnhancedOllamaStreamliner } from '../services/EnhancedOllamaStreamliner';

// Compatible models list for tool support
const COMPATIBLE_MODELS = (process.env.COMPATIBLE_MODELS || 'qwen2.5,qwen3,llama3.1,llama3.2,mistral,deepseek-r1').split(',');

/**
 * Factory to create appropriate streamliner based on model compatibility
 */
export class StreamlinerFactory {
  static getStreamliner(model: string): OllamaStreamliner | EnhancedOllamaStreamliner {
    const baseModel = model.split(':')[0];
    
    if (COMPATIBLE_MODELS.includes(baseModel)) {
      console.log(`🔧 [StreamlinerFactory] Using EnhancedOllamaStreamliner for model: ${model}`);
      return new EnhancedOllamaStreamliner();
    }
    
    console.log(`📦 [StreamlinerFactory] Using OllamaStreamliner for model: ${model}`);
    return new OllamaStreamliner();
  }
  
  static isCompatibleModel(model: string): boolean {
    return COMPATIBLE_MODELS.includes(model.split(':')[0]);
  }
}
