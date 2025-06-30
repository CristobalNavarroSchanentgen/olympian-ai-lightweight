import { useEffect } from 'react';
import { Message } from '@olympian/shared';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { TypewriterText } from './TypewriterText';
import { ThinkingSection } from './ThinkingSection';
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
  Layers,
  ChevronRight,
} from 'lucide-react';
import { 
  getArtifactCount, 
  hasMultipleArtifacts, 
  getFirstArtifact,
  isLegacyArtifactFormat,
  hasThinking
} from '@olympian/shared';

interface MessageItemProps {
  message: Message;
  messageIndex: number;
  isLatest?: boolean;
  hasCompletedTypewriter: boolean;
  isMessageFinalized: boolean;
  onTypewriterComplete: (message: Message, index?: number) => void;
}

export function MessageItem({ 
  message, 
  messageIndex,
  isLatest = false, 
  hasCompletedTypewriter,
  isMessageFinalized,
  onTypewriterComplete 
}: MessageItemProps) {
  const isUser = message.role === 'user';
  
  // Enhanced logic: show typewriter only if it's the latest assistant message 
  // that hasn't completed yet AND hasn't been finalized (prevents re-typewriting existing messages)
  const shouldShowTypewriter = !isUser && isLatest && !hasCompletedTypewriter && !isMessageFinalized;
  
  // FIXED: Enhanced thinking validation with better error handling
  const messageHasThinking = hasThinking(message.metadata);
  const thinkingData = message.metadata?.thinking;
  
  // DEBUG: Add console logging for thinking detection
  if (message.role === 'assistant') {
    console.log(`🧠 [MessageItem] Thinking validation for message ${messageIndex}:`, {
      messageHasThinking,
      hasMetadata: !!message.metadata,
      hasThinkingField: !!message.metadata?.thinking,
      hasThinkingFlag: message.metadata?.thinking?.hasThinking,
      thinkingContent: message.metadata?.thinking?.content?.substring(0, 100) + '...',
      shouldShowTypewriter,
      messageId: message._id
    });
  }
  
  const { 
    selectArtifact, 
    setArtifactPanelOpen,
    getArtifactById,
    getArtifactsByMessageId,
    selectArtifactInMessage,
    hasMultipleArtifactsInMessage,
  } = useArtifactStore();

  // NEW: Enhanced artifact detection with multi-artifact support (Phase 4)
  const artifactCount = getArtifactCount(message.metadata);
  const hasArtifacts = artifactCount > 0;
  const hasMultipleInMessage = message._id ? hasMultipleArtifactsInMessage(message._id) : hasMultipleArtifacts(message.metadata);
  const isLegacyFormat = isLegacyArtifactFormat(message.metadata);

  // Get artifacts for this message
  const messageArtifacts = message._id ? getArtifactsByMessageId(message._id) : [];
  const firstArtifact = getFirstArtifact(message.metadata);
  
  // Legacy fallback
  const legacyArtifact = getArtifactForMessage(message);

  // Get the proper display content for this message
  const displayContent = getDisplayContentForMessage(message);

  // Enhanced debugging for multi-artifact scenarios
  const shouldShowArtifact = shouldDisplayArtifact(message);
  const hasArtifactMetadata = hasArtifacts;
  const artifactId = firstArtifact?.artifactId || message.metadata?.artifactId;

  // Handle typewriter completion
  const handleTypewriterComplete = () => {
    onTypewriterComplete(message, messageIndex);
  };

  // Debug artifact issues
  useEffect(() => {
    if (hasArtifactMetadata && artifactId && messageArtifacts.length === 0 && !legacyArtifact) {
      console.warn('🔍 [MessageItem] Artifact metadata exists but no artifacts found:', {
        messageId: message._id,
        artifactId,
        artifactCount,
        hasMetadata: hasArtifactMetadata,
        shouldShow: shouldShowArtifact,
        isLegacy: isLegacyFormat,
        messageArtifacts: messageArtifacts.length,
        legacyArtifact: !!legacyArtifact
      });
    }
  }, [messageArtifacts, hasArtifactMetadata, artifactId, shouldShowArtifact, message._id, artifactCount, isLegacyFormat, legacyArtifact]);

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

  // NEW: Handle opening artifacts with multi-artifact support (Phase 4)
  const handleOpenArtifacts = () => {
    if (hasMultipleInMessage && message._id) {
      // For multiple artifacts, select the first one and open in message context
      console.log('🎯 [MessageItem] Opening message with multiple artifacts:', {
        messageId: message._id,
        artifactCount,
        artifacts: messageArtifacts.map(a => ({ id: a.id, title: a.title, type: a.type }))
      });
      selectArtifactInMessage(message._id, 0);
      setArtifactPanelOpen(true);
    } else if (messageArtifacts.length > 0) {
      // Single artifact from new format
      const artifact = messageArtifacts[0];
      console.log('🎯 [MessageItem] Opening single artifact (new format):', {
        artifactId: artifact.id,
        title: artifact.title,
        type: artifact.type
      });
      selectArtifact(artifact);
      setArtifactPanelOpen(true);
    } else if (legacyArtifact) {
      // Legacy single artifact
      console.log('🎯 [MessageItem] Opening legacy artifact:', {
        artifactId: legacyArtifact.id,
        title: legacyArtifact.title,
        type: legacyArtifact.type
      });
      selectArtifact(legacyArtifact);
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

  // NEW: Get appropriate artifact info for display (Phase 4)
  const getArtifactDisplayInfo = () => {
    if (messageArtifacts.length > 0) {
      return {
        artifacts: messageArtifacts,
        hasArtifacts: true,
        hasMultiple: hasMultipleInMessage,
        count: artifactCount,
        missing: false
      };
    } else if (legacyArtifact) {
      return {
        artifacts: [legacyArtifact],
        hasArtifacts: true,
        hasMultiple: false,
        count: 1,
        missing: false
      };
    } else if (hasArtifactMetadata) {
      return {
        artifacts: [],
        hasArtifacts: true,
        hasMultiple: false,
        count: artifactCount,
        missing: true
      };
    }
    return {
      artifacts: [],
      hasArtifacts: false,
      hasMultiple: false,
      count: 0,
      missing: false
    };
  };

  const artifactDisplayInfo = getArtifactDisplayInfo();

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
          
          {/* NEW: Enhanced artifact indicator with multi-artifact support (Phase 4) */}
          {artifactDisplayInfo.hasArtifacts && (
            <Badge 
              variant={artifactDisplayInfo.missing ? "destructive" : "secondary"} 
              className="text-xs flex items-center gap-1"
            >
              {artifactDisplayInfo.missing ? (
                <>
                  <AlertTriangle className="h-3 w-3" />
                  {artifactDisplayInfo.count > 1 ? `${artifactDisplayInfo.count} Artifacts Missing` : 'Artifact Missing'}
                </>
              ) : artifactDisplayInfo.hasMultiple ? (
                <>
                  <Layers className="h-3 w-3" />
                  {artifactDisplayInfo.count} Artifacts
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3" />
                  Artifact
                </>
              )}
            </Badge>
          )}

          {/* FIXED: Enhanced thinking indicator - shows when thinking data is available */}
          {messageHasThinking && thinkingData && !shouldShowTypewriter && (
            <Badge 
              variant="secondary" 
              className="text-xs flex items-center gap-1 bg-blue-900/30 text-blue-300 border-blue-600/30"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 3.94-3.04Z"/>
              </svg>
              Reasoning
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
              {message.images.map((image, imageIndex) => (
                <img
                  key={imageIndex}
                  src={`data:image/jpeg;base64,${image}`}
                  alt={`Message image ${imageIndex + 1}`}
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
              {shouldShowTypewriter ? (
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
          
          {/* FIXED: Enhanced Thinking Section - positioned after content but before artifacts */}
          {messageHasThinking && thinkingData && !shouldShowTypewriter && (
            <div className="mt-4">
              <ThinkingSection 
                thinking={thinkingData}
                className="w-full"
              />
            </div>
          )}
          
          {/* NEW: Enhanced Artifact Display with multi-artifact support (Phase 4) */}
          {artifactDisplayInfo.hasArtifacts && !shouldShowTypewriter && (
            <div className="mt-4 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {artifactDisplayInfo.missing ? (
                    <>
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                      <div>
                        <div className="text-sm font-medium text-red-200">
                          {artifactDisplayInfo.count > 1 ? 'Artifacts Not Found' : 'Artifact Not Found'}
                        </div>
                        <div className="text-xs text-red-400">
                          Expected: {artifactDisplayInfo.count} artifact{artifactDisplayInfo.count !== 1 ? 's' : ''}
                          {artifactId && ` • ID: ${artifactId}`}
                          {firstArtifact?.artifactType && ` • Type: ${firstArtifact.artifactType}`}
                        </div>
                      </div>
                    </>
                  ) : artifactDisplayInfo.hasMultiple ? (
                    <>
                      <Layers className="h-4 w-4 text-blue-400" />
                      <div>
                        <div className="text-sm font-medium text-gray-200">
                          {artifactDisplayInfo.count} Artifacts Created
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                          <span>Multiple content items</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            {artifactDisplayInfo.artifacts.slice(0, 3).map((artifact, artifactIdx) => {
                              const IconComponent = getArtifactIcon(artifact.type);
                              return (
                                <span key={artifact.id} className="inline-flex items-center">
                                  <IconComponent className="h-3 w-3" />
                                  {artifactIdx < 2 && artifactIdx < artifactDisplayInfo.artifacts.length - 1 && (
                                    <span className="mx-1">+</span>
                                  )}
                                </span>
                              );
                            })}
                            {artifactDisplayInfo.artifacts.length > 3 && (
                              <span className="text-muted-foreground">+{artifactDisplayInfo.artifacts.length - 3}</span>
                            )}
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {(() => {
                        const artifact = artifactDisplayInfo.artifacts[0];
                        const IconComponent = getArtifactIcon(artifact.type);
                        return <IconComponent className="h-4 w-4 text-gray-400" />;
                      })()}
                      <div>
                        <div className="text-sm font-medium text-gray-200">
                          {artifactDisplayInfo.artifacts[0].title}
                        </div>
                        <div className="text-xs text-gray-400 flex items-center gap-2">
                          <span className="capitalize">{artifactDisplayInfo.artifacts[0].type}</span>
                          {artifactDisplayInfo.artifacts[0].language && (
                            <span>• {artifactDisplayInfo.artifacts[0].language}</span>
                          )}
                          <span>• v{artifactDisplayInfo.artifacts[0].version}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpenArtifacts}
                  disabled={artifactDisplayInfo.missing}
                  className={cn(
                    "flex items-center gap-1",
                    artifactDisplayInfo.missing
                      ? "text-red-300 hover:text-red-200 hover:bg-red-900/20"
                      : artifactDisplayInfo.hasMultiple
                        ? "text-blue-300 hover:text-blue-200 hover:bg-blue-900/20"
                        : "text-gray-300 hover:text-white hover:bg-gray-700"
                  )}
                >
                  {artifactDisplayInfo.missing ? (
                    <>
                      <AlertTriangle className="h-4 w-4" />
                      Debug
                    </>
                  ) : artifactDisplayInfo.hasMultiple ? (
                    <>
                      <Layers className="h-4 w-4" />
                      View All
                      <ChevronRight className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <ExternalLink className="h-4 w-4" />
                      Open
                    </>
                  )}
                </Button>
              </div>
              
              {/* NEW: Multi-artifact preview (Phase 4) */}
              {artifactDisplayInfo.hasMultiple && !artifactDisplayInfo.missing && (
                <div className="mt-3 pt-3 border-t border-gray-600">
                  <div className="flex flex-wrap gap-2">
                    {artifactDisplayInfo.artifacts.slice(0, 4).map((artifact) => {
                      const IconComponent = getArtifactIcon(artifact.type);
                      return (
                        <div 
                          key={artifact.id} 
                          className="flex items-center gap-1 px-2 py-1 bg-gray-700/50 rounded text-xs"
                        >
                          <IconComponent className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-300 max-w-[100px] truncate">
                            {artifact.title}
                          </span>
                          <span className="text-gray-500">
                            {artifact.type}
                          </span>
                        </div>
                      );
                    })}
                    {artifactDisplayInfo.artifacts.length > 4 && (
                      <div className="flex items-center gap-1 px-2 py-1 bg-gray-700/30 rounded text-xs text-gray-400">
                        +{artifactDisplayInfo.artifacts.length - 4} more
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Debug info for missing artifacts */}
              {artifactDisplayInfo.missing && (
                <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded text-xs text-red-300">
                  <div className="font-medium">Debug Info:</div>
                  <div>Expected Artifact Count: {artifactDisplayInfo.count}</div>
                  {artifactId && <div>Primary Artifact ID: {artifactId}</div>}
                  {message._id && <div>Message ID: {message._id}</div>}
                  <div>Conversation ID: {message.conversationId}</div>
                  <div>Has Original Content: {!!message.metadata?.originalContent}</div>
                  <div>Code Blocks Removed: {!!message.metadata?.codeBlocksRemoved}</div>
                  <div>Legacy Format: {isLegacyFormat ? 'Yes' : 'No'}</div>
                  <div>Message Artifacts Found: {messageArtifacts.length}</div>
                  <div>Legacy Artifact Found: {legacyArtifact ? 'Yes' : 'No'}</div>
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
