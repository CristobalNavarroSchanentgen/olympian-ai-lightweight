import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  language?: string;
}

export function CodeBlock({ children, className, language }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = async () => {
    // Extract text content from the code element
    const codeElement = document.querySelector('.code-block-content');
    const textContent = codeElement?.textContent || '';
    
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
      <pre className={cn(
        "overflow-x-auto rounded-lg bg-gray-800 border border-gray-700 p-3 my-2",
        className
      )}>
        <code className={cn("code-block-content", className)}>
          {children}
        </code>
      </pre>
      
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
