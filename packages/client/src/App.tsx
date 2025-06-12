import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { MCPConfigPanel } from '@/components/MCPConfigPanel';
import { DivineDialog } from '@/components/DivineDialog';
import { Toaster } from '@/components/ui/toaster';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Cable, Settings, MessageSquare } from 'lucide-react';

function App() {
  const { connect, disconnect } = useWebSocket();

  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="olympian-theme">
      <div className="min-h-screen bg-background">
        <header className="border-b">
          <div className="container flex h-16 items-center px-4">
            <h1 className="text-2xl font-bold">Olympian AI Lightweight</h1>
          </div>
        </header>
        
        <main className="container px-4 py-6">
          <Tabs defaultValue="chat" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="connections" className="flex items-center gap-2">
                <Cable className="h-4 w-4" />
                Connections
              </TabsTrigger>
              <TabsTrigger value="mcp" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                MCP Config
              </TabsTrigger>
              <TabsTrigger value="chat" className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Divine Dialog
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="connections" className="space-y-4">
              <ConnectionsPanel />
            </TabsContent>
            
            <TabsContent value="mcp" className="space-y-4">
              <MCPConfigPanel />
            </TabsContent>
            
            <TabsContent value="chat" className="space-y-4">
              <DivineDialog />
            </TabsContent>
          </Tabs>
        </main>
        
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;