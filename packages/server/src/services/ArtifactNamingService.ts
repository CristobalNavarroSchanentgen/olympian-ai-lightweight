import { ArtifactType } from '@olympian/shared';
import { OllamaStreamliner } from './OllamaStreamliner';

interface NamingContext {
  content: string;
  type: ArtifactType;
  language?: string;
  userPrompt: string;
  isPartOfFamily?: boolean;
  familyIndex?: number;
  totalInFamily?: number;
}

interface NamingResult {
  title: string;
  source: 'ai' | 'fallback';
  cached: boolean;
}

/**
 * AI-powered artifact naming service
 * Generates semantic names for artifacts using the same AI model
 */
export class ArtifactNamingService {
  private static instance: ArtifactNamingService;
  private ollamaStreamliner: OllamaStreamliner;
  private cache = new Map<string, { title: string; timestamp: number }>();
  private readonly CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly NAMING_TIMEOUT = 3000; // 3 seconds max

  private constructor() {
    this.ollamaStreamliner = new OllamaStreamliner();
  }

  public static getInstance(): ArtifactNamingService {
    if (!ArtifactNamingService.instance) {
      ArtifactNamingService.instance = new ArtifactNamingService();
    }
    return ArtifactNamingService.instance;
  }

  /**
   * Generate semantic name for artifact
   */
  public async generateName(context: NamingContext): Promise<NamingResult> {
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(context);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return { title: cached.title, source: 'ai', cached: true };
      }

      // Generate AI name with timeout
      const aiName = await Promise.race([
        this.generateAIName(context),
        this.timeoutPromise(this.NAMING_TIMEOUT)
      ]);

      if (aiName) {
        this.cache.set(cacheKey, { title: aiName, timestamp: Date.now() });
        return { title: aiName, source: 'ai', cached: false };
      }

      // Fallback to existing logic
      const fallbackName = this.generateFallbackName(context);
      return { title: fallbackName, source: 'fallback', cached: false };

    } catch (error) {
      console.warn(`🏷️ [ArtifactNaming] AI naming failed, using fallback:`, error);
      const fallbackName = this.generateFallbackName(context);
      return { title: fallbackName, source: 'fallback', cached: false };
    }
  }

  /**
   * Generate AI-powered name using OllamaStreamliner
   */
  private async generateAIName(context: NamingContext): Promise<string | null> {
    const prompt = this.buildNamingPrompt(context);
    
    try {
      // Get available models first
      const models = await this.ollamaStreamliner.listModels();
      if (models.length === 0) {
        console.warn(`🏷️ [ArtifactNaming] No models available for naming`);
        return null;
      }

      // Use the first available model (preferably a small/fast one)
      const preferredModels = ['llama3.2:3b', 'llama3.2:1b', 'llama3.1:8b'];
      const selectedModel = preferredModels.find(model => models.includes(model)) || models[0];

      // Create a processed request for the naming task
      const processedRequest = {
        model: selectedModel,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        stream: false // We want a complete response, not streaming
      };

      // Use streamChat but collect the full response
      let fullResponse = '';
      return new Promise<string | null>((resolve, reject) => {
        const timeout = setTimeout(() => {
          resolve(null);
        }, this.NAMING_TIMEOUT);

        this.ollamaStreamliner.streamChat(
          processedRequest,
          (token: string) => {
            fullResponse += token;
          }
        ).then(() => {
          clearTimeout(timeout);
          const extractedName = this.extractNameFromResponse(fullResponse);
          resolve(extractedName);
        }).catch((error) => {
          clearTimeout(timeout);
          console.warn(`🏷️ [ArtifactNaming] Stream chat failed:`, error);
          resolve(null);
        });
      });

    } catch (error) {
      console.warn(`🏷️ [ArtifactNaming] AI generation failed:`, error);
      return null;
    }
  }

  /**
   * Build concise naming prompt
   */
  private buildNamingPrompt(context: NamingContext): string {
    const { content, type, language, userPrompt, isPartOfFamily, familyIndex, totalInFamily } = context;
    
    // Extract first 200 chars of content for context
    const contentPreview = content.substring(0, 200).replace(/\n/g, ' ').trim();
    
    let basePrompt = `Give a clear, descriptive name for this ${type}`;
    if (language) basePrompt += ` (${language})`;
    basePrompt += `:\n\nUser requested: "${userPrompt}"\nContent: ${contentPreview}`;
    
    if (isPartOfFamily && totalInFamily && totalInFamily > 1) {
      basePrompt += `\n\nThis is part ${familyIndex! + 1} of ${totalInFamily} related files.`;
    }
    
    basePrompt += `\n\nRespond with just the name (max 50 chars):`;
    
    return basePrompt;
  }

  /**
   * Extract clean name from AI response
   */
  private extractNameFromResponse(response: string): string | null {
    if (!response) return null;
    
    // Clean up response - remove quotes, trim, take first line
    let name = response
      .split('\n')[0]
      .replace(/^["'`]|["'`]$/g, '')
      .trim();
    
    // Limit length
    if (name.length > 50) {
      name = name.substring(0, 47) + '...';
    }
    
    // Validate name is reasonable
    if (name.length < 3 || name.length > 50) {
      return null;
    }
    
    return name;
  }

  /**
   * Fallback to existing naming logic
   */
  private generateFallbackName(context: NamingContext): string {
    const { content, type, language, isPartOfFamily, familyIndex, totalInFamily } = context;
    
    // Use existing generateTitleFromContent logic
    const baseName = this.generateTitleFromContent(content, type, language);
    
    // Add family numbering if needed
    if (isPartOfFamily && totalInFamily && totalInFamily > 1) {
      return `${baseName} (${familyIndex! + 1} of ${totalInFamily})`;
    }
    
    return baseName;
  }

  /**
   * Existing title generation logic (simplified)
   */
  private generateTitleFromContent(content: string, type: ArtifactType, language?: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    
    if (type === 'html') {
      const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (titleMatch) return titleMatch[1].trim();
      return 'HTML Document';
    }
    
    if (type === 'react') {
      const componentMatch = content.match(/(?:function|const|class)\s+(\w+)/);
      if (componentMatch) return `${componentMatch[1]} Component`;
      return 'React Component';
    }
    
    if (type === 'json') return 'JSON Data';
    if (type === 'csv') return 'CSV Data';
    if (type === 'mermaid') return 'Mermaid Diagram';
    if (type === 'svg') return 'SVG Graphic';
    
    // Extract function/class names for code
    const funcMatch = content.match(/(?:function|def|class)\s+(\w+)/);
    if (funcMatch) return funcMatch[1];
    
    // Use first line or default
    const firstLine = lines[0] || 'Code';
    const title = firstLine.length > 30 ? firstLine.substring(0, 27) + '...' : firstLine;
    
    return language ? `${title}` : title;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(context: NamingContext): string {
    const contentHash = this.simpleHash(context.content.substring(0, 100));
    const promptHash = this.simpleHash(context.userPrompt);
    return `${context.type}-${context.language || 'none'}-${contentHash}-${promptHash}`;
  }

  /**
   * Get from cache if valid
   */
  private getFromCache(key: string): { title: string } | null {
    const cached = this.cache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached;
    }
    if (cached) {
      this.cache.delete(key); // Clean expired
    }
    return null;
  }

  /**
   * Simple hash for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Timeout promise
   */
  private timeoutPromise(ms: number): Promise<null> {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }

  /**
   * Clean cache periodically
   */
  public cleanCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_TTL) {
        this.cache.delete(key);
      }
    }
  }
}
