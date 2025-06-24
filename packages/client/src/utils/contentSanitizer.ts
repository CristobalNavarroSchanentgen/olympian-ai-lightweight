/**
 * Content sanitization utilities for safe rendering in React components
 * Enhanced for multi-host deployment scenarios (Subproject 3)
 * Integrated with UI debug system for comprehensive logging
 */

// Import UI logger for enhanced debugging
let uiLogger: any = null;
const isDebugMode = typeof window !== 'undefined' && 
  (import.meta.env?.VITE_UI_DEBUG_MODE === 'true' || 
   import.meta.env?.VITE_CONTENT_SANITIZER_DEBUG === 'true');

// Dynamic import of UI logger to handle environments where it might not be available
if (isDebugMode) {
  try {
    import('@/utils/debug/uiLogger').then(module => {
      uiLogger = module.uiLogger;
    }).catch(() => {
      console.debug('[ContentSanitizer] UI debug logger not available');
    });
  } catch {
    // Fallback for environments where dynamic imports aren't supported
  }
}

/**
 * Enhanced logging for content sanitization operations
 */
function debugLog(operation: string, data: any, componentName?: string) {
  if (!isDebugMode) return;
  
  // Log to UI logger if available
  if (uiLogger) {
    try {
      uiLogger.contentSanitization(componentName || 'Unknown', operation, data);
    } catch (error) {
      console.warn('[ContentSanitizer] Failed to log to UI logger:', error);
    }
  }
  
  // Also log to console in debug mode
  console.debug(`[ContentSanitizer] ${operation}:`, data);
}

/**
 * Remove control characters and normalize content for safe rendering
 * Following React best practices for content validation
 */
export function sanitizeContent(content: string | undefined | null, componentName?: string): string {
  try {
    // Guard against invalid input following React patterns
    if (!content || typeof content !== 'string') {
      const warning = `Invalid content type: ${typeof content}`;
      console.warn('[ContentSanitizer]', warning);
      debugLog('Invalid Input', { type: typeof content, warning }, componentName);
      return '';
    }
    
    // Enhanced logging for special characters using proper Unicode patterns
    const specialCharAnalysis = {
      hasEllipsis: content.includes('...'),
      hasUnicodeEllipsis: content.includes('\u2026'),
      hasSmartQuotes: /[\u2018\u2019\u201C\u201D]/.test(content),
      hasControlChars: /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content),
      hasZeroWidthChars: /[\u200B-\u200D\uFEFF]/.test(content),
      length: content.length,
      preview: content.substring(0, 100)
    };
    
    const hasSpecialChars = specialCharAnalysis.hasEllipsis || 
                           specialCharAnalysis.hasUnicodeEllipsis || 
                           specialCharAnalysis.hasSmartQuotes ||
                           specialCharAnalysis.hasControlChars ||
                           specialCharAnalysis.hasZeroWidthChars;
    
    if (hasSpecialChars) {
      console.log('[ContentSanitizer] Processing content with special characters:', specialCharAnalysis);
      debugLog('Special Characters Detected', specialCharAnalysis, componentName);
    }
    
    const sanitized = content
      // Remove null bytes and control characters (keep newlines and tabs)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
      // Normalize smart quotes to regular quotes using Unicode ranges
      .replace(/[\u2018\u2019]/g, "'")  // Left/right single quotation marks
      .replace(/[\u201C\u201D]/g, '"')  // Left/right double quotation marks
      // Normalize ellipsis characters
      .replace(/\u2026/g, '...')        // Unicode ellipsis to three dots
      // Normalize various dash characters to regular hyphens
      .replace(/[\u2013\u2014]/g, '-')  // En dash, em dash
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Limit consecutive newlines (prevent excessive whitespace)
      .replace(/\n{4,}/g, '\n\n\n')
      // Remove zero-width characters that can break rendering
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      // Remove other potentially problematic Unicode characters
      .replace(/[\u00AD]/g, '')        // Soft hyphen
      .replace(/[\u061C]/g, '')        // Arabic letter mark
      // Trim excessive whitespace
      .trim();

    // Validate result and log detailed information
    const sanitizationResult = {
      originalLength: content.length,
      sanitizedLength: sanitized.length,
      charactersRemoved: content.length - sanitized.length,
      isEmpty: !sanitized && content.length > 0,
      success: true
    };

    if (sanitizationResult.isEmpty) {
      console.warn('[ContentSanitizer] Sanitization resulted in empty string from non-empty input');
      debugLog('Empty Result Warning', sanitizationResult, componentName);
    } else if (sanitizationResult.charactersRemoved > 0) {
      debugLog('Characters Removed', sanitizationResult, componentName);
    }
    
    // Log successful sanitization in debug mode
    if (isDebugMode && hasSpecialChars) {
      debugLog('Sanitization Complete', sanitizationResult, componentName);
    }
    
    return sanitized;
  } catch (error) {
    const errorInfo = {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      inputType: typeof content,
      inputLength: content ? content.length : 0
    };
    
    console.error('[ContentSanitizer] Error in sanitizeContent:', error);
    debugLog('Sanitization Error', errorInfo, componentName);
    
    // Return the original content as fallback, but escaped
    return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * Enhanced validation for markdown content safety
 * Includes checks for multi-host deployment edge cases
 */
export function isValidMarkdownContent(content: string, componentName?: string): boolean {
  try {
    if (!content || typeof content !== 'string') {
      const warning = `Invalid content for validation: ${typeof content}`;
      console.warn('[ContentSanitizer]', warning);
      debugLog('Validation Failed - Invalid Type', { type: typeof content }, componentName);
      return false;
    }
    
    const validationChecks = {
      codeBlockBalance: true,
      lineLength: true,
      contentLength: true,
      suspiciousPatterns: true,
      details: {} as any
    };
    
    // Check for balanced code blocks
    const codeBlockMatches = content.match(/```/g);
    const codeBlockCount = codeBlockMatches ? codeBlockMatches.length : 0;
    validationChecks.details.codeBlockCount = codeBlockCount;
    
    if (codeBlockCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Unbalanced code blocks detected:', codeBlockCount);
      validationChecks.codeBlockBalance = false;
    }
    
    // Check for extremely long lines that might cause performance issues
    const lines = content.split('\n');
    const maxLineLength = 10000; // Reasonable limit for web display
    const longLines = lines.filter(line => line.length > maxLineLength);
    validationChecks.details.maxLineLength = Math.max(...lines.map(line => line.length));
    validationChecks.details.longLinesCount = longLines.length;
    
    if (longLines.length > 0) {
      console.warn('[ContentSanitizer] Extremely long lines detected (>10k chars):', longLines.length);
      validationChecks.lineLength = false;
    }
    
    // Check for excessive content length (multi-host might receive large payloads)
    const maxContentLength = 500000; // 500KB limit
    validationChecks.details.contentLength = content.length;
    
    if (content.length > maxContentLength) {
      console.warn('[ContentSanitizer] Content exceeds maximum length:', content.length);
      validationChecks.contentLength = false;
    }
    
    // Check for suspicious patterns that might indicate corrupted data
    const suspiciousPatterns = [
      { name: 'null_bytes', pattern: /\x00/, description: 'Null bytes detected' },
      { name: 'control_chars', pattern: /[\x01-\x08\x0B\x0C\x0E-\x1F]/, description: 'Control characters detected' },
      { name: 'replacement_char', pattern: /\uFFFD/, description: 'Replacement character (encoding issues)' },
    ];
    
    const detectedPatterns: string[] = [];
    for (const { name, pattern, description } of suspiciousPatterns) {
      if (pattern.test(content)) {
        console.warn('[ContentSanitizer] Suspicious pattern detected:', description);
        detectedPatterns.push(name);
        validationChecks.suspiciousPatterns = false;
      }
    }
    validationChecks.details.suspiciousPatterns = detectedPatterns;
    
    const isValid = validationChecks.codeBlockBalance && 
                   validationChecks.lineLength && 
                   validationChecks.contentLength && 
                   validationChecks.suspiciousPatterns;
    
    // Log validation results in debug mode
    if (isDebugMode || !isValid) {
      debugLog('Content Validation', { isValid, checks: validationChecks }, componentName);
    }
    
    return isValid;
  } catch (error) {
    const errorInfo = {
      error: error instanceof Error ? error.message : 'Unknown error',
      contentLength: content ? content.length : 0
    };
    
    console.error('[ContentSanitizer] Error validating content:', error);
    debugLog('Validation Error', errorInfo, componentName);
    return false;
  }
}

/**
 * Comprehensive content preparation for safe markdown rendering
 * Enhanced for multi-host deployment reliability
 */
export function prepareMarkdownContent(content: string | undefined | null, componentName?: string): string {
  try {
    const sanitized = sanitizeContent(content, componentName);
    
    if (!sanitized) {
      console.log('[ContentSanitizer] No content after sanitization');
      debugLog('Empty Content After Sanitization', { originalLength: (content || '').length }, componentName);
      return '';
    }
    
    // Pre-validation
    if (!isValidMarkdownContent(sanitized, componentName)) {
      console.warn('[ContentSanitizer] Content failed initial validation');
      debugLog('Initial Validation Failed', { contentLength: sanitized.length }, componentName);
      // Return escaped plain text as safe fallback
      return sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    let prepared = sanitized;
    const preparations: string[] = [];
    
    // Fix unbalanced code blocks (common issue in streaming content)
    const codeBlockCount = (prepared.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Fixing unbalanced code blocks');
      prepared += '\n```'; // Close unclosed code block
      preparations.push('fixed_code_blocks');
    }
    
    // Fix unbalanced inline code (single backticks)
    const inlineCodeCount = (prepared.match(/(?<!`)`(?!`)/g) || []).length;
    if (inlineCodeCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Fixing unbalanced inline code');
      prepared += '`'; // Close unclosed inline code
      preparations.push('fixed_inline_code');
    }
    
    // Escape HTML-like content outside of code blocks to prevent XSS
    const beforeHtmlEscape = prepared.length;
    prepared = escapeHtmlOutsideCodeBlocks(prepared);
    if (prepared.length !== beforeHtmlEscape) {
      preparations.push('escaped_html');
    }
    
    // Final validation
    const finalValidation = isValidMarkdownContent(prepared, componentName);
    if (!finalValidation) {
      const errorDetails = {
        length: prepared.length,
        preview: prepared.substring(0, 200),
        preparations
      };
      
      console.error('[ContentSanitizer] Content failed final validation:', errorDetails);
      debugLog('Final Validation Failed', errorDetails, componentName);
      
      // Return escaped version as ultimate fallback
      return sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    const result = {
      originalLength: (content || '').length,
      finalLength: prepared.length,
      preparations,
      success: true
    };
    
    console.log('[ContentSanitizer] Content prepared successfully:', result);
    debugLog('Content Preparation Complete', result, componentName);
    
    return prepared;
  } catch (error) {
    const errorInfo = {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      inputLength: (content || '').length
    };
    
    console.error('[ContentSanitizer] Error preparing content:', error);
    debugLog('Preparation Error', errorInfo, componentName);
    
    // Return escaped plain text as ultimate fallback
    const fallback = String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    console.log('[ContentSanitizer] Using fallback content');
    debugLog('Using Fallback Content', { fallbackLength: fallback.length }, componentName);
    return fallback;
  }
}

/**
 * Escape HTML-like content outside of code blocks
 * Enhanced with better error handling and code block detection
 */
function escapeHtmlOutsideCodeBlocks(content: string): string {
  try {
    // More robust code block detection for multi-host scenarios
    const codeBlockRegex = /```[\s\S]*?```/g;
    const inlineCodeRegex = /`[^`\n]*`/g;
    const codeBlocks: string[] = [];
    const inlineCodeBlocks: string[] = [];
    
    let processedContent = content;
    
    // Extract and replace code blocks with placeholders
    let match;
    let codeBlockIndex = 0;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`;
      codeBlocks.push(match[0]);
      processedContent = processedContent.replace(match[0], placeholder);
      codeBlockIndex++;
    }
    
    // Extract and replace inline code with placeholders
    let inlineCodeIndex = 0;
    while ((match = inlineCodeRegex.exec(processedContent)) !== null) {
      const placeholder = `__INLINE_CODE_${inlineCodeIndex}__`;
      inlineCodeBlocks.push(match[0]);
      processedContent = processedContent.replace(match[0], placeholder);
      inlineCodeIndex++;
    }
    
    // Escape HTML in non-code content (be more selective to preserve markdown)
    processedContent = processedContent
      // Only escape < and > that look like HTML tags, not markdown
      .replace(/<(?![/!]?\w+[^>]*>)/g, '&lt;')
      .replace(/(?<!<[^>]*)>/g, '&gt;')
      // Restore basic markdown formatting
      .replace(/&lt;(\/?)(strong|em|b|i|u|s|del|ins)&gt;/gi, '<$1$2>');
    
    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, block);
    });
    
    // Restore inline code
    inlineCodeBlocks.forEach((block, index) => {
      processedContent = processedContent.replace(`__INLINE_CODE_${index}__`, block);
    });
    
    return processedContent;
  } catch (error) {
    console.error('[ContentSanitizer] Error escaping HTML:', error);
    // Return the original content if escaping fails
    return content;
  }
}

/**
 * Truncate content if it exceeds safe rendering limits
 * Enhanced for multi-host deployment memory management
 */
export function truncateForSafety(content: string, maxLength: number = 100000, componentName?: string): string {
  try {
    if (!content || typeof content !== 'string') {
      return '';
    }
    
    if (content.length <= maxLength) {
      return content;
    }
    
    const truncationInfo = {
      originalLength: content.length,
      maxLength,
      truncated: content.length - maxLength
    };
    
    console.warn('[ContentSanitizer] Content truncated:', truncationInfo);
    debugLog('Content Truncated', truncationInfo, componentName);
    
    // Try to truncate at a reasonable boundary (end of sentence or paragraph)
    const truncated = content.substring(0, maxLength);
    const lastPeriod = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const cutPoint = Math.max(lastPeriod, lastNewline);
    
    if (cutPoint > maxLength * 0.8) { // Use smart cut if it's not too far back
      return truncated.substring(0, cutPoint + 1) + '\n\n... (content truncated for safety)';
    }
    
    return truncated + '\n\n... (content truncated for safety)';
  } catch (error) {
    const errorInfo = {
      error: error instanceof Error ? error.message : 'Unknown error',
      contentLength: content ? content.length : 0
    };
    
    console.error('[ContentSanitizer] Error truncating content:', error);
    debugLog('Truncation Error', errorInfo, componentName);
    return String(content || '').substring(0, 1000) + '... (error in truncation)';
  }
}

/**
 * Comprehensive content health check for multi-host deployment
 * Returns detailed diagnostic information
 */
export function validateContentHealth(content: string, componentName?: string): {
  isValid: boolean;
  issues: string[];
  metrics: {
    length: number;
    lines: number;
    codeBlocks: number;
    specialChars: number;
  };
} {
  const result = {
    isValid: true,
    issues: [] as string[],
    metrics: {
      length: 0,
      lines: 0,
      codeBlocks: 0,
      specialChars: 0,
    }
  };
  
  try {
    if (!content || typeof content !== 'string') {
      result.isValid = false;
      result.issues.push('Invalid content type');
      debugLog('Health Check Failed - Invalid Type', { type: typeof content }, componentName);
      return result;
    }
    
    result.metrics.length = content.length;
    result.metrics.lines = content.split('\n').length;
    result.metrics.codeBlocks = (content.match(/```/g) || []).length;
    result.metrics.specialChars = (content.match(/[\u2018\u2019\u201C\u201D\u2026]/g) || []).length;
    
    // Check for various issues
    if (result.metrics.length > 500000) {
      result.issues.push('Content too long');
      result.isValid = false;
    }
    
    if (result.metrics.codeBlocks % 2 !== 0) {
      result.issues.push('Unbalanced code blocks');
    }
    
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(content)) {
      result.issues.push('Contains control characters');
    }
    
    if (result.issues.length > 0) {
      result.isValid = false;
    }
    
    // Log health check results in debug mode
    if (isDebugMode || !result.isValid) {
      debugLog('Content Health Check', { result, componentName }, componentName);
    }
    
    return result;
  } catch (error) {
    const errorInfo = {
      error: error instanceof Error ? error.message : 'Unknown error'
    };
    
    console.error('[ContentSanitizer] Error in health check:', error);
    debugLog('Health Check Error', errorInfo, componentName);
    
    result.isValid = false;
    result.issues.push('Health check failed');
    return result;
  }
}

/**
 * Enhanced markdown rendering safety wrapper
 * Provides comprehensive error handling and logging for ReactMarkdown
 */
export function safeMarkdownRender(content: string, componentName?: string): {
  content: string;
  isValid: boolean;
  warnings: string[];
} {
  const result = {
    content: '',
    isValid: true,
    warnings: [] as string[]
  };
  
  try {
    // Validate input
    if (!content || typeof content !== 'string') {
      result.isValid = false;
      result.warnings.push('Invalid content type');
      debugLog('Safe Render Failed - Invalid Input', { type: typeof content }, componentName);
      return result;
    }
    
    // Run health check
    const healthCheck = validateContentHealth(content, componentName);
    if (!healthCheck.isValid) {
      result.warnings.push(...healthCheck.issues);
    }
    
    // Prepare content for rendering
    const preparedContent = prepareMarkdownContent(content, componentName);
    
    // Final validation
    if (!preparedContent) {
      result.isValid = false;
      result.warnings.push('Content preparation failed');
      result.content = 'Content could not be prepared for safe rendering';
      debugLog('Safe Render Failed - Preparation Failed', {}, componentName);
      return result;
    }
    
    result.content = preparedContent;
    
    // Log successful preparation
    if (isDebugMode) {
      debugLog('Safe Render Success', {
        originalLength: content.length,
        preparedLength: preparedContent.length,
        warnings: result.warnings
      }, componentName);
    }
    
    return result;
  } catch (error) {
    const errorInfo = {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    };
    
    console.error('[ContentSanitizer] Error in safe markdown render:', error);
    debugLog('Safe Render Error', errorInfo, componentName);
    
    result.isValid = false;
    result.warnings.push('Rendering preparation failed');
    result.content = 'Error preparing content for safe rendering';
    return result;
  }
}
