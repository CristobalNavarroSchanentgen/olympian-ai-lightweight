import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/stores/useChatStore';
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

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Conversations</CardTitle>
          <Button
            size="sm"
            onClick={createConversation}
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
                  onClick={() => selectConversation(conversation._id!.toString())}
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