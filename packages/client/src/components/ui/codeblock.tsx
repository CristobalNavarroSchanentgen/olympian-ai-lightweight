import { useState, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  language?: string;
}

// Extract language from className (e.g., "language-javascript" -> "javascript")
const extractLanguage = (className?: string): string => {
  if (!className) return 'text';
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : 'text';
};

// Get the text content from children
const getTextContent = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map(child => getTextContent(child)).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as any).props.children);
  }
  return String(children || '');
};

// Custom dark theme optimized for the Multi-host deployment styling
const customDarkTheme = {
  'code[class*="language-"]': {
    color: '#f8fafc',
    background: 'transparent',
    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
    fontSize: '0.875rem',
    textAlign: 'left' as const,
    whiteSpace: 'pre' as const,
    wordSpacing: 'normal',
    wordBreak: 'normal' as const,
    wordWrap: 'normal' as const,
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none' as const,
  },
  'pre[class*="language-"]': {
    color: '#f8fafc',
    background: '#1f2937',
    fontFamily: 'Consolas, Monaco, "Andale Mono", "Ubuntu Mono", monospace',
    fontSize: '0.875rem',
    textAlign: 'left' as const,
    whiteSpace: 'pre' as const,
    wordSpacing: 'normal',
    wordBreak: 'normal' as const,
    wordWrap: 'normal' as const,
    lineHeight: '1.5',
    MozTabSize: '4',
    OTabSize: '4',
    tabSize: '4',
    WebkitHyphens: 'none',
    MozHyphens: 'none',
    msHyphens: 'none',
    hyphens: 'none' as const,
    padding: '0.75rem',
    margin: '0.5rem 0',
    overflow: 'auto',
    borderRadius: '0.5rem',
    border: '1px solid #374151',
  },
  // Token styles - these actually work!
  comment: {
    color: '#6b7280',
    fontStyle: 'italic',
  },
  prolog: {
    color: '#6b7280',
  },
  doctype: {
    color: '#6b7280',
  },
  cdata: {
    color: '#6b7280',
  },
  punctuation: {
    color: '#d1d5db',
  },
  '.namespace': {
    opacity: '0.7',
  },
  property: {
    color: '#10b981',
  },
  tag: {
    color: '#f472b6',
  },
  constant: {
    color: '#a78bfa',
  },
  symbol: {
    color: '#a78bfa',
  },
  deleted: {
    color: '#ef4444',
  },
  boolean: {
    color: '#a78bfa',
  },
  number: {
    color: '#f59e0b',
  },
  selector: {
    color: '#10b981',
  },
  'attr-name': {
    color: '#10b981',
  },
  string: {
    color: '#84cc16',
  },
  char: {
    color: '#84cc16',
  },
  builtin: {
    color: '#06b6d4',
  },
  inserted: {
    color: '#10b981',
  },
  operator: {
    color: '#f472b6',
  },
  entity: {
    color: '#f59e0b',
    cursor: 'help',
  },
  url: {
    color: '#06b6d4',
  },
  '.language-css .token.string': {
    color: '#84cc16',
  },
  '.style .token.string': {
    color: '#84cc16',
  },
  variable: {
    color: '#f8fafc',
  },
  atrule: {
    color: '#84cc16',
  },
  'attr-value': {
    color: '#84cc16',
  },
  function: {
    color: '#06b6d4',
  },
  'class-name': {
    color: '#fbbf24',
  },
  keyword: {
    color: '#f472b6',
    fontWeight: 'bold',
  },
  regex: {
    color: '#84cc16',
  },
  important: {
    color: '#ef4444',
    fontWeight: 'bold',
  },
  bold: {
    fontWeight: 'bold',
  },
  italic: {
    fontStyle: 'italic',
  },
  // Language-specific enhancements
  '.token.function-name': {
    color: '#06b6d4',
  },
  '.token.method': {
    color: '#06b6d4',
  },
  '.token.parameter': {
    color: '#f8fafc',
  },
  '.token.literal-property': {
    color: '#10b981',
  },
  '.token.module': {
    color: '#a78bfa',
  },
  '.token.decorator': {
    color: '#fbbf24',
  },
  '.token.annotation': {
    color: '#fbbf24',
  },
  '.token.generic': {
    color: '#a78bfa',
  },
  '.token.arrow': {
    color: '#f472b6',
  },
  '.token.spread': {
    color: '#f472b6',
  },
  '.token.template-string': {
    color: '#84cc16',
  },
  '.token.interpolation': {
    color: '#f8fafc',
  },
  '.token.interpolation-punctuation': {
    color: '#f472b6',
  },
};

export function CodeBlock({ children, className, language }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  
  // Extract language from className or use provided language
  const detectedLanguage = language || extractLanguage(className);
  const codeContent = getTextContent(children);

  const copyToClipboard = async () => {
    const textContent = codeRef.current?.textContent || codeContent;
    
    try {
      await navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = textContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <div className="relative group">
      <SyntaxHighlighter
        language={detectedLanguage}
        style={customDarkTheme}
        PreTag={({ children, ...props }) => (
          <pre {...props} ref={codeRef}>
            {children}
          </pre>
        )}
        showLineNumbers={false}
        wrapLines={true}
        customStyle={{
          margin: '0.5rem 0',
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: '0.5rem',
          padding: '0.75rem',
        }}
      >
        {codeContent}
      </SyntaxHighlighter>
      
      {/* Copy button positioned in the bottom right */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute bottom-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity",
          "bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white",
          isCopied && "opacity-100"
        )}
        onClick={copyToClipboard}
        aria-label={isCopied ? "Copied" : "Copy code"}
      >
        {isCopied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
