/**
 * Sanitizes content for safe rendering in React components
 */

/**
 * Remove control characters that could cause rendering issues
 */
export function sanitizeContent(content: string | undefined | null): string {
  if (!content) return '';
  
  // Debug logging for problematic content
  if (content.includes('...') || content.includes('\u2019') || content.includes('\u2018') || content.includes('\u201C') || content.includes('\u201D')) {
    console.log('[ContentSanitizer] Processing content with special characters:', {
      length: content.length,
      hasEllipsis: content.includes('...'),
      hasSmartQuotes: /[\u2018\u2019\u201C\u201D]/.test(content),
      preview: content.substring(0, 100)
    });
  }
  
  return content
    // Remove null bytes and other control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Replace smart quotes with regular quotes
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    // Normalize ellipsis (in case of special Unicode ellipsis character)
    .replace(/\u2026/g, '...')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Remove excessive newlines (more than 3 in a row)
    .replace(/\n{4,}/g, '\n\n\n')
    // Remove zero-width characters that might cause issues
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Trim whitespace
    .trim();
}

/**
 * Validates if content is safe to render with ReactMarkdown
 */
export function isValidMarkdownContent(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  
  // Check for balanced code blocks
  const codeBlockCount = (content.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    console.warn('[ContentSanitizer] Unbalanced code blocks detected');
    return false;
  }
  
  // Check for extremely long lines that might cause performance issues
  const lines = content.split('\n');
  const hasExtremelyLongLines = lines.some(line => line.length > 10000);
  if (hasExtremelyLongLines) {
    console.warn('[ContentSanitizer] Extremely long lines detected');
    return false;
  }
  
  return true;
}

/**
 * Prepares content for safe markdown rendering
 */
export function prepareMarkdownContent(content: string | undefined | null): string {
  try {
    const sanitized = sanitizeContent(content);
    
    if (!sanitized) return '';
    
    // Fix common markdown issues that could cause crashes
    let prepared = sanitized;
    
    // Ensure code blocks are properly closed
    const codeBlockCount = (prepared.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      console.warn('[ContentSanitizer] Fixing unbalanced code blocks');
      prepared += '\n```'; // Close unclosed code block
    }
    
    // Escape HTML-like content that's not in code blocks
    // This prevents XSS and rendering issues
    prepared = escapeHtmlOutsideCodeBlocks(prepared);
    
    // Final validation
    if (!isValidMarkdownContent(prepared)) {
      console.error('[ContentSanitizer] Content failed validation after preparation:', {
        length: prepared.length,
        preview: prepared.substring(0, 200)
      });
    }
    
    return prepared;
  } catch (error) {
    console.error('[ContentSanitizer] Error preparing content:', error);
    // Return escaped plain text as fallback
    return (content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * Escapes HTML-like content outside of code blocks
 */
function escapeHtmlOutsideCodeBlocks(content: string): string {
  try {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const codeBlocks: string[] = [];
    let match;
    
    // Extract code blocks
    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push(match[0]);
    }
    
    // Replace code blocks with placeholders
    let processedContent = content;
    codeBlocks.forEach((block, index) => {
      processedContent = processedContent.replace(block, `__CODE_BLOCK_${index}__`);
    });
    
    // Escape HTML in non-code-block content
    processedContent = processedContent
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Restore code blocks
    codeBlocks.forEach((block, index) => {
      processedContent = processedContent.replace(`__CODE_BLOCK_${index}__`, block);
    });
    
    return processedContent;
  } catch (error) {
    console.error('[ContentSanitizer] Error escaping HTML:', error);
    // Return the original content if escaping fails
    return content;
  }
}

/**
 * Truncates content if it's too long for safe rendering
 */
export function truncateForSafety(content: string, maxLength: number = 100000): string {
  if (!content || content.length <= maxLength) return content || '';
  
  console.warn(`[ContentSanitizer] Content truncated from ${content.length} to ${maxLength} characters`);
  return content.substring(0, maxLength) + '\n\n... (content truncated for safety)';
}
