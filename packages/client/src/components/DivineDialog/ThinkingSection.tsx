import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronRight, 
  Brain,
  Eye,
  EyeOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { CodeBlock } from '../ui/codeblock';
import type { ThinkingData } from '@olympian/shared';

interface ThinkingSectionProps {
  thinking: ThinkingData;
  className?: string;
}

export function ThinkingSection({ thinking, className }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!thinking.hasThinking || !thinking.content.trim()) {
    return null;
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Count words for a rough indication of thinking length
  const wordCount = thinking.content.trim().split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200); // Assume 200 words per minute

  return (
    <div className={cn("mt-4 rounded-lg border border-gray-700 bg-gray-800/30", className)}>
      {/* Collapsed Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-blue-400" />
          <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 border-blue-600/30">
            Thinking
          </Badge>
          <span className="text-xs text-gray-400">
            {wordCount} words • ~{readingTime}min read
          </span>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50"
        >
          {isExpanded ? (
            <>
              <EyeOff className="h-4 w-4" />
              Hide reasoning
              <ChevronDown className="h-3 w-3" />
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              View reasoning
              <ChevronRight className="h-3 w-3" />
            </>
          )}
        </Button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-700">
          <div className="p-4">
            <div className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed">
              <ReactMarkdown
                components={{
                  // Handle code blocks in thinking content
                  pre: ({ node: _node, children }) => {
                    if (children && typeof children === 'object' && 'props' in children) {
                      const { className, children: codeChildren } = (children as any).props;
                      return (
                        <CodeBlock className={className} showLineNumbers={false}>
                          {codeChildren}
                        </CodeBlock>
                      );
                    }
                    return (
                      <CodeBlock showLineNumbers={false}>
                        {children}
                      </CodeBlock>
                    );
                  },
                  code: ({ node: _node, children, className, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !match;
                    
                    return isInline ? (
                      <code className="rounded bg-gray-700 px-1 py-0.5 text-sm text-blue-200" {...props}>
                        {children}
                      </code>
                    ) : (
                      <>{children}</>
                    );
                  },
                  // Style thinking content appropriately
                  p: ({ children }) => (
                    <p className="mb-3 text-gray-300 leading-relaxed">
                      {children}
                    </p>
                  ),
                  // Handle thinking section separators
                  hr: () => (
                    <div className="my-4 flex items-center">
                      <div className="flex-1 border-t border-gray-600"></div>
                      <div className="mx-3 text-xs text-gray-500">• • •</div>
                      <div className="flex-1 border-t border-gray-600"></div>
                    </div>
                  ),
                }}
              >
                {thinking.content}
              </ReactMarkdown>
            </div>
            
            {/* Footer with metadata */}
            <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center justify-between text-xs text-gray-500">
              <span>
                Processed: {thinking.processedAt.toLocaleTimeString()}
              </span>
              <span className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                Reasoning trace
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
