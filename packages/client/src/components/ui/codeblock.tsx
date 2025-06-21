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

  // Enhanced oneDark theme with better contrast and consistency
  const enhancedOneDarkStyle = {
    ...oneDark,
    'pre[class*="language-"]': {
      ...oneDark['pre[class*="language-"]'],
      background: '#1f2937', // gray-800 to match existing theme
      border: '1px solid #374151', // gray-700 border
      borderRadius: '0.5rem',
      margin: '0.5rem 0',
      padding: '0.75rem',
      fontSize: '0.875rem',
      lineHeight: '1.5',
      overflow: 'auto',
    },
    'code[class*="language-"]': {
      ...oneDark['code[class*="language-"]'],
      background: 'transparent',
      fontSize: '0.875rem',
      lineHeight: '1.5',
      color: '#f8f8f2', // Ensure base text color is visible
    },
    // Enhanced token colors for better visibility
    'token.comment': {
      color: '#6272a4',
      fontStyle: 'italic',
    },
    'token.prolog': {
      color: '#6272a4',
    },
    'token.doctype': {
      color: '#6272a4',
    },
    'token.cdata': {
      color: '#6272a4',
    },
    'token.punctuation': {
      color: '#f8f8f2',
    },
    'token.property': {
      color: '#50fa7b',
    },
    'token.tag': {
      color: '#ff79c6',
    },
    'token.constant': {
      color: '#bd93f9',
    },
    'token.symbol': {
      color: '#bd93f9',
    },
    'token.deleted': {
      color: '#ff5555',
    },
    'token.boolean': {
      color: '#bd93f9',
    },
    'token.number': {
      color: '#bd93f9',
    },
    'token.selector': {
      color: '#50fa7b',
    },
    'token.attr-name': {
      color: '#50fa7b',
    },
    'token.string': {
      color: '#f1fa8c',
    },
    'token.char': {
      color: '#f1fa8c',
    },
    'token.builtin': {
      color: '#8be9fd',
    },
    'token.inserted': {
      color: '#50fa7b',
    },
    'token.operator': {
      color: '#ff79c6',
    },
    'token.entity': {
      color: '#f8f8f2',
    },
    'token.url': {
      color: '#8be9fd',
    },
    'token.variable': {
      color: '#f8f8f2',
    },
    'token.atrule': {
      color: '#f1fa8c',
    },
    'token.attr-value': {
      color: '#f1fa8c',
    },
    'token.function': {
      color: '#8be9fd',
    },
    'token.class-name': {
      color: '#8be9fd',
    },
    'token.keyword': {
      color: '#ff79c6',
    },
    'token.regex': {
      color: '#f1fa8c',
    },
    'token.important': {
      color: '#ff5555',
      fontWeight: 'bold',
    },
  };

  return (
    <div className="relative group">
      <SyntaxHighlighter
        language={detectedLanguage}
        style={enhancedOneDarkStyle}
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
