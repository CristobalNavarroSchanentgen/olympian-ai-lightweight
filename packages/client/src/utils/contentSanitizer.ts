/**
 * Content sanitization utilities for safe rendering in React components
 * Enhanced for multi-host deployment scenarios (Subproject 3)
 */

/**
 * Remove control characters and normalize content for safe rendering
 * Following React best practices for content validation
 */
export function sanitizeContent(content: string | undefined | null): string {
  try {
    // Guard against invalid input following React patterns
    if (!content || typeof content !== 'string') {
      console.warn('[ContentSanitizer] Invalid content type:', typeof content);
      return '';
    }
    
    // Enhanced logging for special characters using proper Unicode patterns
    const hasSpecialChars = /[\u2018\u2019\u201C\u201D\u2026]/.test(content) || content.includes('...');
    if (hasSpecialChars) {
      console.log('[ContentSanitizer] Processing content with special characters:', {
        length: content.length,
        hasEllipsis: content.includes('...'),
        hasUnicodeEllipsis: content.includes('\u2026'),
        hasSmartQuotes: /[\u2018\u2019\u201C\u201D]/.test(content),
        preview: content.substring(0, 100)
      });
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

    // Validate result
    if (!sanitized && content.length > 0) {
      console.warn('[ContentSanitizer] Sanitization resulted in empty string from non-empty input');
    }
    
    return sanitized;
  } catch (error) {
    console.error('[ContentSanitizer] Error in sanitizeContent:', error);
    // Return the original content as fallback, but escaped
    return String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * Enhanced validation for markdown content safety
 * Includes checks for multi-host deployment edge cases
 */
export function isValidMarkdownContent(content: string): boolean {
  try {
    if (!content || typeof content !== 'string') {
      console.warn('[ContentSanitizer] Invalid content for validation:', typeof content);
      return false;
    }
    
    // Check for balanced code blocks
    const codeBlockMatches = content.match(/```/g);
    const codeBlockCount = codeBlockMatches ? codeBlockMatches.length : 0;
    if (codeBlockCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Unbalanced code blocks detected:', codeBlockCount);
      return false;
    }
    
    // Check for extremely long lines that might cause performance issues
    const lines = content.split('\n');
    const maxLineLength = 10000; // Reasonable limit for web display
    const hasExtremelyLongLines = lines.some(line => line.length > maxLineLength);
    if (hasExtremelyLongLines) {
      console.warn('[ContentSanitizer] Extremely long lines detected (>10k chars)');
      return false;
    }
    
    // Check for excessive content length (multi-host might receive large payloads)
    const maxContentLength = 500000; // 500KB limit
    if (content.length > maxContentLength) {
      console.warn('[ContentSanitizer] Content exceeds maximum length:', content.length);
      return false;
    }
    
    // Check for suspicious patterns that might indicate corrupted data
    const suspiciousPatterns = [
      /\x00/,                    // Null bytes
      /[\x01-\x08\x0B\x0C\x0E-\x1F]/, // Other control characters
      /\uFFFD/,                  // Replacement character (indicates encoding issues)
    ];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(content)) {
        console.warn('[ContentSanitizer] Suspicious pattern detected:', pattern);
        return false;
      }
    }
    
    return true;
  } catch (error) {
    console.error('[ContentSanitizer] Error validating content:', error);
    return false;
  }
}

/**
 * Comprehensive content preparation for safe markdown rendering
 * Enhanced for multi-host deployment reliability
 */
export function prepareMarkdownContent(content: string | undefined | null): string {
  try {
    const sanitized = sanitizeContent(content);
    
    if (!sanitized) {
      console.log('[ContentSanitizer] No content after sanitization');
      return '';
    }
    
    // Pre-validation
    if (!isValidMarkdownContent(sanitized)) {
      console.warn('[ContentSanitizer] Content failed initial validation');
      // Return escaped plain text as safe fallback
      return sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    let prepared = sanitized;
    
    // Fix unbalanced code blocks (common issue in streaming content)
    const codeBlockCount = (prepared.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Fixing unbalanced code blocks');
      prepared += '\n```'; // Close unclosed code block
    }
    
    // Fix unbalanced inline code (single backticks)
    const inlineCodeCount = (prepared.match(/(?<!`)`(?!`)/g) || []).length;
    if (inlineCodeCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Fixing unbalanced inline code');
      prepared += '`'; // Close unclosed inline code
    }
    
    // Escape HTML-like content outside of code blocks to prevent XSS
    prepared = escapeHtmlOutsideCodeBlocks(prepared);
    
    // Final validation
    if (!isValidMarkdownContent(prepared)) {
      console.error('[ContentSanitizer] Content failed final validation:', {
        length: prepared.length,
        preview: prepared.substring(0, 200)
      });
      // Return escaped version as ultimate fallback
      return sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    
    console.log('[ContentSanitizer] Content prepared successfully:', {
      originalLength: (content || '').length,
      finalLength: prepared.length
    });
    
    return prepared;
  } catch (error) {
    console.error('[ContentSanitizer] Error preparing content:', error);
    // Return escaped plain text as ultimate fallback
    const fallback = String(content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    console.log('[ContentSanitizer] Using fallback content');
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
export function truncateForSafety(content: string, maxLength: number = 100000): string {
  try {
    if (!content || typeof content !== 'string') {
      return '';
    }
    
    if (content.length <= maxLength) {
      return content;
    }
    
    console.warn('[ContentSanitizer] Content truncated:', {
      originalLength: content.length,
      maxLength,
      truncated: content.length - maxLength
    });
    
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
    console.error('[ContentSanitizer] Error truncating content:', error);
    return String(content || '').substring(0, 1000) + '... (error in truncation)';
  }
}

/**
 * Comprehensive content health check for multi-host deployment
 * Returns detailed diagnostic information
 */
export function validateContentHealth(content: string): {
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
    
    return result;
  } catch (error) {
    console.error('[ContentSanitizer] Error in health check:', error);
    result.isValid = false;
    result.issues.push('Health check failed');
    return result;
  }
}
