import { useState, useRef, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark-dimmed.css';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  language?: string;
  showLineNumbers?: boolean;
}

// Extract language from className (e.g., "language-javascript" -> "javascript")
const extractLanguage = (className?: string): string => {
  if (!className) return '';
  const match = className.match(/language-([\w-]+)/);
  return match ? match[1].toLowerCase() : '';
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

// Initialize Highlight.js and set up MutationObserver for dynamic content
const initializeHighlightJs = () => {
  // Apply highlighting to all existing <pre><code> blocks
  document.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block as HTMLElement);
  });

  // Set up MutationObserver for real-time highlighting of new content
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const codeBlocks = (node as Element).querySelectorAll('pre code');
          codeBlocks.forEach((block) => hljs.highlightElement(block as HTMLElement));
        }
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  
  return observer;
};

// Generate line numbers for code content
const generateLineNumbers = (content: string): string[] => {
  const lines = content.split('\n');
  return lines.map((_, index) => (index + 1).toString());
};

export function CodeBlock({ 
  children, 
  className, 
  language, 
  showLineNumbers = false 
}: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  
  // Initialize Highlight.js on component mount
  useEffect(() => {
    if (!observerRef.current) {
      observerRef.current = initializeHighlightJs();
    }

    // Cleanup observer on unmount
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, []);

  // Extract and normalize language
  const detectedLanguage = language || extractLanguage(className);
  const codeContent = getTextContent(children);
  
  // Generate line numbers if needed
  const lineNumbers = showLineNumbers ? generateLineNumbers(codeContent) : [];

  // Highlight the specific code block when content changes
  useEffect(() => {
    if (codeRef.current) {
      // Remove any existing highlighting classes
      codeRef.current.removeAttribute('data-highlighted');
      codeRef.current.className = detectedLanguage ? `language-${detectedLanguage}` : '';
      
      // Apply highlighting
      hljs.highlightElement(codeRef.current);
    }
  }, [codeContent, detectedLanguage]);

  const copyToClipboard = async () => {
    const textContent = codeRef.current?.textContent || codeContent;
    
    try {
      await navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers or insecure contexts
      const textArea = document.createElement('textarea');
      textArea.value = textContent;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (execErr) {
        console.error('Fallback copy failed: ', execErr);
      }
      
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="relative group my-4">
      <pre className={cn(
        "hljs",
        "overflow-x-auto",
        "rounded-lg",
        "border border-gray-700",
        "bg-[#22272e]",
        "text-sm",
        "font-mono",
        "leading-relaxed",
        showLineNumbers ? "p-0" : "p-4"
      )}>
        {showLineNumbers ? (
          <div className="flex">
            {/* Line numbers column */}
            <div className="flex flex-col py-4 px-2 bg-gray-800/50 border-r border-gray-600 text-gray-500 text-right select-none">
              {lineNumbers.map((num, index) => (
                <span key={index} className="block leading-relaxed text-xs">
                  {num}
                </span>
              ))}
            </div>
            {/* Code content */}
            <div className="flex-1 py-4 px-4">
              <code 
                ref={codeRef}
                className={detectedLanguage ? `language-${detectedLanguage}` : ''}
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                }}
              >
                {codeContent}
              </code>
            </div>
          </div>
        ) : (
          <code 
            ref={codeRef}
            className={detectedLanguage ? `language-${detectedLanguage}` : ''}
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              fontSize: '0.875rem',
              lineHeight: '1.5',
            }}
          >
            {codeContent}
          </code>
        )}
      </pre>
      
      {/* Copy button with improved styling for multi-host deployment */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-all duration-200",
          "bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white",
          "border border-gray-600/50 hover:border-gray-500",
          "backdrop-blur-sm",
          isCopied && "opacity-100 bg-green-800/80 text-green-300"
        )}
        onClick={copyToClipboard}
        aria-label={isCopied ? "Copied!" : "Copy code"}
        title={isCopied ? "Copied!" : "Copy code"}
      >
        {isCopied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>

      {/* Language indicator for multi-host deployment */}
      {detectedLanguage && (
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-xs px-2 py-1 bg-gray-800/80 text-gray-300 rounded border border-gray-600/50 backdrop-blur-sm font-mono">
            {detectedLanguage}
          </span>
        </div>
      )}
    </div>
  );
}
