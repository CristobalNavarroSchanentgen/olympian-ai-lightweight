import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { CodeBlock } from '../ui/codeblock';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useTypedMessagesStore } from '@/stores/useTypedMessagesStore';
import { 
  FileText, 
  Code, 
  Image, 
  FileJson, 
  Table, 
  ExternalLink,
} from 'lucide-react';

interface MessageItemProps {
  message: Message;
  isLatest?: boolean;
  isStreaming?: boolean;
}

export function MessageItem({ message, isLatest = false, isStreaming = false }: MessageItemProps) {
  const isUser = message.role === 'user';
  const messageId = message._id?.toString() || `${message.conversationId}-${message.createdAt}`;
  
  const { 
    getArtifactById, 
    selectArtifact, 
    setArtifactPanelOpen 
  } = useArtifactStore();

  const {
    isMessageTyped,
    markAsTyped
  } = useTypedMessagesStore();

  // Check if this message has already been typed
  const hasTyped = isUser || isMessageTyped(messageId) || isStreaming;

  // Get artifact if this message has one
  const artifact = message.metadata?.artifactId 
    ? getArtifactById(message.metadata.artifactId)
    : null;

  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'code':
        return Code;
      case 'html':
      case 'react':
        return Code;
      case 'svg':
        return Image;
      case 'json':
        return FileJson;
      case 'csv':
        return Table;
      case 'markdown':
      case 'text':
        return FileText;
      default:
        return FileText;
    }
  };

  const handleOpenArtifact = () => {
    if (artifact) {
      selectArtifact(artifact);
      setArtifactPanelOpen(true);
    }
  };

  const handleTypewriterComplete = () => {
    markAsTyped(messageId);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-4xl flex flex-col items-center">
        <div className="flex items-center gap-2 mb-2">
          <span className={cn(
            'text-xs font-medium',
            isUser ? 'text-gray-400' : 'text-gray-300'
          )}>
            {isUser ? 'You' : 'Assistant'}
          </span>
          <span className="text-xs text-gray-500">
            {format(new Date(message.createdAt), 'HH:mm')}
          </span>
          {message.metadata?.model && (
            <span className="text-xs text-gray-500">
              • {message.metadata.model}
            </span>
          )}
          {message.metadata?.tokens && (
            <span className="text-xs text-gray-500">
              • {message.metadata.tokens} tokens
            </span>
          )}
          {/* Artifact indicator */}
          {artifact && (
            <Badge variant="secondary" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Artifact
            </Badge>
          )}
        </div>
        
        <div
          className={cn(
            'w-full max-w-3xl',
            isUser ? 'bg-gray-800 rounded-2xl px-4 py-3' : ''
          )}
        >
          {/* Images */}
          {message.images && message.images.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-2">
              {message.images.map((image, index) => (
                <img
                  key={index}
                  src={`data:image/jpeg;base64,${image}`}
                  alt={`Message image ${index + 1}`}
                  className="rounded-lg w-full h-32 object-cover"
                />
              ))}
            </div>
          )}
          
          {/* Content */}
          {isUser ? (
            <p className="text-sm text-white/90">{message.content}</p>
          ) : (
            <>
              {!hasTyped && isLatest && !isStreaming ? (
                <TypewriterText
                  content={message.content}
                  speed={15}
                  onComplete={handleTypewriterComplete}
                />
              ) : (
                <ReactMarkdown
                  className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed"
                  components={{
                    pre: ({ node: _node, children }) => {
                      // Extract the code content and language from the children
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
                        <code className="rounded bg-gray-800 px-1 py-0.5 text-sm" {...props}>
                          {children}
                        </code>
                      ) : (
                        // For code blocks, let the parent pre element handle the rendering
                        <>{children}</>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              )}
            </>
          )}
          
          {/* Artifact */}
          {artifact && (hasTyped || isStreaming) && (
            <div className="mt-4 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {(() => {
                    const IconComponent = getArtifactIcon(artifact.type);
                    return <IconComponent className="h-4 w-4 text-gray-400" />;
                  })()}
                  <div>
                    <div className="text-sm font-medium text-gray-200">
                      {artifact.title}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <span className="capitalize">{artifact.type}</span>
                      {artifact.language && (
                        <span>• {artifact.language}</span>
                      )}
                      <span>• v{artifact.version}</span>
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenArtifact}
                  className="text-gray-300 hover:text-white hover:bg-gray-700"
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open
                </Button>
              </div>
            </div>
          )}
          
          {/* Error */}
          {message.metadata?.error && (
            <div className="mt-2 text-sm text-red-400">
              Error: {message.metadata.error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
