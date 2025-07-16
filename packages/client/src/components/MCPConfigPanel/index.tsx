import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/useToast';
import { api } from '@/services/api';
import { ConfigEditor } from './ConfigEditor';
import { ToolDescriptionEditor } from './ToolDescriptionEditor';
import { BackupManager } from './BackupManager';
import { ServerManager } from './ServerManager';
import { Save, Download, Upload } from 'lucide-react';

export function MCPConfigPanel() {
  const [config, setConfig] = useState<any>({});
  const [toolOverrides, setToolOverrides] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('config');

  const loadConfig = async () => {
    try {
      const data = await api.getMCPConfig();
      setConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load MCP configuration",
        variant: "destructive",
      });
    }
  };

  const [toolOverrides, setToolOverrides] = useState<Record<string, any>>({});
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("config");

  const loadConfig = async () => {
    try {
      const data = await api.getMCPConfig();
      setConfig(data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load MCP configuration",
        variant: "destructive",
      });
    }
  };
      const data = await api.getMCPConfig();
      setConfig(data);
  useEffect(() => {
    loadConfig();
    loadToolOverrides();
    loadAvailableTools();
  }, []);

  const loadToolOverrides = async () => {
    try {
      const data = await api.getToolOverrides();
      setToolOverrides(data);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to load tool overrides',
        variant: 'destructive',
      });
    }
  };

  const handleSaveConfig = async () => {
    setIsSaving(true);
    try {
      await api.updateMCPConfig(config);
      setHasChanges(false);
      toast({
        title: 'Success',
        description: 'MCP configuration saved successfully',
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save MCP configuration",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }

  const loadAvailableTools = async () => {
    try {
      const response = await api.get("/mcp/tools");
      setAvailableTools(response.data.data.tools || []);
    } catch (error) {
      console.log("Tools not available:", error);
      setAvailableTools([]);
    }
  };
  const handleSaveToolOverrides = async () => {
    setIsSaving(true);
    try {
      await api.updateToolOverrides(toolOverrides);
      setHasChanges(false);
      toast({
        title: 'Success',
        description: 'Tool overrides saved successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save tool overrides',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const exportData = {
      config,
      toolOverrides,
      exportDate: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mcp-config-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importData = JSON.parse(e.target?.result as string);
        if (importData.config) {
          setConfig(importData.config);
        }
        if (importData.toolOverrides) {
          setToolOverrides(importData.toolOverrides);
        }
        setHasChanges(true);
        toast({
          title: 'Success',
          description: 'Configuration imported successfully',
        });
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to import configuration',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">MCP Configuration</h2>
          <p className="text-muted-foreground">
            Configure MCP servers and customize tool descriptions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <label>
            <Button variant="outline" asChild>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </span>
            </Button>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImport}
            />
          </label>
          <Button
            onClick={activeTab === 'config' ? handleSaveConfig : handleSaveToolOverrides}
            disabled={!hasChanges || isSaving}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="servers">MCP Servers</TabsTrigger>
          <TabsTrigger value="tools">Tool Descriptions</TabsTrigger>
          <TabsTrigger value="backups">Backups</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>MCP Configuration File</CardTitle>
              <CardDescription>
                Edit your MCP configuration in JSON format. This file controls how MCP servers are initialized and connected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ConfigEditor
                value={config}
                onChange={(newConfig) => {
                  setConfig(newConfig);
                  setHasChanges(true);
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="servers" className="space-y-4">
          <ServerManager />
        </TabsContent>

        <TabsContent value="tools" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Tool Description Overrides</CardTitle>
              <CardDescription>
                Customize tool descriptions and add examples to make them more user-friendly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ToolDescriptionEditor
                overrides={toolOverrides}
                availableTools={availableTools}
                onChange={(newOverrides) => {
                  setToolOverrides(newOverrides);
                  setHasChanges(true);
                }}
              />            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="space-y-4">
          <BackupManager onRestore={() => {
            loadConfig();
            loadToolOverrides();
          }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
