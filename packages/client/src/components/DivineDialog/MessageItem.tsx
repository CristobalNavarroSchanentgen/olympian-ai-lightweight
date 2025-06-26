import { useState, useEffect, useRef } from 'react';
import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { CodeBlock } from '../ui/codeblock';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { 
  getDisplayContentForMessage, 
  shouldDisplayArtifact, 
  getArtifactForMessage 
} from '@/lib/artifactUtils';
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
  onTypewriterComplete?: (messageId: string) => void;
}

export function MessageItem({ message, isLatest = false, onTypewriterComplete }: MessageItemProps) {
  const isUser = message.role === 'user';
  
  // Check if typewriter has already completed using localStorage and metadata
  const getTypewriterCompleted = (): boolean => {
    // First check metadata
    if (message.metadata?.typewriterCompleted) {
      return true;
    }
    
    // Then check localStorage as fallback
    try {
      const messageId = message._id?.toString();
      if (messageId) {
        const completedMessages = JSON.parse(localStorage.getItem('typewriter-completed') || '{}');
        return !!completedMessages[messageId];
      }
    } catch (error) {
      console.warn('Failed to read typewriter completion state:', error);
    }
    
    return false;
  };

  const typewriterCompleted = getTypewriterCompleted();
  
  // Initialize hasTyped based on multiple criteria
  // User messages and messages that have already completed typewriting should not animate
  const [hasTyped, setHasTyped] = useState(typewriterCompleted || !isLatest || isUser);
  
  const lastProcessedMessageIdRef = useRef<string | null>(null);
  
  const { 
    selectArtifact, 
    setArtifactPanelOpen,
    getArtifactById 
  } = useArtifactStore();

  // Get artifact if this message has one using the utility function
  const artifact = getArtifactForMessage(message);

  // Get the proper display content for this message
  const displayContent = getDisplayContentForMessage(message);

  // Additional debugging for artifact issues
  const shouldShowArtifact = shouldDisplayArtifact(message);
  const hasArtifactMetadata = !!message.metadata?.hasArtifact;
  const artifactId = message.metadata?.artifactId;

  // Reset typing state only for genuinely new assistant messages that haven't completed typewriting
  useEffect(() => {
    const messageId = message._id?.toString();
    
    // Only trigger typewriter for new assistant messages that haven't completed typewriting
    if (isLatest && !isUser && messageId && 
        messageId !== lastProcessedMessageIdRef.current && 
        !typewriterCompleted) {
      setHasTyped(false);
      lastProcessedMessageIdRef.current = messageId;
    }
    
    // If this message is no longer the latest or has already completed typewriting, ensure it's marked as typed
    if (!isLatest || typewriterCompleted) {
      setHasTyped(true);
    }
  }, [message._id, isLatest, isUser, typewriterCompleted]);

  // Handle typewriter completion
  const handleTypewriterComplete = () => {
    setHasTyped(true);
    
    // Update the localStorage tracking
    const messageId = message._id?.toString();
    if (messageId && onTypewriterComplete) {
      onTypewriterComplete(messageId);
    }
  };

  // Debug artifact issues
  useEffect(() => {
    if (hasArtifactMetadata && artifactId && !artifact) {
      console.warn('🔍 [MessageItem] Artifact metadata exists but artifact not found:', {
        messageId: message._id,
        artifactId,
        hasMetadata: hasArtifactMetadata,
        shouldShow: shouldShowArtifact,
        availableArtifacts: useArtifactStore.getState().artifacts
      });
    }
  }, [artifact, hasArtifactMetadata, artifactId, shouldShowArtifact, message._id]);

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
      console.log('🎯 [MessageItem] Opening artifact:', {
        artifactId: artifact.id,
        title: artifact.title,
        type: artifact.type
      });
      selectArtifact(artifact);
      setArtifactPanelOpen(true);
    } else if (artifactId) {
      // Fallback: try to find artifact by ID directly
      console.warn('🔍 [MessageItem] Attempting fallback artifact lookup for ID:', artifactId);
      const fallbackArtifact = getArtifactById(artifactId);
      if (fallbackArtifact) {
        console.log('✅ [MessageItem] Found artifact via fallback lookup:', fallbackArtifact.id);
        selectArtifact(fallbackArtifact);
        setArtifactPanelOpen(true);
      } else {
        console.error('❌ [MessageItem] Could not find artifact even with fallback lookup:', artifactId);
      }
    }
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
          {hasArtifactMetadata && (
            <Badge 
              variant={artifact ? "secondary" : "destructive"} 
              className="text-xs flex items-center gap-1"
            >
              {artifact ? (
                <>
                  <FileText className="h-3 w-3" />
                  Artifact
                </>
              ) : (
                <>
                  <AlertTriangle className="h-3 w-3" />
                  Artifact Missing
                </>
              )}
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
              {!hasTyped && !typewriterCompleted ? (
                <TypewriterText
                  content={displayContent}
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
                      const match = /language-(\\w+)/.exec(className || '');
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
                  {displayContent}
                </ReactMarkdown>
              )}
            </>
          )}
          
          {/* Artifact Display */}
          {hasArtifactMetadata && hasTyped && (
            <div className="mt-4 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {artifact ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <div>
                        <div className="text-sm font-medium text-red-200">
                          Artifact Not Found
                        </div>
                        <div className="text-xs text-red-400">
                          ID: {artifactId} • Type: {message.metadata?.artifactType || 'unknown'}
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenArtifact}
                  disabled={!artifact && !artifactId}
                  className={cn(
                    "flex items-center gap-1",
                    artifact 
                      ? "text-gray-300 hover:text-white hover:bg-gray-700"
                      : "text-red-300 hover:text-red-200 hover:bg-red-900/20"
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  {artifact ? "Open" : "Debug"}
                </Button>
              </div>
              
              {/* Debug info for missing artifacts */}
              {!artifact && artifactId && (
                <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">
                  <div className="font-medium">Debug Info:</div>
                  <div>Expected Artifact ID: {artifactId}</div>
                  <div>Message ID: {message._id}</div>
                  <div>Conversation ID: {message.conversationId}</div>
                  <div>Has Original Content: {!!message.metadata?.originalContent}</div>
                  <div>Code Blocks Removed: {!!message.metadata?.codeBlocksRemoved}</div>
                </div>
              )}
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
