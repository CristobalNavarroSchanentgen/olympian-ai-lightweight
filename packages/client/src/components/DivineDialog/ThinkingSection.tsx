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
import { getThinkingContent } from '@olympian/shared';

interface ThinkingSectionProps {
  thinking: ThinkingData;
  className?: string;
}

export function ThinkingSection({ thinking, className }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // ENHANCED: More robust validation with fallback content retrieval
  const thinkingContent = thinking.content || getThinkingContent({ thinking });
  const hasValidThinking = thinking.hasThinking && thinkingContent.trim().length > 0;

  // Enhanced debug logging for development
  if (process.env.NODE_ENV === 'development') {
    console.log('🧠 [ThinkingSection] Render check:', {
      hasThinking: thinking.hasThinking,
      contentLength: thinking.content?.length || 0,
      fallbackContentLength: thinkingContent.length,
      hasValidThinking,
      contentPreview: thinkingContent.substring(0, 100) + '...'
    });
  }

  if (!hasValidThinking) {
    // Enhanced debug logging for when thinking section doesn't render
    if (process.env.NODE_ENV === 'development') {
      console.warn('🧠 [ThinkingSection] Not rendering - validation failed:', {
        hasThinkingFlag: thinking.hasThinking,
        hasContent: !!thinking.content,
        contentLength: thinking.content?.length || 0,
        trimmedLength: thinking.content?.trim()?.length || 0,
        fallbackContentLength: thinkingContent.length,
        thinkingObject: thinking
      });
    }
    return null;
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Count words for a rough indication of thinking length
  const wordCount = thinkingContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200)); // Assume 200 words per minute, minimum 1 minute

  return (
    <div className={cn("mt-4 rounded-lg border border-gray-700 bg-gray-800/30", className)}>
      {/* Collapsed Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-blue-400" />
          <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 border-blue-600/30">
            Reasoning
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
                    const match = /language-(\\w+)/.exec(className || '');
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
                  // Enhanced list styling for thinking content
                  ul: ({ children }) => (
                    <ul className="mb-3 ml-4 list-disc text-gray-300">
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="mb-3 ml-4 list-decimal text-gray-300">
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li className="mb-1 text-gray-300">
                      {children}
                    </li>
                  ),
                  // Style headings in thinking content
                  h1: ({ children }) => (
                    <h1 className="text-lg font-semibold text-blue-200 mb-2">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-base font-semibold text-blue-200 mb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-sm font-semibold text-blue-200 mb-2">
                      {children}
                    </h3>
                  ),
                  // Style blockquotes for thinking content
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-2 border-blue-400 pl-3 ml-2 text-gray-400 italic">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {thinkingContent}
              </ReactMarkdown>
            </div>
            
            {/* Footer with metadata */}
            <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center justify-between text-xs text-gray-500">
              <span>
                Processed: {thinking.processedAt ? new Date(thinking.processedAt).toLocaleTimeString() : 'Unknown'}
              </span>
              <span className="flex items-center gap-1">
                <Brain className="h-3 w-3" />
                Reasoning trace
              </span>
            </div>
            
            {/* Development debug info */}
            {process.env.NODE_ENV === 'development' && (
              <div className="mt-2 p-2 bg-gray-900/50 border border-gray-600 rounded text-xs text-gray-400">
                <div className="font-medium text-blue-300">Debug Info:</div>
                <div>Has Thinking Flag: {thinking.hasThinking ? 'Yes' : 'No'}</div>
                <div>Content Length: {thinking.content?.length || 0}</div>
                <div>Processed At: {thinking.processedAt ? new Date(thinking.processedAt).toISOString() : 'Not set'}</div>
                <div>Word Count: {wordCount}</div>
                <div>Estimated Reading Time: {readingTime} minutes</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
