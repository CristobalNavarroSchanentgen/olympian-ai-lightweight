import { ArtifactDetectionResult, ArtifactType } from '@olympian/shared';

/**
 * Enhanced artifact detection with robust recreation logic for Subproject 3
 * Supports multiple detection strategies, content fingerprinting, and graceful degradation
 */

interface DetectionStrategy {
  name: string;
  detect: (content: string) => ArtifactDetectionResult | null;
  confidence: number; // 0-1 scale
  priority: number; // Higher = more priority
}

interface ContentFingerprint {
  checksum: string;
  length: number;
  patterns: string[];
  language?: string;
  encoding: string;
}

interface EnhancedDetectionResult extends ArtifactDetectionResult {
  confidence: number;
  strategy: string;
  fingerprint: ContentFingerprint;
  fallbacks: ArtifactDetectionResult[];
  verified: boolean;
}

/**
 * Main artifact detection function with multiple strategies and verification
 */
export function detectArtifact(content: string): ArtifactDetectionResult {
  const trimmedContent = content.trim();
  
  // Skip very short content
  if (trimmedContent.length < 20) {
    return { shouldCreateArtifact: false };
  }

  try {
    // Generate content fingerprint for integrity verification
    const fingerprint = generateContentFingerprint(trimmedContent);
    
    // Apply multiple detection strategies
    const results = applyDetectionStrategies(trimmedContent, fingerprint);
    
    // Select best result with confidence scoring
    const bestResult = selectBestDetectionResult(results);
    
    if (bestResult && bestResult.shouldCreateArtifact) {
      // Verify result integrity and apply final processing
      return finalizeDetectionResult(bestResult, trimmedContent);
    }

    // Graceful degradation - try fallback strategies
    const fallbackResult = applyFallbackStrategies(trimmedContent, fingerprint);
    if (fallbackResult) {
      return finalizeDetectionResult(fallbackResult, trimmedContent);
    }

  } catch (error) {
    console.warn('🔧 [artifactDetection] Enhanced detection failed, falling back to legacy:', error);
    // Fall back to original detection logic
    return legacyDetectArtifact(trimmedContent);
  }

  return { shouldCreateArtifact: false };
}

/**
 * Generate SHA-256 based content fingerprint for integrity verification
 */
function generateContentFingerprint(content: string): ContentFingerprint {
  const checksum = generateChecksum(content);
  const patterns = extractContentPatterns(content);
  const language = detectPrimaryLanguage(content);
  const encoding = detectEncoding(content);

  return {
    checksum,
    length: content.length,
    patterns,
    language,
    encoding
  };
}

/**
 * Generate SHA-256 checksum (simplified for browser compatibility)
 */
function generateChecksum(content: string): string {
  // Simple hash function for content verification
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Extract content patterns for fingerprinting
 */
function extractContentPatterns(content: string): string[] {
  const patterns: string[] = [];
  
  // Code block patterns
  if (/```[\w]*\s*[\s\S]*?```/.test(content)) patterns.push('code_blocks');
  if (/`[^`\n]+`/.test(content)) patterns.push('inline_code');
  
  // HTML/XML patterns
  if (/<[^>]+>/.test(content)) patterns.push('markup_tags');
  if (/<\?xml/.test(content)) patterns.push('xml_declaration');
  if (/<!DOCTYPE/.test(content)) patterns.push('html_doctype');
  
  // Data patterns
  if (/^\s*[{\[]/.test(content) && /[}\]]\s*$/.test(content)) patterns.push('json_structure');
  if (/^[^,\n]+(?:,[^,\n]+)+$/.test(content.split('\n')[0])) patterns.push('csv_header');
  
  // Diagram patterns
  if (/graph|flowchart|sequenceDiagram/.test(content)) patterns.push('mermaid_diagram');
  if (/<svg[\s\S]*<\/svg>/.test(content)) patterns.push('svg_graphics');
  
  // Markdown patterns
  if (/^#{1,6}\s+/.test(content)) patterns.push('markdown_headers');
  if (/\*\*.*?\*\*|\*.*?\*/.test(content)) patterns.push('markdown_emphasis');
  if (/\[.*?\]\(.*?\)/.test(content)) patterns.push('markdown_links');
  
  return patterns;
}

/**
 * Enhanced language detection with multiple heuristics
 */
function detectPrimaryLanguage(content: string): string | undefined {
  const codeBlockMatch = content.match(/```(\w+)/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].toLowerCase();
  }

  // Language detection heuristics
  const languageHeuristics = [
    { pattern: /import\s+[\w{},\s]*\s+from\s+['"]/, lang: 'javascript' },
    { pattern: /export\s+(?:default\s+)?(?:class|function|const|let|var)/, lang: 'javascript' },
    { pattern: /<script[\s\S]*<\/script>/, lang: 'html' },
    { pattern: /def\s+\w+\s*\(.*\):/, lang: 'python' },
    { pattern: /class\s+\w+.*:/, lang: 'python' },
    { pattern: /public\s+class\s+\w+/, lang: 'java' },
    { pattern: /fn\s+\w+\s*\(.*\)\s*{/, lang: 'rust' },
    { pattern: /func\s+\w+\s*\(.*\)\s*{/, lang: 'go' },
    { pattern: /#include\s*<.*>/, lang: 'cpp' },
    { pattern: /\bstruct\s+\w+\s*{/, lang: 'c' },
  ];

  for (const { pattern, lang } of languageHeuristics) {
    if (pattern.test(content)) {
      return lang;
    }
  }

  return undefined;
}

/**
 * Detect content encoding
 */
function detectEncoding(content: string): string {
  // Simple encoding detection
  if (/[^\x00-\x7F]/.test(content)) {
    return 'utf-8';
  }
  return 'ascii';
}

/**
 * Apply multiple detection strategies with confidence scoring
 */
function applyDetectionStrategies(content: string, fingerprint: ContentFingerprint): EnhancedDetectionResult[] {
  const strategies: DetectionStrategy[] = [
    {
      name: 'code_block_regex',
      detect: (content) => detectCodeBlocksRegex(content),
      confidence: 0.9,
      priority: 100
    },
    {
      name: 'ast_analysis',
      detect: (content) => detectWithASTAnalysis(content),
      confidence: 0.95,
      priority: 90
    },
    {
      name: 'semantic_analysis',
      detect: (content) => detectWithSemanticAnalysis(content, fingerprint),
      confidence: 0.8,
      priority: 80
    },
    {
      name: 'pattern_matching',
      detect: (content) => detectWithPatternMatching(content, fingerprint),
      confidence: 0.7,
      priority: 70
    },
    {
      name: 'heuristic_analysis',
      detect: (content) => detectWithHeuristics(content),
      confidence: 0.6,
      priority: 60
    }
  ];

  const results: EnhancedDetectionResult[] = [];

  for (const strategy of strategies) {
    try {
      const result = strategy.detect(content);
      if (result && result.shouldCreateArtifact) {
        results.push({
          ...result,
          confidence: strategy.confidence,
          strategy: strategy.name,
          fingerprint,
          fallbacks: [],
          verified: verifyDetectionResult(result, content, fingerprint)
        });
      }
    } catch (error) {
      console.warn(`🔧 [artifactDetection] Strategy '${strategy.name}' failed:`, error);
    }
  }

  return results.sort((a, b) => (b.confidence * (strategies.find(s => s.name === b.strategy)?.priority || 0)) - 
                                (a.confidence * (strategies.find(s => s.name === a.strategy)?.priority || 0)));
}

/**
 * Enhanced code block detection with regex
 */
function detectCodeBlocksRegex(content: string): ArtifactDetectionResult | null {
  const codeBlockRegex = /^```(\w+)?\s*([\s\S]*?)```$/m;
  const match = content.match(codeBlockRegex);
  
  if (match) {
    const language = match[1] || detectLanguageFromContent(match[2]) || 'text';
    const codeContent = match[2]?.trim();
    
    if (!codeContent || codeContent.length < 10) {
      return null;
    }

    const type = getArtifactTypeFromLanguage(language);
    const title = generateTitleFromContent(codeContent, type, language);
    const processedContent = removeCodeBlocksFromContent(content);
    
    return {
      shouldCreateArtifact: true,
      type,
      title,
      language: language.toLowerCase(),
      content: codeContent,
      processedContent,
      codeBlocksRemoved: processedContent !== content
    };
  }

  return null;
}

/**
 * AST-based detection for structured content
 */
function detectWithASTAnalysis(content: string): ArtifactDetectionResult | null {
  try {
    // Try JSON parsing
    if (content.trim().startsWith('{') || content.trim().startsWith('[')) {
      const parsed = JSON.parse(content);
      if (typeof parsed === 'object') {
        return {
          shouldCreateArtifact: true,
          type: 'json',
          title: generateJSONTitle(parsed),
          content: JSON.stringify(parsed, null, 2),
          processedContent: 'JSON data has been generated and is available in the artifact panel.',
          codeBlocksRemoved: true
        };
      }
    }

    // Try XML/HTML parsing
    if (content.includes('<') && content.includes('>')) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      
      if (doc.documentElement && !doc.querySelector('parsererror')) {
        if (content.includes('<svg')) {
          return {
            shouldCreateArtifact: true,
            type: 'svg',
            title: 'SVG Diagram',
            content: content,
            processedContent: 'An SVG diagram has been generated and is available in the artifact panel.',
            codeBlocksRemoved: true
          };
        } else {
          return {
            shouldCreateArtifact: true,
            type: 'html',
            title: extractHTMLTitle(content) || 'HTML Document',
            content: content,
            processedContent: removeCodeFromHTMLDescription(content),
            codeBlocksRemoved: true
          };
        }
      }
    }
  } catch (error) {
    // AST parsing failed, continue with other strategies
  }

  return null;
}

/**
 * Semantic analysis based detection
 */
function detectWithSemanticAnalysis(content: string, fingerprint: ContentFingerprint): ArtifactDetectionResult | null {
  const { patterns, language } = fingerprint;
  
  // Analyze content semantics based on patterns
  if (patterns.includes('mermaid_diagram')) {
    return {
      shouldCreateArtifact: true,
      type: 'mermaid',
      title: extractMermaidTitle(content) || 'Mermaid Diagram',
      content: extractMermaidContent(content),
      processedContent: 'A Mermaid diagram has been generated and is available in the artifact panel.',
      codeBlocksRemoved: true
    };
  }

  if (patterns.includes('csv_header') && isCSVContent(content)) {
    return {
      shouldCreateArtifact: true,
      type: 'csv',
      title: generateCSVTitle(content),
      content: content,
      processedContent: 'CSV data has been generated and is available in the artifact panel.',
      codeBlocksRemoved: true
    };
  }

  if (patterns.includes('markdown_headers') && isSubstantialMarkdown(content)) {
    const processedContent = removeCodeBlocksFromContent(content);
    return {
      shouldCreateArtifact: true,
      type: 'markdown',
      title: extractMarkdownTitle(content) || 'Document',
      content: content,
      processedContent,
      codeBlocksRemoved: processedContent !== content
    };
  }

  return null;
}

/**
 * Pattern matching based detection
 */
function detectWithPatternMatching(content: string, fingerprint: ContentFingerprint): ArtifactDetectionResult | null {
  const { patterns } = fingerprint;
  
  // React component detection
  if (content.includes('React') || /import.*from\s+['"]react['"]/.test(content)) {
    const language = fingerprint.language || 'jsx';
    if (['jsx', 'tsx', 'javascript', 'typescript'].includes(language)) {
      return {
        shouldCreateArtifact: true,
        type: 'react',
        title: extractReactComponentName(content) || 'React Component',
        language,
        content: content,
        processedContent: 'A React component has been generated and is available in the artifact panel.',
        codeBlocksRemoved: true
      };
    }
  }

  // Multi-line code without code blocks
  if (fingerprint.length > 100 && containsProgrammingStructures(content)) {
    const language = fingerprint.language || detectLanguageFromContent(content) || 'text';
    return {
      shouldCreateArtifact: true,
      type: 'code',
      title: generateTitleFromContent(content, 'code', language),
      language,
      content: content,
      processedContent: 'Code has been generated and is available in the artifact panel.',
      codeBlocksRemoved: true
    };
  }

  return null;
}

/**
 * Heuristic-based detection as fallback
 */
function detectWithHeuristics(content: string): ArtifactDetectionResult | null {
  // Basic heuristics for edge cases
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter(line => line.trim());

  // Detect structured data
  if (nonEmptyLines.length > 5) {
    const firstLine = nonEmptyLines[0];
    
    // CSV-like structure
    if (firstLine.includes(',') && nonEmptyLines.slice(1, 3).every(line => 
      Math.abs((line.match(/,/g) || []).length - (firstLine.match(/,/g) || []).length) <= 1
    )) {
      return {
        shouldCreateArtifact: true,
        type: 'csv',
        title: 'Data Table',
        content: content,
        processedContent: 'Data table has been generated and is available in the artifact panel.',
        codeBlocksRemoved: true
      };
    }

    // Code-like structure
    if (nonEmptyLines.some(line => /[{}();]/.test(line)) && 
        nonEmptyLines.length > 10) {
      return {
        shouldCreateArtifact: true,
        type: 'code',
        title: 'Code',
        language: 'text',
        content: content,
        processedContent: 'Code has been generated and is available in the artifact panel.',
        codeBlocksRemoved: true
      };
    }
  }

  return null;
}

/**
 * Apply fallback strategies when primary detection fails
 */
function applyFallbackStrategies(content: string, fingerprint: ContentFingerprint): EnhancedDetectionResult | null {
  console.log('🔧 [artifactDetection] Applying fallback strategies for content recovery');
  
  // Fallback 1: Try legacy detection
  try {
    const legacyResult = legacyDetectArtifact(content);
    if (legacyResult.shouldCreateArtifact) {
      return {
        ...legacyResult,
        confidence: 0.5,
        strategy: 'legacy_fallback',
        fingerprint,
        fallbacks: [],
        verified: false
      };
    }
  } catch (error) {
    console.warn('🔧 [artifactDetection] Legacy fallback failed:', error);
  }

  // Fallback 2: Force creation for substantial content with patterns
  if (fingerprint.length > 200 && fingerprint.patterns.length > 0) {
    return {
      shouldCreateArtifact: true,
      type: 'text',
      title: 'Content',
      content: content,
      processedContent: content,
      codeBlocksRemoved: false,
      confidence: 0.3,
      strategy: 'forced_fallback',
      fingerprint,
      fallbacks: [],
      verified: false
    };
  }

  return null;
}

/**
 * Select the best detection result based on confidence and verification
 */
function selectBestDetectionResult(results: EnhancedDetectionResult[]): EnhancedDetectionResult | null {
  if (results.length === 0) return null;

  // Prefer verified results
  const verifiedResults = results.filter(r => r.verified);
  if (verifiedResults.length > 0) {
    return verifiedResults[0];
  }

  // Otherwise, return highest confidence result
  return results[0];
}

/**
 * Verify detection result integrity
 */
function verifyDetectionResult(result: ArtifactDetectionResult, originalContent: string, fingerprint: ContentFingerprint): boolean {
  try {
    // Basic integrity checks
    if (!result.content || result.content.length === 0) return false;
    if (result.content.length > originalContent.length * 2) return false; // Sanity check
    
    // Type-specific verification
    switch (result.type) {
      case 'json':
        try {
          JSON.parse(result.content);
          return true;
        } catch {
          return false;
        }
      
      case 'html':
      case 'svg':
        return result.content.includes('<') && result.content.includes('>');
      
      case 'csv':
        const lines = result.content.split('\n').filter(l => l.trim());
        return lines.length >= 2 && lines[0].includes(',');
      
      default:
        return result.content.length >= 10;
    }
  } catch {
    return false;
  }
}

/**
 * Finalize detection result with post-processing
 */
function finalizeDetectionResult(result: EnhancedDetectionResult, originalContent: string): ArtifactDetectionResult {
  // Ensure processed content is properly set
  if (!result.processedContent) {
    result.processedContent = removeCodeBlocksFromContent(originalContent);
    result.codeBlocksRemoved = result.processedContent !== originalContent;
  }

  // Clean up the result for return
  const finalResult: ArtifactDetectionResult = {
    shouldCreateArtifact: result.shouldCreateArtifact,
    type: result.type,
    title: result.title,
    language: result.language,
    content: result.content,
    processedContent: result.processedContent,
    codeBlocksRemoved: result.codeBlocksRemoved
  };

  return finalResult;
}

// Enhanced helper functions

function detectLanguageFromContent(content: string): string | undefined {
  const patterns = [
    { regex: /import\s+[\w{},\s]*\s+from/, lang: 'javascript' },
    { regex: /def\s+\w+\s*\(/, lang: 'python' },
    { regex: /public\s+class/, lang: 'java' },
    { regex: /fn\s+\w+/, lang: 'rust' },
    { regex: /#include/, lang: 'cpp' },
    { regex: /SELECT.*FROM/i, lang: 'sql' },
    { regex: /\$[\w]+\s*=/, lang: 'php' },
    { regex: /puts\s+['"]/, lang: 'ruby' }
  ];

  for (const { regex, lang } of patterns) {
    if (regex.test(content)) return lang;
  }

  return undefined;
}

function containsProgrammingStructures(content: string): boolean {
  const structures = [
    /function\s+\w+\s*\(/,
    /class\s+\w+/,
    /if\s*\([^)]+\)\s*{/,
    /for\s*\([^)]+\)\s*{/,
    /while\s*\([^)]+\)\s*{/,
    /\w+\s*:\s*\w+/,
    /\w+\(\s*\)/,
    /\w+\.\w+\(/
  ];

  return structures.some(regex => regex.test(content));
}

function extractHTMLTitle(content: string): string | null {
  const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

function extractMermaidTitle(content: string): string | null {
  const titleMatch = content.match(/title\s+([^\n]+)/i);
  return titleMatch ? titleMatch[1].trim() : null;
}

function extractMermaidContent(content: string): string {
  // Extract mermaid content from code blocks or raw content
  const mermaidMatch = content.match(/```mermaid\s*([\s\S]*?)```/);
  return mermaidMatch ? mermaidMatch[1].trim() : content;
}

function generateCSVTitle(content: string): string {
  const firstLine = content.split('\n')[0];
  const headers = firstLine.split(',').map(h => h.trim());
  return `${headers.length} Column Data`;
}

function generateJSONTitle(parsed: any): string {
  if (Array.isArray(parsed)) {
    return `JSON Array (${parsed.length} items)`;
  }
  const keys = Object.keys(parsed);
  return `JSON Object (${keys.length} fields)`;
}

function extractMarkdownTitle(content: string): string | null {
  const titleMatch = content.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : null;
}

function extractReactComponentName(content: string): string | null {
  const patterns = [
    /function\s+(\w+)\s*\(/,
    /const\s+(\w+)\s*=.*=>/,
    /class\s+(\w+)\s+extends/,
    /export\s+default\s+function\s+(\w+)/
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return `${match[1]} Component`;
  }

  return null;
}

function isCSVContent(content: string): boolean {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return false;
  
  const firstLineCommas = (lines[0].match(/,/g) || []).length;
  if (firstLineCommas === 0) return false;
  
  // Check consistency across multiple lines
  const consistentLines = lines.slice(0, Math.min(5, lines.length)).filter(line => {
    const commas = (line.match(/,/g) || []).length;
    return Math.abs(commas - firstLineCommas) <= 1;
  });
  
  return consistentLines.length >= Math.min(2, lines.length);
}

// Legacy detection function for fallback
function legacyDetectArtifact(content: string): ArtifactDetectionResult {
  // This is the original detection logic as fallback
  const trimmedContent = content.trim();
  
  if (trimmedContent.length < 50) {
    return { shouldCreateArtifact: false };
  }

  const codeBlockRegex = /^```(\w+)?\s*([\s\S]*?)```$/m;
  const codeMatch = trimmedContent.match(codeBlockRegex);
  
  if (codeMatch) {
    const language = codeMatch[1] || 'text';
    const codeContent = codeMatch[2]?.trim();
    
    if (!codeContent || codeContent.length < 20) {
      return { shouldCreateArtifact: false };
    }

    const type = getArtifactTypeFromLanguage(language);
    const title = generateTitleFromContent(codeContent, type, language);
    const processedContent = removeCodeBlocksFromContent(trimmedContent);
    
    return {
      shouldCreateArtifact: true,
      type,
      title,
      language: language.toLowerCase(),
      content: codeContent,
      processedContent,
      codeBlocksRemoved: processedContent !== trimmedContent
    };
  }

  return { shouldCreateArtifact: false };
}

// Keep existing utility functions for compatibility

function removeCodeBlocksFromContent(content: string): string {
  const parts = content.split(/```[\w]*\s*[\s\S]*?```/g);
  
  let processedContent = parts
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .join('\n\n');
  
  processedContent = processedContent.replace(/`[^`\n]+`/g, '');
  
  processedContent = processedContent
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .trim();

  if (processedContent.length < 20) {
    return 'The code has been generated and is available in the artifact panel.';
  }

  return processedContent;
}

function removeCodeFromHTMLDescription(content: string): string {
  const tagCount = (content.match(/<[^>]+>/g) || []).length;
  const contentLength = content.length;
  
  if (tagCount > 5 || contentLength > 200) {
    return 'An HTML document has been generated and is available in the artifact panel.';
  }
  
  const textContent = content.replace(/<[^>]+>/g, ' ').trim();
  if (textContent.length > 20) {
    return textContent;
  }
  
  return 'HTML content has been generated and is available in the artifact panel.';
}

function getArtifactTypeFromLanguage(language: string): ArtifactType {
  const lang = language.toLowerCase();
  
  switch (lang) {
    case 'html':
      return 'html';
    case 'jsx':
    case 'tsx':
    case 'react':
      return 'react';
    case 'svg':
      return 'svg';
    case 'json':
      return 'json';
    case 'csv':
      return 'csv';
    case 'mermaid':
      return 'mermaid';
    case 'markdown':
    case 'md':
      return 'markdown';
    default:
      return 'code';
  }
}

function generateTitleFromContent(content: string, type: ArtifactType, language?: string): string {
  const lines = content.split('\n').filter(line => line.trim());
  
  if (type === 'html') {
    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      return titleMatch[1].trim();
    }
    return 'HTML Document';
  }
  
  if (type === 'react') {
    const componentMatch = content.match(/(?:function|const|class)\s+(\w+)/);
    if (componentMatch) {
      return `${componentMatch[1]} Component`;
    }
    return 'React Component';
  }
  
  if (type === 'json') {
    return 'JSON Data';
  }
  
  if (type === 'csv') {
    return 'CSV Data';
  }
  
  if (type === 'mermaid') {
    return 'Mermaid Diagram';
  }
  
  const funcMatch = content.match(/(?:function|def|class)\s+(\w+)/);
  if (funcMatch) {
    return `${funcMatch[1]}`;
  }
  
  const firstLine = lines[0] || 'Code';
  const title = firstLine.length > 30 ? firstLine.substring(0, 27) + '...' : firstLine;
  
  return language ? `${title} (${language})` : title;
}

function isSubstantialMarkdown(content: string): boolean {
  const markdownFeatures = [
    /^#{1,6}\s+/m,
    /\*\*.*?\*\*/,
    /\*.*?\*/,
    /\[.*?\]\(.*?\)/,
    /^[\*\-\+]\s+/m,
    /^>\s+/m,
    /^```/m,
  ];
  
  const featureCount = markdownFeatures.filter(regex => regex.test(content)).length;
  return featureCount >= 2 && content.length > 200;
}
