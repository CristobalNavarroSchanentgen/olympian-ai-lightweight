import { useState, useEffect } from 'react';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useChatStore } from '@/stores/useChatStore';
import { ArtifactViewer } from './ArtifactViewer';
import { ArtifactList } from './ArtifactList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  ArrowLeft,
  ArrowRight,
  Layers,
  Grid3X3,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

// NEW: Multi-artifact tab component (Phase 4)
function ArtifactTabs({ 
  artifacts, 
  selectedIndex, 
  onSelectArtifact,
  collapsed,
  onToggleCollapse 
}: {
  artifacts: any[];
  selectedIndex: number;
  onSelectArtifact: (index: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  if (artifacts.length <= 1) return null;

  return (
    <div className="border-b border-border bg-muted/30">
      {/* Tab header with collapse toggle */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{artifacts.length} Artifacts</span>
          <Badge variant="secondary" className="text-xs">
            {selectedIndex + 1}/{artifacts.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          {/* Navigation arrows */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectArtifact(selectedIndex === 0 ? artifacts.length - 1 : selectedIndex - 1)}
            className="h-6 w-6 p-0"
            title="Previous artifact"
          >
            <ArrowLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectArtifact((selectedIndex + 1) % artifacts.length)}
            className="h-6 w-6 p-0"
            title="Next artifact"
          >
            <ArrowRight className="h-3 w-3" />
          </Button>
          {/* Collapse toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleCollapse}
            className="h-6 w-6 p-0"
            title={collapsed ? "Show tabs" : "Hide tabs"}
          >
            {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {/* Tab list - collapsible */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-thin">
            {artifacts.map((artifact, index) => (
              <Button
                key={artifact.id}
                variant={index === selectedIndex ? "default" : "ghost"}
                size="sm"
                onClick={() => onSelectArtifact(index)}
                className={cn(
                  "h-8 px-3 text-xs whitespace-nowrap flex-shrink-0",
                  index === selectedIndex && "bg-primary text-primary-foreground"
                )}
              >
                <div className="flex items-center gap-2 max-w-[120px]">
                  {/* Artifact type icon */}
                  {artifact.type === 'code' && <span>📄</span>}
                  {artifact.type === 'html' && <span>🌐</span>}
                  {artifact.type === 'react' && <span>⚛️</span>}
                  {artifact.type === 'svg' && <span>🎨</span>}
                  {artifact.type === 'json' && <span>📋</span>}
                  {artifact.type === 'csv' && <span>📊</span>}
                  {artifact.type === 'mermaid' && <span>📈</span>}
                  {!['code', 'html', 'react', 'svg', 'json', 'csv', 'mermaid'].includes(artifact.type) && <span>📄</span>}
                  
                  {/* Truncated title */}
                  <span className="truncate">
                    {artifact.title.length > 15 ? `${artifact.title.slice(0, 15)}...` : artifact.title}
                  </span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// NEW: Multi-artifact indicator component (Phase 4)
function MultiArtifactIndicator({ 
  count, 
  selectedIndex, 
  onShowList,
  isLoading = false
}: { 
  count: number; 
  selectedIndex?: number; 
  onShowList: () => void; 
  isLoading?: boolean;
}) {
  if (count <= 1) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onShowList}
      className="h-7 px-2 text-xs gap-1"
      disabled={isLoading}
    >
      {isLoading ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : (
        <Grid3X3 className="h-3 w-3" />
      )}
      <span>{count} artifacts</span>
      {selectedIndex !== undefined && (
        <Badge variant="secondary" className="text-xs h-4 px-1">
          {selectedIndex + 1}
        </Badge>
      )}
    </Button>
  );
}

export function ArtifactPanel() {
  const { currentConversation } = useChatStore();
  const { 
    selectedArtifact,
    selectedMessageId,
    selectedArtifactIndex,
    isArtifactPanelOpen,
    showArtifactTabs,
    artifactTabsCollapsed,
    isLoadingArtifacts,
    getArtifactsForConversation,
    getMessageArtifacts,
    hasMultipleArtifactsInMessage,
    selectArtifactInMessage,
    selectNextArtifactInMessage,
    selectPreviousArtifactInMessage,
    toggleArtifactPanel,
    selectArtifact,
    collapseArtifactTabs,
    loadArtifactsForConversation,
  } = useArtifactStore();

  const [showArtifactList, setShowArtifactList] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const conversationArtifacts = currentConversation 
    ? getArtifactsForConversation(currentConversation._id || '') 
    : [];

  // NEW: Get current message artifacts if we have a selected message (Phase 4)
  const currentMessageArtifacts = selectedMessageId 
    ? getMessageArtifacts(selectedMessageId) 
    : null;

  const hasMultipleInCurrentMessage = selectedMessageId 
    ? hasMultipleArtifactsInMessage(selectedMessageId) 
    : false;

  // NEW: Auto-load artifacts when conversation changes (Phase 4)
  useEffect(() => {
    if (currentConversation?._id && conversationArtifacts.length === 0 && !isLoadingArtifacts) {
      console.log('🔄 [ArtifactPanel] Auto-loading artifacts for conversation:', currentConversation._id);
      loadArtifactsForConversation(currentConversation._id).catch(error => {
        console.error('❌ [ArtifactPanel] Failed to auto-load artifacts:', error);
      });
    }
  }, [currentConversation?._id, conversationArtifacts.length, isLoadingArtifacts, loadArtifactsForConversation]);

  // NEW: Handle keyboard navigation (Phase 4)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasMultipleInCurrentMessage) return;

    if (e.key === 'ArrowLeft' && e.ctrlKey) {
      e.preventDefault();
      selectPreviousArtifactInMessage();
    } else if (e.key === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault();
      selectNextArtifactInMessage();
    }
  };

  // NEW: Handle manual refresh (Phase 4)
  const handleRefresh = async () => {
    if (!currentConversation?._id || isRefreshing) return;
    
    setIsRefreshing(true);
    try {
      await loadArtifactsForConversation(currentConversation._id, true);
      console.log('✅ [ArtifactPanel] Artifacts refreshed successfully');
    } catch (error) {
      console.error('❌ [ArtifactPanel] Failed to refresh artifacts:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!isArtifactPanelOpen) {
    return (
      <div className="fixed right-0 top-0 h-full flex items-center z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleArtifactPanel}
          className="h-12 w-6 rounded-l-md rounded-r-none border-l border-t border-b bg-background/95 backdrop-blur-sm"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div 
      className="h-full flex flex-col bg-background border-l border-border"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      {/* Enhanced Header - Show multi-artifact info and controls */}
      <div className="border-b border-border p-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* NEW: Multi-artifact indicator (Phase 4) */}
            <MultiArtifactIndicator
              count={conversationArtifacts.length}
              selectedIndex={hasMultipleInCurrentMessage ? selectedArtifactIndex : undefined}
              onShowList={() => setShowArtifactList(!showArtifactList)}
              isLoading={isLoadingArtifacts}
            />
            
            {/* NEW: Current message context indicator (Phase 4) */}
            {selectedMessageId && hasMultipleInCurrentMessage && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <span>•</span>
                <span>Message #{selectedMessageId.slice(-6)}</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {/* NEW: Refresh button for artifacts (Phase 4) */}
            {conversationArtifacts.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoadingArtifacts}
                className="h-7 w-7 p-0"
                title="Refresh artifacts"
              >
                <RefreshCw className={cn("h-3 w-3", (isRefreshing || isLoadingArtifacts) && "animate-spin")} />
              </Button>
            )}
            
            {/* NEW: Quick navigation for current message artifacts (Phase 4) */}
            {hasMultipleInCurrentMessage && !showArtifactList && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectPreviousArtifactInMessage}
                  className="h-7 w-7 p-0"
                  title="Previous artifact (Ctrl+←)"
                >
                  <ArrowLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectNextArtifactInMessage}
                  className="h-7 w-7 p-0"
                  title="Next artifact (Ctrl+→)"
                >
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </>
            )}
            
            {/* Panel close button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleArtifactPanel}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* NEW: Multi-artifact tabs for current message (Phase 4) */}
      {currentMessageArtifacts && showArtifactTabs && hasMultipleInCurrentMessage && (
        <ArtifactTabs
          artifacts={currentMessageArtifacts.artifacts}
          selectedIndex={selectedArtifactIndex}
          onSelectArtifact={(index) => selectArtifactInMessage(selectedMessageId!, index)}
          collapsed={artifactTabsCollapsed}
          onToggleCollapse={() => collapseArtifactTabs(!artifactTabsCollapsed)}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {showArtifactList ? (
          <div className="h-full">
            <div className="p-3 border-b border-border">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">All Artifacts</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArtifactList(false)}
                  className="h-7 w-7 p-0"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
              </div>
            </div>
            <ArtifactList
              artifacts={conversationArtifacts}
              onSelectArtifact={(artifact) => {
                selectArtifact(artifact);
                setShowArtifactList(false);
              }}
              onClose={() => setShowArtifactList(false)}
            />
          </div>
        ) : selectedArtifact ? (
          <div className="h-full overflow-hidden">
            {/* NEW: Artifact context info (Phase 4) */}
            {hasMultipleInCurrentMessage && currentMessageArtifacts && (
              <div className="px-3 py-2 bg-muted/20 border-b border-border text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>
                    Artifact {selectedArtifactIndex + 1} of {currentMessageArtifacts.totalCount} 
                    {currentMessageArtifacts.artifacts[selectedArtifactIndex]?.language && 
                      ` • ${currentMessageArtifacts.artifacts[selectedArtifactIndex].language}`
                    }
                  </span>
                  {currentMessageArtifacts.artifacts[selectedArtifactIndex]?.order !== undefined && (
                    <span>Order: {currentMessageArtifacts.artifacts[selectedArtifactIndex].order}</span>
                  )}
                </div>
              </div>
            )}
            
            <div className="h-full overflow-hidden">
              <ArtifactViewer artifact={selectedArtifact} />
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center p-8 relative">
            {/* Minimal close button for empty state */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleArtifactPanel}
              className="absolute top-2 right-2 h-7 w-7 p-0"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
            
            <Card className="p-8 text-center max-w-sm">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">
                {isLoadingArtifacts ? 'Loading artifacts...' : 'No artifacts yet'}
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isLoadingArtifacts ? (
                  "Loading artifacts for this conversation..."
                ) : conversationArtifacts.length === 0 ? (
                  "Ask the AI to create code, documents, or other content to see them here."
                ) : (
                  "Select an artifact to view and edit it."
                )}
              </p>
              
              {/* NEW: Multi-artifact tips (Phase 4) */}
              {conversationArtifacts.length > 1 && !isLoadingArtifacts && (
                <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 mt-4">
                  <p className="font-medium mb-1">💡 Tips:</p>
                  <ul className="text-left space-y-1">
                    <li>• Use Ctrl+← → to navigate between artifacts in a message</li>
                    <li>• Click the artifact count to see all artifacts</li>
                    <li>• Artifacts from the same message are grouped together</li>
                    <li>• Use the refresh button to sync with server</li>
                  </ul>
                </div>
              )}

              {/* NEW: Loading indicator (Phase 4) */}
              {isLoadingArtifacts && (
                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Loading artifacts...</span>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}