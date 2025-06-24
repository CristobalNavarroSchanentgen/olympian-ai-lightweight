/**
 * Sanitizes content for safe rendering in React components
 */

/**
 * Remove control characters that could cause rendering issues
 */
export function sanitizeContent(content: string | undefined | null): string {
  if (!content) return '';
  
  return content
    // Remove null bytes and other control characters except newlines and tabs
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Remove excessive newlines (more than 3 in a row)
    .replace(/\n{4,}/g, '\n\n\n')
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
  const sanitized = sanitizeContent(content);
  
  if (!sanitized) return '';
  
  // Fix common markdown issues that could cause crashes
  let prepared = sanitized;
  
  // Ensure code blocks are properly closed
  const codeBlockCount = (prepared.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    prepared += '\n```'; // Close unclosed code block
  }
  
  // Escape HTML-like content that's not in code blocks
  // This prevents XSS and rendering issues
  prepared = escapeHtmlOutsideCodeBlocks(prepared);
  
  return prepared;
}

/**
 * Escapes HTML-like content outside of code blocks
 */
function escapeHtmlOutsideCodeBlocks(content: string): string {
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
}

/**
 * Truncates content if it's too long for safe rendering
 */
export function truncateForSafety(content: string, maxLength: number = 100000): string {
  if (content.length <= maxLength) return content;
  
  console.warn(`[ContentSanitizer] Content truncated from ${content.length} to ${maxLength} characters`);
  return content.substring(0, maxLength) + '\n\n... (content truncated for safety)';
}
