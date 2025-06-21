import { useState, useRef } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

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

  // Custom style based on oneDark but with improvements for better readability
  const customOneDarkStyle = {
    ...oneDark,
    'pre[class*="language-"]': {
      ...oneDark['pre[class*="language-"]'],
      background: 'rgb(31, 41, 55)', // gray-800 to match existing theme
      border: '1px solid rgb(55, 65, 81)', // gray-700 border
      borderRadius: '0.5rem',
      margin: '0.5rem 0',
      padding: '0.75rem',
      fontSize: '0.875rem',
      lineHeight: '1.5',
    },
    'code[class*="language-"]': {
      ...oneDark['code[class*="language-"]'],
      background: 'transparent',
      fontSize: '0.875rem',
      lineHeight: '1.5',
    }
  };

  return (
    <div className="relative group">
      <SyntaxHighlighter
        language={detectedLanguage}
        style={customOneDarkStyle}
        PreTag={({ children, ...props }) => (
          <pre {...props} ref={codeRef}>
            {children}
          </pre>
        )}
        showLineNumbers={false}
        wrapLines={true}
        customStyle={{
          margin: '0.5rem 0',
          background: 'rgb(31, 41, 55)',
          border: '1px solid rgb(55, 65, 81)',
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
