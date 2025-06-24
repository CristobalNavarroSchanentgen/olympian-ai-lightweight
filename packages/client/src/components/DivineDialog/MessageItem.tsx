import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { CodeBlock } from '../ui/codeblock';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { prepareMarkdownContent, truncateForSafety } from '@/utils/contentSanitizer';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useChatStore } from '@/stores/useChatStore';
import { useTypedMessagesStore } from '@/stores/useTypedMessagesStore';
import { 
  FileText, 
  Code, 
  Image, 
  FileJson, 
  Table, 
  ExternalLink,
  AlertTriangle,
} from 'lucide-react';

interface MessageItemProps {
  message: Message;
  isLatest?: boolean;
  isStreaming?: boolean;
}

// Utility function to safely convert conversation ID to string
function getConversationId(conversation: any): string {
  if (!conversation?._id) return '';
  return String(conversation._id);
}

// Fallback component for message rendering errors
const MessageErrorFallback = ({ content }: { content: string }) => (
  <div className="p-4 border border-yellow-500 rounded-md bg-yellow-50 dark:bg-yellow-900/20">
    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">
      Failed to render message
    </p>
    <pre className="text-xs text-yellow-700 dark:text-yellow-300 whitespace-pre-wrap font-mono overflow-x-auto">
      {content.substring(0, 500)}
      {content.length > 500 && '...'}
    </pre>
  </div>
);

export function MessageItem({ message, isLatest = false, isStreaming = false }: MessageItemProps) {
  const isUser = message.role === 'user';
  const messageId = message._id?.toString() || `${message.conversationId}-${message.createdAt}`;
  const conversationId = message.conversationId;
  
  const { currentConversation } = useChatStore();
  const { 
    getArtifactById, 
    selectArtifact, 
    setArtifactPanelOpen 
  } = useArtifactStore();

  const {
    shouldTriggerTypewriter,
    markAsTyped,
    setLastTypingMessage
  } = useTypedMessagesStore();

  // Only trigger typewriter for assistant messages that haven't been typed yet
  const shouldShowTypewriter = !isUser && 
    !isStreaming && 
    shouldTriggerTypewriter(conversationId, messageId, isLatest);

  // Enhanced artifact validation
  const getValidatedArtifact = () => {
    if (!message.metadata?.artifactId) {
      return null;
    }

    const artifact = getArtifactById(message.metadata.artifactId);
    if (!artifact) {
      console.warn('🎨 [MessageItem] Artifact not found:', message.metadata.artifactId);
      return null;
    }

    // Verify the artifact belongs to the current conversation
    const currentConversationId = getConversationId(currentConversation);
    if (artifact.conversationId !== currentConversationId) {
      console.warn('🎨 [MessageItem] Artifact belongs to wrong conversation:', {
        artifactId: artifact.id,
        artifactConversation: artifact.conversationId,
        currentConversation: currentConversationId
      });
      return null;
    }

    return artifact;
  };

  const artifact = getValidatedArtifact();

  // Check if this message should display original content with code blocks
  // This happens when an artifact is expected but missing/invalid
  const shouldShowOriginalContent = message.metadata?.artifactId && 
    !artifact && 
    message.metadata?.originalContent &&
    message.metadata?.codeBlocksRemoved;

  // For typewriter effect, always use the processed content (message.content)
  // For static display when artifacts are missing, use original content as fallback
  const getDisplayContent = () => {
    if (shouldShowTypewriter) {
      // Always use processed content for typewriting
      return message.content;
    }
    
    // For static display, use original content if artifact is missing and we have it
    return shouldShowOriginalContent 
      ? (message.metadata?.originalContent || message.content)
      : message.content;
  };

  const displayContent = getDisplayContent();
  
  // Sanitize content for safe rendering
  const safeDisplayContent = prepareMarkdownContent(truncateForSafety(displayContent));

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

  const handleTypewriterStart = () => {
    // Mark this message as the one currently being typed
    setLastTypingMessage(messageId);
  };

  const handleTypewriterComplete = () => {
    // Mark message as typed and clear the typing indicator
    markAsTyped(conversationId, messageId);
    setLastTypingMessage(null);
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
          {/* Missing artifact warning */}
          {message.metadata?.artifactId && !artifact && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Artifact Missing
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
            <p className="text-sm text-white/90">{safeDisplayContent}</p>
          ) : (
            <ErrorBoundary fallback={<MessageErrorFallback content={safeDisplayContent} />}>
              {shouldShowTypewriter ? (
                <TypewriterText
                  content={safeDisplayContent}
                  speed={15}
                  onStart={handleTypewriterStart}
                  onComplete={handleTypewriterComplete}
                />
              ) : (
                <ReactMarkdown
                  className="prose prose-invert prose-sm max-w-none prose-p:leading-relaxed"
                  components={{
                    pre: ({ children }) => {
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
                    code: ({ children, className, ...props }) => {
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
                  {safeDisplayContent}
                </ReactMarkdown>
              )}
            </ErrorBoundary>
          )}
          
          {/* Artifact - Only show after typing is complete or if no typewriter */}
          {artifact && !shouldShowTypewriter && (
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
          
          {/* Missing artifact warning with fallback message */}
          {message.metadata?.artifactId && !artifact && !shouldShowTypewriter && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg">
              <div className="flex items-center gap-2 text-yellow-300">
                <AlertTriangle className="h-4 w-4" />
                <div className="text-sm">
                  <div className="font-medium">Artifact Unavailable</div>
                  <div className="text-xs text-yellow-400">
                    The artifact for this message is not available. {shouldShowOriginalContent ? 'Showing original content with code blocks.' : 'This may happen when switching conversations.'}
                  </div>
                </div>
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