import { useEffect, useState } from 'react';
import { ModelCapability } from '@olympian/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, ImageIcon, Wrench, Brain, Cpu, Database } from 'lucide-react';

interface ModelSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ModelSettings({ open, onOpenChange }: ModelSettingsProps) {
  const [capabilities, setCapabilities] = useState<ModelCapability[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchModelCapabilities();
    }
  }, [open]);

  const fetchModelCapabilities = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/models/capabilities');
      if (!response.ok) {
        throw new Error('Failed to fetch model capabilities');
      }
      
      const data = await response.json();
      setCapabilities(data.capabilities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      console.error('Failed to fetch model capabilities:', err);
    } finally {
      setLoading(false);
    }
  };

  const getCapabilityBadges = (model: ModelCapability) => {
    const badges = [];
    
    if (model.vision) {
      badges.push(
        <Badge key="vision" variant="default" className="gap-1">
          <ImageIcon className="h-3 w-3" />
          Vision
        </Badge>
      );
    }
    
    if (model.tools) {
      badges.push(
        <Badge key="tools" variant="secondary" className="gap-1">
          <Wrench className="h-3 w-3" />
          Tools
        </Badge>
      );
    }
    
    if (model.reasoning) {
      badges.push(
        <Badge key="reasoning" variant="outline" className="gap-1">
          <Brain className="h-3 w-3" />
          Reasoning
        </Badge>
      );
    }
    
    return badges;
  };

  const groupModelsByCapability = () => {
    const visionModels = capabilities.filter(m => m.vision);
    const toolModels = capabilities.filter(m => m.tools && !m.vision);
    const reasoningModels = capabilities.filter(m => m.reasoning && !m.vision);
    const basicModels = capabilities.filter(m => !m.vision && !m.tools && !m.reasoning);
    
    return { visionModels, toolModels, reasoningModels, basicModels };
  };

  const { visionModels, toolModels, reasoningModels, basicModels } = groupModelsByCapability();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Model Settings</DialogTitle>
          <DialogDescription>
            View and configure AI model capabilities
          </DialogDescription>
        </DialogHeader>
        
        <Tabs defaultValue="model-types" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="model-types">Model Types</TabsTrigger>
            <TabsTrigger value="model-config">Model Config</TabsTrigger>
          </TabsList>
          
          <TabsContent value="model-types" className="mt-4">
            <ScrollArea className="h-[50vh] w-full pr-4">
              {loading && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
              )}
              
              {error && (
                <div className="text-center text-red-500 py-4">
                  Error: {error}
                </div>
              )}
              
              {!loading && !error && (
                <div className="space-y-6">
                  {/* Vision Models */}
                  {visionModels.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        Vision Models
                      </h3>
                      <div className="grid gap-3">
                        {visionModels.map((model) => (
                          <Card key={model.name} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium flex items-center gap-2">
                                  <Bot className="h-4 w-4" />
                                  {model.name}
                                </h4>
                                {model.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {model.description}
                                  </p>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Cpu className="h-3 w-3" />
                                    Max Tokens: {model.maxTokens.toLocaleString()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Database className="h-3 w-3" />
                                    Context: {model.contextWindow.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {getCapabilityBadges(model)}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Tool Models */}
                  {toolModels.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Wrench className="h-4 w-4" />
                        Tool-Capable Models
                      </h3>
                      <div className="grid gap-3">
                        {toolModels.map((model) => (
                          <Card key={model.name} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium flex items-center gap-2">
                                  <Bot className="h-4 w-4" />
                                  {model.name}
                                </h4>
                                {model.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {model.description}
                                  </p>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Cpu className="h-3 w-3" />
                                    Max Tokens: {model.maxTokens.toLocaleString()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Database className="h-3 w-3" />
                                    Context: {model.contextWindow.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {getCapabilityBadges(model)}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Reasoning Models */}
                  {reasoningModels.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        Reasoning Models
                      </h3>
                      <div className="grid gap-3">
                        {reasoningModels.map((model) => (
                          <Card key={model.name} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium flex items-center gap-2">
                                  <Bot className="h-4 w-4" />
                                  {model.name}
                                </h4>
                                {model.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {model.description}
                                  </p>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Cpu className="h-3 w-3" />
                                    Max Tokens: {model.maxTokens.toLocaleString()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Database className="h-3 w-3" />
                                    Context: {model.contextWindow.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                {getCapabilityBadges(model)}
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Basic Models */}
                  {basicModels.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Basic Models
                      </h3>
                      <div className="grid gap-3">
                        {basicModels.map((model) => (
                          <Card key={model.name} className="p-4">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="font-medium flex items-center gap-2">
                                  <Bot className="h-4 w-4" />
                                  {model.name}
                                </h4>
                                {model.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {model.description}
                                  </p>
                                )}
                                <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Cpu className="h-3 w-3" />
                                    Max Tokens: {model.maxTokens.toLocaleString()}
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <Database className="h-3 w-3" />
                                    Context: {model.contextWindow.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
          
          <TabsContent value="model-config" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Model Configuration</CardTitle>
                <CardDescription>
                  Advanced model configuration options will be available here in future updates.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This section is under development. You'll be able to configure model-specific
                  parameters, temperature settings, and other advanced options here.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
