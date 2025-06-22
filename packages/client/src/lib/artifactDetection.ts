import { ArtifactDetectionResult, ArtifactType } from '@olympian/shared';

/**
 * Detects if content should be displayed as an artifact
 * Inspired by Claude's artifact detection logic
 */
export function detectArtifact(content: string): ArtifactDetectionResult {
  const trimmedContent = content.trim();
  
  // Skip very short content
  if (trimmedContent.length < 50) {
    return { shouldCreateArtifact: false };
  }

  // Detect code blocks with language
  const codeBlockRegex = /^```(\w+)?\s*([\s\S]*?)```$/m;
  const codeMatch = trimmedContent.match(codeBlockRegex);
  
  if (codeMatch) {
    const language = codeMatch[1] || 'text';
    const codeContent = codeMatch[2]?.trim();
    
    if (!codeContent || codeContent.length < 20) {
      return { shouldCreateArtifact: false };
    }

    // Determine artifact type based on language
    const type = getArtifactTypeFromLanguage(language);
    const title = generateTitleFromContent(codeContent, type);
    
    return {
      shouldCreateArtifact: true,
      type,
      title,
      language: language.toLowerCase(),
      content: codeContent
    };
  }

  // Detect HTML content (not in code blocks)
  if (isHTML(trimmedContent)) {
    return {
      shouldCreateArtifact: true,
      type: 'html',
      title: 'HTML Document',
      content: trimmedContent
    };
  }

  // Detect SVG content
  if (isSVG(trimmedContent)) {
    return {
      shouldCreateArtifact: true,
      type: 'svg',
      title: 'SVG Diagram',
      content: trimmedContent
    };
  }

  // Detect JSON
  if (isJSON(trimmedContent)) {
    return {
      shouldCreateArtifact: true,
      type: 'json',
      title: 'JSON Data',
      content: trimmedContent
    };
  }

  // Detect CSV
  if (isCSV(trimmedContent)) {
    return {
      shouldCreateArtifact: true,
      type: 'csv',
      title: 'CSV Data',
      content: trimmedContent
    };
  }

  // Detect Mermaid diagrams
  if (isMermaid(trimmedContent)) {
    return {
      shouldCreateArtifact: true,
      type: 'mermaid',
      title: 'Mermaid Diagram',
      content: trimmedContent
    };
  }

  // Detect substantial markdown content
  if (isSubstantialMarkdown(trimmedContent)) {
    return {
      shouldCreateArtifact: true,
      type: 'markdown',
      title: 'Document',
      content: trimmedContent
    };
  }

  return { shouldCreateArtifact: false };
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

function generateTitleFromContent(content: string, type: ArtifactType): string {
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
  
  // For code, try to extract function or class names
  const funcMatch = content.match(/(?:function|def|class)\s+(\w+)/);
  if (funcMatch) {
    return `${funcMatch[1]}`;
  }
  
  // Default to first line (truncated)
  const firstLine = lines[0] || 'Code';
  return firstLine.length > 30 ? firstLine.substring(0, 27) + '...' : firstLine;
}

function isHTML(content: string): boolean {
  const htmlTagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/i;
  return htmlTagRegex.test(content) && content.includes('<') && content.includes('>');
}

function isSVG(content: string): boolean {
  return content.includes('<svg') && content.includes('</svg>');
}

function isJSON(content: string): boolean {
  try {
    JSON.parse(content);
    return content.startsWith('{') || content.startsWith('[');
  } catch {
    return false;
  }
}

function isCSV(content: string): boolean {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length < 2) return false;
  
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  
  if (commaCount < 1) return false;
  
  // Check if subsequent lines have similar comma counts
  const secondLine = lines[1];
  const secondCommaCount = (secondLine.match(/,/g) || []).length;
  
  return Math.abs(commaCount - secondCommaCount) <= 1;
}

function isMermaid(content: string): boolean {
  const mermaidKeywords = ['graph', 'flowchart', 'sequenceDiagram', 'gantt', 'classDiagram', 'stateDiagram'];
  return mermaidKeywords.some(keyword => content.includes(keyword));
}

function isSubstantialMarkdown(content: string): boolean {
  const markdownFeatures = [
    /^#{1,6}\s+/m, // Headers
    /\*\*.*?\*\*/,  // Bold
    /\*.*?\*/,      // Italic
    /\[.*?\]\(.*?\)/, // Links
    /^[\*\-\+]\s+/m,  // Lists
    /^>\s+/m,       // Blockquotes
    /^```/m,        // Code blocks
  ];
  
  const featureCount = markdownFeatures.filter(regex => regex.test(content)).length;
  return featureCount >= 2 && content.length > 200;
}
