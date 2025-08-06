import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useMCP } from '@/contexts/MCPContext';
import { ConfigEditor } from './ConfigEditor';
import { ToolDescriptionEditor } from './ToolDescriptionEditor';
import { BackupManager } from './BackupManager';
import { ServerManager } from './ServerManager';
import { Save, Download, Upload } from 'lucide-react';

export function MCPConfigPanel() {
  const { config: mcpConfig } = useMCP();
  const [config, setConfig] = useState<any>(mcpConfig || {});
  const [toolOverrides, setToolOverrides] = useState<Record<string, any>>({});
  const [availableTools] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  // Sync with MCP context config
  const handleSave = async () => {};
  const handleSaveToolOverrides = async () => {};
  const handleExport = () => {
    const exportData = { config, toolOverrides, timestamp: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mcp-config-' + Date.now() + '.json';
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (data.config) {
          setConfig(data.config);
          setHasChanges(true);
        }
        if (data.toolOverrides) setToolOverrides(data.toolOverrides);
      } catch (error) { console.error('Import failed', error); }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>MCP Configuration</CardTitle>
          <CardDescription>
            Manage Model Context Protocol servers and tool configurations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-end gap-2 mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <label htmlFor="import-config">
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Import
                </span>
              </Button>
            </label>
            <input
              id="import-config"
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
            <Button
              onClick={activeTab === 'config' ? handleSave : handleSaveToolOverrides}
              disabled={!hasChanges || isSaving}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config">Server Config</TabsTrigger>
          <TabsTrigger value="tools">Tool Overrides</TabsTrigger>
          <TabsTrigger value="servers">Server Management</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>
        
        <TabsContent value="config" className="space-y-4">
          <ConfigEditor
            value={config}
            onChange={(newConfig) => {
              setConfig(newConfig);
              setHasChanges(true);
            }}
          />
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <ToolDescriptionEditor
            overrides={toolOverrides}
            availableTools={availableTools}
            onChange={(newOverrides) => {
              setToolOverrides(newOverrides);
              setHasChanges(true);
            }}
          />
        </TabsContent>

        <TabsContent value="servers" className="space-y-4">
          <ServerManager />
        </TabsContent>

        <TabsContent value="backups" className="space-y-4">
          <BackupManager onRestore={() => {
          }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
