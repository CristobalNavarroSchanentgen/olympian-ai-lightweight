import { useState, useEffect } from 'react';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useChatStore } from '@/stores/useChatStore';
import { ArtifactViewer } from './ArtifactViewer';
import { ArtifactList } from './ArtifactList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export function ArtifactPanel() {
  const { currentConversation } = useChatStore();
  const { 
    selectedArtifact,
    isArtifactPanelOpen,
    getArtifactsForConversation,
    toggleArtifactPanel,
    selectArtifact,
  } = useArtifactStore();

  const [showArtifactList, setShowArtifactList] = useState(false);

  const conversationArtifacts = currentConversation 
    ? getArtifactsForConversation(currentConversation._id || '') 
    : [];

  // Sync artifact selection with conversation changes
  useEffect(() => {
    if (!currentConversation) {
      // No conversation selected, clear selection
      if (selectedArtifact) {
        selectArtifact(null);
        console.log('🎨 [ArtifactPanel] Cleared artifact selection - no conversation');
      }
      return;
    }

    const conversationId = currentConversation._id || '';
    const artifactsForConversation = getArtifactsForConversation(conversationId);
    
    // If there's a selected artifact, check if it belongs to the current conversation
    if (selectedArtifact) {
      const artifactBelongsToConversation = artifactsForConversation.some(
        artifact => artifact.id === selectedArtifact.id
      );
      
      if (!artifactBelongsToConversation) {
        // Selected artifact doesn't belong to current conversation, clear it
        selectArtifact(null);
        console.log('🎨 [ArtifactPanel] Cleared artifact selection - wrong conversation');
        
        // If new conversation has artifacts, auto-select the most recent one
        if (artifactsForConversation.length > 0) {
          const mostRecentArtifact = artifactsForConversation.sort((a, b) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          )[0];
          selectArtifact(mostRecentArtifact);
          console.log('🎨 [ArtifactPanel] Auto-selected most recent artifact:', mostRecentArtifact.id);
        }
      }
    } else if (artifactsForConversation.length > 0) {
      // No artifact selected but conversation has artifacts, select most recent
      const mostRecentArtifact = artifactsForConversation.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      selectArtifact(mostRecentArtifact);
      console.log('🎨 [ArtifactPanel] Auto-selected artifact for conversation:', mostRecentArtifact.id);
    }
  }, [currentConversation, selectedArtifact, getArtifactsForConversation, selectArtifact]);

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

  // Verify that the selected artifact belongs to the current conversation
  const isSelectedArtifactValid = selectedArtifact && conversationArtifacts.some(
    artifact => artifact.id === selectedArtifact.id
  );

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      {/* Compact Header - Only show when needed */}
      {(conversationArtifacts.length > 1 || showArtifactList) && (
        <div className="border-b border-border p-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {conversationArtifacts.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowArtifactList(!showArtifactList)}
                  className="text-xs h-7 px-2"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  {conversationArtifacts.length} artifacts
                </Button>
              )}
            </div>
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
      )}

      {/* Content - Full height when no header */}
      <div className="flex-1 overflow-hidden">
        {showArtifactList ? (
          <ArtifactList
            artifacts={conversationArtifacts}
            onSelectArtifact={(artifact) => {
              selectArtifact(artifact);
              setShowArtifactList(false);
            }}
            onClose={() => setShowArtifactList(false)}
          />
        ) : (selectedArtifact && isSelectedArtifactValid) ? (
          <div className="h-full overflow-hidden">
            <ArtifactViewer artifact={selectedArtifact} />
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
              <h3 className="text-lg font-medium mb-2">No artifacts yet</h3>
              <p className="text-sm text-muted-foreground">
                {conversationArtifacts.length === 0 
                  ? "Ask the AI to create code, documents, or other content to see them here."
                  : "Select an artifact to view and edit it."
                }
              </p>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}