import { useState } from 'react';
import { ConnectionsPanel } from '@/components/ConnectionsPanel';
import { MCPConfigPanel } from '@/components/MCPConfigPanel';
import { ConversationSidebar } from '@/components/DivineDialog/ConversationSidebar';
import { DivineDialog } from '@/components/DivineDialog';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ThemeProvider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Cable, Settings, History, AlertTriangle } from 'lucide-react';

// Import debug console for multi-host WebSocket monitoring
import '@/utils/debugConsole';

// Global error fallback component
const AppErrorFallback = () => (
  <div className="h-screen bg-background flex items-center justify-center p-4">
    <div className="max-w-md w-full p-6 border border-red-500 rounded-lg bg-red-50 dark:bg-red-900/20">
      <div className="flex items-center gap-3 mb-4">
        <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
        <h2 className="text-lg font-semibold text-red-800 dark:text-red-200">
          Application Error
        </h2>
      </div>
      <p className="text-sm text-red-700 dark:text-red-300 mb-4">
        An unexpected error occurred in the application. This might be due to corrupted data or a network issue.
      </p>
      <div className="space-y-2">
        <Button 
          onClick={() => window.location.reload()} 
          variant="destructive"
          className="w-full"
        >
          Reload Application
        </Button>
        <Button 
          onClick={() => {
            localStorage.clear();
            window.location.reload();
          }} 
          variant="outline"
          className="w-full"
        >
          Clear Data & Reload
        </Button>
      </div>
      <p className="text-xs text-red-600 dark:text-red-400 mt-4">
        If the problem persists, please report this issue.
      </p>
    </div>
  </div>
);

function App() {
  const [showConnections, setShowConnections] = useState(false);
  const [showMCPConfig, setShowMCPConfig] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <ErrorBoundary fallback={<AppErrorFallback />}>
      <ThemeProvider defaultTheme="dark" storageKey="olympian-theme">
        <div className="h-screen bg-background flex flex-col overflow-hidden">
          <header className="border-b flex-shrink-0">
            <div className="container flex h-14 items-center justify-between px-4">
              <h1 className="text-xl font-bold">Olympian AI</h1>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-2"
                >
                  <History className="h-4 w-4" />
                  History
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowConnections(true)}
                  className="flex items-center gap-2"
                >
                  <Cable className="h-4 w-4" />
                  Connections
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowMCPConfig(true)}
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  MCP Config
                </Button>
              </div>
            </div>
          </header>
          
          <main className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <DivineDialog />
            </ErrorBoundary>
          </main>

          {/* Connections Dialog */}
          <Dialog open={showConnections} onOpenChange={setShowConnections}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Cable className="h-5 w-5" />
                  Connections
                </DialogTitle>
              </DialogHeader>
              <ConnectionsPanel />
            </DialogContent>
          </Dialog>

          {/* MCP Config Dialog */}
          <Dialog open={showMCPConfig} onOpenChange={setShowMCPConfig}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  MCP Configuration
                </DialogTitle>
              </DialogHeader>
              <MCPConfigPanel />
            </DialogContent>
          </Dialog>

          {/* Conversation History Dialog */}
          <Dialog open={showHistory} onOpenChange={setShowHistory}>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Conversation History
                </DialogTitle>
              </DialogHeader>
              <ConversationSidebar />
            </DialogContent>
          </Dialog>
          
          <Toaster />
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;