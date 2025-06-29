import { 
  Artifact, 
  ArtifactIntegrityResult, 
  ContentFingerprint, 
  ArtifactStatistics,
  ArtifactType 
} from '@olympian/shared';

/**
 * Comprehensive artifact verification and integrity checking utilities for Subproject 3
 * Provides robust verification mechanisms for multi-host deployments
 */

interface VerificationConfig {
  strictMode: boolean; // Whether to use strict validation rules
  performanceMode: 'accuracy' | 'balanced' | 'speed'; // Verification performance level
  enableDeepScanning: boolean; // Whether to perform deep content analysis
  timeoutMs: number; // Maximum verification time
  checksToPerform: VerificationCheck[]; // Which checks to perform
}

type VerificationCheck = 
  | 'structure' 
  | 'content' 
  | 'metadata' 
  | 'type' 
  | 'size' 
  | 'encoding' 
  | 'syntax' 
  | 'semantic';

const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  strictMode: false,
  performanceMode: 'balanced',
  enableDeepScanning: true,
  timeoutMs: 5000,
  checksToPerform: ['structure', 'content', 'metadata', 'type', 'size']
};

/**
 * Comprehensive artifact integrity verification
 */
export function verifyArtifactIntegrity(
  artifact: Artifact, 
  referenceContent?: string,
  config: Partial<VerificationConfig> = {}
): ArtifactIntegrityResult {
  const startTime = Date.now();
  const fullConfig = { ...DEFAULT_VERIFICATION_CONFIG, ...config };
  
  console.log('🔍 [artifactVerification] Starting comprehensive integrity check:', {
    artifactId: artifact.id,
    type: artifact.type,
    contentLength: artifact.content?.length,
    config: fullConfig
  });

  const result: ArtifactIntegrityResult = {
    valid: true,
    score: 1.0,
    issues: [],
    timestamp: new Date(),
    checks: {
      structure: true,
      content: true,
      metadata: true,
      type: true,
      size: true
    }
  };

  try {
    // Structure validation
    if (fullConfig.checksToPerform.includes('structure')) {
      const structureResult = validateArtifactStructure(artifact);
      result.checks.structure = structureResult.valid;
      if (!structureResult.valid) {
        result.issues.push(`Structure: ${structureResult.reason}`);
        result.score -= 0.3;
      }
    }

    // Content validation
    if (fullConfig.checksToPerform.includes('content')) {
      const contentResult = validateArtifactContent(artifact, fullConfig);
      result.checks.content = contentResult.valid;
      if (!contentResult.valid) {
        result.issues.push(`Content: ${contentResult.reason}`);
        result.score -= 0.25;
      }
    }

    // Metadata validation
    if (fullConfig.checksToPerform.includes('metadata')) {
      const metadataResult = validateArtifactMetadata(artifact);
      result.checks.metadata = metadataResult.valid;
      if (!metadataResult.valid) {
        result.issues.push(`Metadata: ${metadataResult.reason}`);
        result.score -= 0.15;
      }
    }

    // Type-specific validation
    if (fullConfig.checksToPerform.includes('type')) {
      const typeResult = validateArtifactType(artifact, fullConfig);
      result.checks.type = typeResult.valid;
      if (!typeResult.valid) {
        result.issues.push(`Type: ${typeResult.reason}`);
        result.score -= 0.2;
      }
    }

    // Size validation
    if (fullConfig.checksToPerform.includes('size')) {
      const sizeResult = validateArtifactSize(artifact, fullConfig);
      result.checks.size = sizeResult.valid;
      if (!sizeResult.valid) {
        result.issues.push(`Size: ${sizeResult.reason}`);
        result.score -= 0.1;
      }
    }

    // Additional deep scanning checks
    if (fullConfig.enableDeepScanning) {
      if (fullConfig.checksToPerform.includes('encoding')) {
        const encodingResult = validateContentEncoding(artifact);
        if (!encodingResult.valid) {
          result.issues.push(`Encoding: ${encodingResult.reason}`);
          result.score -= 0.05;
        }
      }

      if (fullConfig.checksToPerform.includes('syntax')) {
        const syntaxResult = validateContentSyntax(artifact);
        if (!syntaxResult.valid) {
          result.issues.push(`Syntax: ${syntaxResult.reason}`);
          result.score -= 0.1;
        }
      }
    }

    // Reference content comparison if available
    if (referenceContent) {
      const referenceResult = compareWithReference(artifact, referenceContent);
      if (!referenceResult.valid) {
        result.issues.push(`Reference: ${referenceResult.reason}`);
        result.score -= 0.15;
      }
    }

    // Ensure score doesn't go below 0
    result.score = Math.max(0, result.score);
    
    // Determine overall validity
    result.valid = result.score >= (fullConfig.strictMode ? 0.8 : 0.5) && result.issues.length === 0;

    console.log('✅ [artifactVerification] Integrity check complete:', {
      artifactId: artifact.id,
      valid: result.valid,
      score: result.score.toFixed(2),
      issues: result.issues.length,
      duration: `${Date.now() - startTime}ms`
    });

    return result;

  } catch (error) {
    console.error('❌ [artifactVerification] Verification failed:', error);
    
    return {
      valid: false,
      score: 0,
      reason: `Verification error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      issues: [`Critical verification failure: ${error}`],
      timestamp: new Date(),
      checks: {
        structure: false,
        content: false,
        metadata: false,
        type: false,
        size: false
      }
    };
  }
}

/**
 * Validate artifact structure
 */
function validateArtifactStructure(artifact: Artifact): { valid: boolean; reason?: string } {
  if (!artifact.id) return { valid: false, reason: 'Missing artifact ID' };
  if (!artifact.content) return { valid: false, reason: 'Missing artifact content' };
  if (!artifact.type) return { valid: false, reason: 'Missing artifact type' };
  if (!artifact.conversationId) return { valid: false, reason: 'Missing conversation ID' };
  if (!artifact.title) return { valid: false, reason: 'Missing artifact title' };
  
  // Validate ID format
  if (typeof artifact.id !== 'string' || artifact.id.length === 0) {
    return { valid: false, reason: 'Invalid artifact ID format' };
  }

  // Validate timestamps
  if (!artifact.createdAt || !(artifact.createdAt instanceof Date)) {
    return { valid: false, reason: 'Invalid created timestamp' };
  }

  if (!artifact.updatedAt || !(artifact.updatedAt instanceof Date)) {
    return { valid: false, reason: 'Invalid updated timestamp' };
  }

  // Validate version
  if (typeof artifact.version !== 'number' || artifact.version < 1) {
    return { valid: false, reason: 'Invalid version number' };
  }

  return { valid: true };
}

/**
 * Validate artifact content
 */
function validateArtifactContent(artifact: Artifact, config: VerificationConfig): { valid: boolean; reason?: string } {
  const content = artifact.content;
  
  if (!content || typeof content !== 'string') {
    return { valid: false, reason: 'Content is not a valid string' };
  }

  if (content.length === 0) {
    return { valid: false, reason: 'Content is empty' };
  }

  // Minimum content length check
  const minLength = config.strictMode ? 20 : 5;
  if (content.length < minLength) {
    return { valid: false, reason: `Content too short (minimum ${minLength} characters)` };
  }

  // Check for null bytes or other problematic characters
  if (content.includes('\0')) {
    return { valid: false, reason: 'Content contains null bytes' };
  }

  // Basic content quality check
  const printableCharRatio = (content.match(/[\x20-\x7E\s]/g) || []).length / content.length;
  if (printableCharRatio < 0.8) {
    return { valid: false, reason: 'Content contains too many non-printable characters' };
  }

  return { valid: true };
}

/**
 * Validate artifact metadata
 */
function validateArtifactMetadata(artifact: Artifact): { valid: boolean; reason?: string } {
  // Check conversation ID format
  if (!artifact.conversationId || typeof artifact.conversationId !== 'string') {
    return { valid: false, reason: 'Invalid conversation ID' };
  }

  // Check language field if present
  if (artifact.language !== undefined) {
    if (typeof artifact.language !== 'string' || artifact.language.length === 0) {
      return { valid: false, reason: 'Invalid language field' };
    }
  }

  // Check message ID if present
  if (artifact.messageId !== undefined) {
    if (typeof artifact.messageId !== 'string' || artifact.messageId.length === 0) {
      return { valid: false, reason: 'Invalid message ID' };
    }
  }

  // Check enhanced fields
  if (artifact.checksum !== undefined) {
    if (typeof artifact.checksum !== 'string' || artifact.checksum.length === 0) {
      return { valid: false, reason: 'Invalid checksum field' };
    }
  }

  if (artifact.confidence !== undefined) {
    if (typeof artifact.confidence !== 'number' || artifact.confidence < 0 || artifact.confidence > 1) {
      return { valid: false, reason: 'Invalid confidence value (must be 0-1)' };
    }
  }

  return { valid: true };
}

/**
 * Type-specific validation
 */
function validateArtifactType(artifact: Artifact, config: VerificationConfig): { valid: boolean; reason?: string } {
  const { type, content, language } = artifact;

  switch (type) {
    case 'json':
      try {
        JSON.parse(content);
      } catch {
        return { valid: false, reason: 'Invalid JSON syntax' };
      }
      break;

    case 'html':
      if (!content.includes('<') || !content.includes('>')) {
        return { valid: false, reason: 'Content does not appear to be HTML' };
      }
      
      if (config.enableDeepScanning) {
        // Basic HTML validation
        const tagCount = (content.match(/<[^>]+>/g) || []).length;
        if (tagCount === 0) {
          return { valid: false, reason: 'No HTML tags found' };
        }
      }
      break;

    case 'svg':
      if (!content.includes('<svg') || !content.includes('</svg>')) {
        return { valid: false, reason: 'Content does not appear to be SVG' };
      }
      break;

    case 'csv':
      const lines = content.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        return { valid: false, reason: 'CSV must have at least 2 lines' };
      }
      
      const firstLineCommas = (lines[0].match(/,/g) || []).length;
      if (firstLineCommas === 0) {
        return { valid: false, reason: 'CSV header must contain commas' };
      }
      break;

    case 'mermaid':
      const mermaidKeywords = ['graph', 'flowchart', 'sequenceDiagram', 'gantt', 'classDiagram', 'stateDiagram'];
      if (!mermaidKeywords.some(keyword => content.includes(keyword))) {
        return { valid: false, reason: 'Content does not appear to be a Mermaid diagram' };
      }
      break;

    case 'code':
    case 'react':
      if (language) {
        // Language-specific validation could be added here
        const validLanguages = [
          'javascript', 'typescript', 'python', 'java', 'cpp', 'c', 'csharp', 
          'php', 'ruby', 'go', 'rust', 'swift', 'kotlin', 'html', 'css', 'sql',
          'jsx', 'tsx', 'vue', 'svelte', 'bash', 'shell', 'yaml', 'xml'
        ];
        
        if (!validLanguages.includes(language.toLowerCase())) {
          // This is a warning, not a failure
          console.warn(`⚠️ [artifactVerification] Unknown language: ${language}`);
        }
      }
      break;

    case 'markdown':
      // Basic markdown validation
      if (config.enableDeepScanning) {
        const markdownFeatures = [
          /^#{1,6}\s+/m, // Headers
          /\*\*.*?\*\*/, // Bold
          /\*.*?\*/, // Italic
          /\[.*?\]\(.*?\)/, // Links
          /^[\*\-\+]\s+/m, // Lists
        ];
        
        const featureCount = markdownFeatures.filter(regex => regex.test(content)).length;
        if (featureCount === 0 && content.length > 100) {
          return { valid: false, reason: 'Content does not appear to contain markdown features' };
        }
      }
      break;

    case 'text':
      // Text artifacts are always valid if they have content
      break;

    default:
      return { valid: false, reason: `Unknown artifact type: ${type}` };
  }

  return { valid: true };
}

/**
 * Validate artifact size constraints
 */
function validateArtifactSize(artifact: Artifact, config: VerificationConfig): { valid: boolean; reason?: string } {
  const content = artifact.content;
  const maxSize = config.strictMode ? 500000 : 1000000; // 500KB or 1MB
  const minSize = config.strictMode ? 10 : 1;

  if (content.length > maxSize) {
    return { valid: false, reason: `Content too large (${content.length} > ${maxSize} bytes)` };
  }

  if (content.length < minSize) {
    return { valid: false, reason: `Content too small (${content.length} < ${minSize} bytes)` };
  }

  return { valid: true };
}

/**
 * Validate content encoding
 */
function validateContentEncoding(artifact: Artifact): { valid: boolean; reason?: string } {
  const content = artifact.content;
  
  try {
    // Check if content is valid UTF-8
    const encoded = new TextEncoder().encode(content);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(encoded);
    
    if (decoded !== content) {
      return { valid: false, reason: 'Content encoding inconsistency' };
    }
    
  } catch (error) {
    return { valid: false, reason: 'Invalid UTF-8 encoding' };
  }

  return { valid: true };
}

/**
 * Validate content syntax for specific types
 */
function validateContentSyntax(artifact: Artifact): { valid: boolean; reason?: string } {
  const { type, content } = artifact;

  try {
    switch (type) {
      case 'json':
        JSON.parse(content);
        break;

      case 'html':
      case 'svg':
        // Basic HTML/SVG validation using DOMParser
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        const parserErrors = doc.querySelectorAll('parsererror');
        if (parserErrors.length > 0) {
          return { valid: false, reason: 'HTML/SVG parsing errors detected' };
        }
        break;

      case 'csv':
        // Check for CSV structure consistency
        const lines = content.split('\n').filter(l => l.trim());
        if (lines.length > 1) {
          const headerCols = lines[0].split(',').length;
          const inconsistentLines = lines.slice(1).filter(line => {
            const cols = line.split(',').length;
            return Math.abs(cols - headerCols) > 1; // Allow 1 column variance
          });
          
          if (inconsistentLines.length > lines.length * 0.1) { // Allow 10% inconsistency
            return { valid: false, reason: 'CSV structure is inconsistent' };
          }
        }
        break;

      default:
        // No specific syntax validation for other types
        break;
    }
  } catch (error) {
    return { valid: false, reason: `Syntax validation failed: ${error}` };
  }

  return { valid: true };
}

/**
 * Compare artifact with reference content
 */
function compareWithReference(artifact: Artifact, referenceContent: string): { valid: boolean; reason?: string } {
  // Simple similarity check
  const similarity = calculateStringSimilarity(artifact.content, referenceContent);
  
  if (similarity < 0.3) { // Less than 30% similarity is suspicious
    return { valid: false, reason: `Low similarity to reference content (${(similarity * 100).toFixed(1)}%)` };
  }

  return { valid: true };
}

/**
 * Calculate string similarity (simplified Jaccard similarity)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const set1 = new Set(str1.toLowerCase().split(''));
  const set2 = new Set(str2.toLowerCase().split(''));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Generate comprehensive content fingerprint
 */
export function generateContentFingerprint(content: string): ContentFingerprint {
  return {
    checksum: generateChecksum(content),
    length: content.length,
    patterns: extractContentPatterns(content),
    language: detectPrimaryLanguage(content),
    encoding: detectEncoding(content),
    timestamp: new Date(),
    version: '1.0'
  };
}

/**
 * Generate content checksum
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
  
  // Code patterns
  if (/```[\w]*\s*[\s\S]*?```/.test(content)) patterns.push('code_blocks');
  if (/`[^`\n]+`/.test(content)) patterns.push('inline_code');
  if (/function\s+\w+\s*\(/i.test(content)) patterns.push('functions');
  if (/class\s+\w+/i.test(content)) patterns.push('classes');
  
  // Markup patterns
  if (/<[^>]+>/.test(content)) patterns.push('markup_tags');
  if (/<svg[\s\S]*<\/svg>/i.test(content)) patterns.push('svg_content');
  if (/<!DOCTYPE/i.test(content)) patterns.push('html_doctype');
  
  // Data patterns
  if (/^\s*[{\[]/.test(content) && /[}\]]\s*$/.test(content)) patterns.push('json_structure');
  if (/^[^,\n]+(?:,[^,\n]+)+$/m.test(content)) patterns.push('csv_data');
  
  // Diagram patterns
  if (/graph|flowchart|sequenceDiagram/i.test(content)) patterns.push('mermaid_syntax');
  
  // Text patterns
  if (/^#{1,6}\s+/m.test(content)) patterns.push('markdown_headers');
  if (/\*\*.*?\*\*|\*.*?\*/.test(content)) patterns.push('markdown_emphasis');
  if (/\[.*?\]\(.*?\)/.test(content)) patterns.push('markdown_links');
  
  return patterns;
}

/**
 * Detect primary language in content
 */
function detectPrimaryLanguage(content: string): string | undefined {
  const languagePatterns = [
    { pattern: /import\s+[\w{},\s]*\s+from\s+['"]/, lang: 'javascript' },
    { pattern: /def\s+\w+\s*\(.*\):/, lang: 'python' },
    { pattern: /public\s+class\s+\w+/, lang: 'java' },
    { pattern: /fn\s+\w+\s*\(.*\)\s*{/, lang: 'rust' },
    { pattern: /func\s+\w+\s*\(.*\)\s*{/, lang: 'go' },
    { pattern: /#include\s*<.*>/, lang: 'cpp' },
    { pattern: /SELECT.*FROM/i, lang: 'sql' },
    { pattern: /<html|<body|<div/i, lang: 'html' },
    { pattern: /\$[\w]+\s*=/, lang: 'php' }
  ];

  for (const { pattern, lang } of languagePatterns) {
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
 * Verify artifact consistency across a conversation
 */
export function verifyConversationArtifacts(artifacts: Artifact[]): ArtifactStatistics {
  const stats: ArtifactStatistics = {
    conversationId: artifacts[0]?.conversationId || 'unknown',
    totalArtifacts: artifacts.length,
    artifactsByType: {} as Record<ArtifactType, number>,
    recreationStats: {
      totalAttempts: 0,
      successRate: 0,
      averageConfidence: 0,
      averageAttempts: 0,
      strategiesUsed: [],
      fallbackRate: 0
    },
    integrityStats: {
      validArtifacts: 0,
      averageIntegrityScore: 0,
      commonIssues: [],
      repairRate: 0
    },
    performanceStats: {
      averageDetectionTime: 0,
      averageRecreationTime: 0,
      totalProcessingTime: 0
    },
    // NEW: Multi-artifact statistics (Phase 1) - Added missing property
    multiArtifactStats: {
      messagesWithMultipleArtifacts: 0,
      averageArtifactsPerMessage: 0,
      maxArtifactsInSingleMessage: 0,
      commonGroupingStrategies: [],
      groupingSuccessRate: 0
    },
    lastUpdated: new Date()
  };

  // Initialize type counts
  const artifactTypes: ArtifactType[] = ['text', 'code', 'html', 'react', 'svg', 'mermaid', 'json', 'csv', 'markdown'];
  artifactTypes.forEach(type => {
    stats.artifactsByType[type] = 0;
  });

  let totalIntegrityScore = 0;
  const allIssues: string[] = [];

  // Group artifacts by message for multi-artifact analysis
  const artifactsByMessage = new Map<string, Artifact[]>();

  // Analyze each artifact
  for (const artifact of artifacts) {
    // Count by type
    stats.artifactsByType[artifact.type]++;

    // Verify integrity
    const integrityResult = verifyArtifactIntegrity(artifact);
    if (integrityResult.valid) {
      stats.integrityStats.validArtifacts++;
    }
    
    totalIntegrityScore += integrityResult.score;
    allIssues.push(...integrityResult.issues);

    // Analyze confidence if available
    if (artifact.confidence !== undefined) {
      stats.recreationStats.averageConfidence += artifact.confidence;
    }

    // Group by message for multi-artifact analysis
    if (artifact.messageId) {
      if (!artifactsByMessage.has(artifact.messageId)) {
        artifactsByMessage.set(artifact.messageId, []);
      }
      artifactsByMessage.get(artifact.messageId)!.push(artifact);
    }
  }

  // Calculate multi-artifact statistics
  let totalMessagesWithMultiple = 0;
  let totalArtifactsInMessages = 0;
  let maxArtifactsInMessage = 0;

  for (const [, messageArtifacts] of artifactsByMessage) {
    if (messageArtifacts.length > 1) {
      totalMessagesWithMultiple++;
    }
    totalArtifactsInMessages += messageArtifacts.length;
    maxArtifactsInMessage = Math.max(maxArtifactsInMessage, messageArtifacts.length);
  }

  stats.multiArtifactStats.messagesWithMultipleArtifacts = totalMessagesWithMultiple;
  stats.multiArtifactStats.maxArtifactsInSingleMessage = maxArtifactsInMessage;
  
  if (artifactsByMessage.size > 0) {
    stats.multiArtifactStats.averageArtifactsPerMessage = totalArtifactsInMessages / artifactsByMessage.size;
    stats.multiArtifactStats.groupingSuccessRate = totalMessagesWithMultiple / artifactsByMessage.size;
  }

  // Calculate averages
  if (artifacts.length > 0) {
    stats.integrityStats.averageIntegrityScore = totalIntegrityScore / artifacts.length;
    stats.recreationStats.averageConfidence = stats.recreationStats.averageConfidence / artifacts.length;
  }

  // Find common issues
  const issueCounts = allIssues.reduce((acc, issue) => {
    acc[issue] = (acc[issue] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  stats.integrityStats.commonIssues = Object.entries(issueCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 5)
    .map(([issue]) => issue);

  console.log('📊 [artifactVerification] Conversation verification complete:', stats);

  return stats;
}

/**
 * Quick artifact health check
 */
export function quickArtifactHealthCheck(artifact: Artifact): { healthy: boolean; score: number; issues: string[] } {
  const config: Partial<VerificationConfig> = {
    performanceMode: 'speed',
    checksToPerform: ['structure', 'content', 'type'],
    enableDeepScanning: false,
    timeoutMs: 1000
  };

  const result = verifyArtifactIntegrity(artifact, undefined, config);
  
  return {
    healthy: result.valid && result.score > 0.7,
    score: result.score,
    issues: result.issues
  };
}
