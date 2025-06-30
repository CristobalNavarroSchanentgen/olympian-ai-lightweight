import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ChevronDown, 
  ChevronRight, 
  Brain,
  Eye,
  EyeOff,
  Sparkles,
  Target,
  Lightbulb
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

interface ThinkingMilestone {
  icon: React.ReactNode;
  label: string;
  content: string;
  isKey: boolean;
}

// Extract milestones from thinking content
function extractMilestones(content: string): ThinkingMilestone[] {
  const milestones: ThinkingMilestone[] = [];
  
  // Split content into sentences/paragraphs
  const lines = content.split(/\n+/).filter(line => line.trim());
  
  // Patterns to identify key thinking moments
  const keyPatterns = [
    { regex: /^(okay|alright|let me|i need to|i should|i'll|i will)/i, icon: <Brain className="h-3 w-3" />, label: "Planning" },
    { regex: /(first|second|third|next|then|after that|finally)/i, icon: <Target className="h-3 w-3" />, label: "Step" },
    { regex: /(interesting|important|key|critical|note that|remember)/i, icon: <Lightbulb className="h-3 w-3" />, label: "Insight" },
    { regex: /(however|but|although|alternatively|on the other hand)/i, icon: <Sparkles className="h-3 w-3" />, label: "Consideration" },
    { regex: /(therefore|so|thus|in conclusion|to summarize)/i, icon: <Target className="h-3 w-3" />, label: "Conclusion" },
    { regex: /(wait|actually|oh|hmm|correction)/i, icon: <Lightbulb className="h-3 w-3" />, label: "Realization" }
  ];
  
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length < 10) return; // Skip very short lines
    
    // Check if this line matches any key pattern
    let matched = false;
    for (const pattern of keyPatterns) {
      if (pattern.regex.test(trimmed)) {
        milestones.push({
          icon: pattern.icon,
          label: pattern.label,
          content: trimmed,
          isKey: true
        });
        matched = true;
        break;
      }
    }
    
    // Add some regular content as non-key milestones if no pattern matched
    // and the line is substantial enough
    if (!matched && trimmed.length > 50 && milestones.length < 10) {
      milestones.push({
        icon: <Brain className="h-3 w-3" />,
        label: "Thought",
        content: trimmed.substring(0, 100) + (trimmed.length > 100 ? '...' : ''),
        isKey: false
      });
    }
  });
  
  // Limit to most relevant milestones
  return milestones.slice(0, 8);
}

export function ThinkingSection({ thinking, className }: ThinkingSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFullThinking, setShowFullThinking] = useState(false);

  // Get thinking content
  const thinkingContent = thinking.content || getThinkingContent({ thinking });
  const hasValidThinking = thinking.hasThinking && thinkingContent.trim().length > 0;

  // Extract milestones
  const milestones = useMemo(() => {
    if (!hasValidThinking) return [];
    return extractMilestones(thinkingContent);
  }, [thinkingContent, hasValidThinking]);

  if (!hasValidThinking) {
    return null;
  }

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
    if (!isExpanded) {
      setShowFullThinking(false); // Reset full view when collapsing
    }
  };

  // Count words for reading time
  const wordCount = thinkingContent.trim().split(/\s+/).filter(word => word.length > 0).length;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return (
    <div className={cn(
      "mt-4 rounded-lg border border-gray-700 bg-gray-800/30 backdrop-blur-sm transition-all duration-200",
      isExpanded && "shadow-lg", 
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <div className="animate-pulse">
            <Brain className="h-4 w-4 text-blue-400" />
          </div>
          <Badge variant="secondary" className="bg-blue-900/30 text-blue-300 border-blue-600/30">
            Reasoning
          </Badge>
          <span className="text-xs text-gray-400">
            {milestones.length} key points • {wordCount} words • ~{readingTime}min
          </span>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleExpanded}
          className="flex items-center gap-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-all"
        >
          {isExpanded ? (
            <>
              <EyeOff className="h-4 w-4" />
              Hide reasoning
              <ChevronDown className="h-3 w-3 transition-transform duration-200" />
            </>
          ) : (
            <>
              <Eye className="h-4 w-4" />
              View reasoning
              <ChevronRight className="h-3 w-3 transition-transform duration-200" />
            </>
          )}
        </Button>
      </div>

      {/* Expanded Content with smooth transition */}
      <div className={cn(
        "overflow-hidden transition-all duration-300 ease-in-out",
        isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
      )}>
        <div className="border-t border-gray-700">
          {/* Milestones View */}
          {!showFullThinking && milestones.length > 0 && (
            <div className="p-4 space-y-2 animate-fadeIn">
              <div className="text-xs text-gray-500 mb-3">Key reasoning milestones:</div>
              
              {milestones.map((milestone, index) => (
                <div 
                  key={index}
                  className={cn(
                    "flex items-start gap-3 p-2 rounded-md transition-all duration-200 animate-slideIn",
                    milestone.isKey 
                      ? "bg-gray-700/30 hover:bg-gray-700/50 hover:scale-[1.02]" 
                      : "hover:bg-gray-800/50"
                  )}
                  style={{
                    animationDelay: `${index * 50}ms`
                  }}
                >
                  <div className={cn(
                    "mt-0.5 p-1 rounded transition-colors duration-200",
                    milestone.isKey ? "bg-blue-900/30 text-blue-400" : "text-gray-500"
                  )}>
                    {milestone.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn(
                        "text-xs font-medium",
                        milestone.isKey ? "text-blue-300" : "text-gray-400"
                      )}>
                        {milestone.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      {milestone.content}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Show full thinking button */}
              <div className="mt-4 pt-3 border-t border-gray-700/50">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowFullThinking(true)}
                  className="w-full justify-center text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-all duration-200 hover:scale-[1.02]"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View complete reasoning ({wordCount} words)
                </Button>
              </div>
            </div>
          )}

          {/* Full Thinking View */}
          {(showFullThinking || milestones.length === 0) && (
            <div className="p-4 animate-fadeIn">
              {milestones.length > 0 && (
                <div className="mb-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFullThinking(false)}
                    className="text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-all duration-200"
                  >
                    <ChevronRight className="h-3 w-3 mr-1 transition-transform duration-200 hover:translate-x-[-2px]" />
                    Back to milestones
                  </Button>
                </div>
              )}
              
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
            </div>
          )}
          
          {/* Footer */}
          <div className="px-4 pb-3 pt-2 border-t border-gray-700/50 flex items-center justify-between text-xs text-gray-500">
            <span>
              Processed: {thinking.processedAt ? new Date(thinking.processedAt).toLocaleTimeString() : 'Unknown'}
            </span>
            <span className="flex items-center gap-1">
              <Brain className="h-3 w-3" />
              Reasoning trace
            </span>
          </div>
        </div>
      </div>

      {/* CSS for animations - Fixed: removed jsx prop */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }

        .animate-slideIn {
          animation: slideIn 0.3s ease-out forwards;
          opacity: 0;
        }
      `}</style>
    </div>
  );
}
