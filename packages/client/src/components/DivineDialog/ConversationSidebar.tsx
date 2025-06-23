import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/stores/useChatStore';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { useTypedMessagesStore } from '@/stores/useTypedMessagesStore';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Plus, Trash } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConversationSidebar() {
  const {
    conversations,
    currentConversation,
    fetchConversations,
    selectConversation,
    createConversation,
    deleteConversation,
  } = useChatStore();

  const { clearTypedMessages } = useTypedMessagesStore();
  const { selectArtifact, setArtifactPanelOpen, getArtifactsForConversation } = useArtifactStore();

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleSelectConversation = (conversationId: string) => {
    console.log('🔄 [ConversationSidebar] Switching to conversation:', conversationId);
    
    // Clear typed messages when switching conversations
    clearTypedMessages();
    
    // Clear artifact selection immediately to prevent showing artifacts from the wrong conversation
    selectArtifact(null);
    
    // Get artifacts for the target conversation
    const artifactsForConversation = getArtifactsForConversation(conversationId);
    console.log('🎨 [ConversationSidebar] Artifacts for target conversation:', artifactsForConversation.length);
    
    // If the target conversation has artifacts, keep panel open and select the most recent one
    if (artifactsForConversation.length > 0) {
      const mostRecentArtifact = artifactsForConversation.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      
      // Select the most recent artifact after a brief delay to ensure conversation is loaded
      setTimeout(() => {
        selectArtifact(mostRecentArtifact);
        setArtifactPanelOpen(true);
        console.log('🎨 [ConversationSidebar] Auto-selected most recent artifact:', mostRecentArtifact.id);
      }, 100);
    } else {
      // No artifacts in target conversation, close the panel
      setArtifactPanelOpen(false);
      console.log('🎨 [ConversationSidebar] No artifacts found, closing artifact panel');
    }
    
    // Select the conversation (this will also update the chat store)
    selectConversation(conversationId);
  };

  const handleCreateConversation = () => {
    console.log('🆕 [ConversationSidebar] Creating new conversation');
    
    // Clear typed messages when creating a new conversation
    clearTypedMessages();
    
    // Clear artifact selection and close panel for new conversation
    selectArtifact(null);
    setArtifactPanelOpen(false);
    console.log('🎨 [ConversationSidebar] Cleared artifacts for new conversation');
    
    createConversation();
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Conversations</CardTitle>
          <Button
            size="sm"
            onClick={handleCreateConversation}
          >
            <Plus className="mr-2 h-4 w-4" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-full px-4">
          <div className="space-y-2 pb-4">
            {conversations.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  No conversations yet
                </p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation._id?.toString()}
                  className={cn(
                    'group relative rounded-lg border p-3 hover:bg-accent cursor-pointer transition-colors',
                    currentConversation?._id === conversation._id && 'bg-accent'
                  )}
                  onClick={() => handleSelectConversation(conversation._id!.toString())}
                >
                  <div className="pr-8">
                    <h4 className="font-medium text-sm line-clamp-1">
                      {conversation.title}
                    </h4>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{conversation.model}</span>
                      <span>•</span>
                      <span>
                        {formatDistanceToNow(new Date(conversation.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {conversation.messageCount} messages
                    </div>
                  </div>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conversation._id!.toString());
                    }}
                  >
                    <Trash className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}