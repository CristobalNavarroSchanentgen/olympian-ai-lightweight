import { useEffect, useState } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot, Settings, ImageIcon } from 'lucide-react';
import { ModelSettings } from './ModelSettings';

interface ModelSelectorProps {
  hasImages?: boolean;
}

export function ModelSelector({ hasImages }: ModelSelectorProps) {
  const { 
    models, 
    visionModels,
    selectedModel, 
    selectedVisionModel,
    selectModel,
    selectVisionModel,
    fetchVisionModels,
    isLoadingModels
  } = useChatStore();
  
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    console.log('🔄 [ModelSelector] Component mounted, fetching vision models...');
    // Always fetch vision models on mount to show available options
    fetchVisionModels();
  }, [fetchVisionModels]);

  // Debug logging
  useEffect(() => {
    console.log('🔍 [ModelSelector] Store state changed:', {
      modelsCount: models.length,
      models: models,
      visionModelsCount: visionModels.length,
      visionModels: visionModels,
      selectedModel,
      selectedVisionModel,
      isLoadingModels,
      hasImages
    });
  }, [models, visionModels, selectedModel, selectedVisionModel, isLoadingModels, hasImages]);

  // Handle vision model selection with "auto" as the default
  const handleVisionModelChange = (value: string) => {
    console.log('🎯 [ModelSelector] Vision model selected:', value);
    // If "auto" is selected, set to empty string (no specific vision model)
    selectVisionModel(value === 'auto' ? '' : value);
  };

  const handleModelChange = (value: string) => {
    console.log('🎯 [ModelSelector] Model selected:', value);
    selectModel(value);
  };

  // Show loading state
  if (isLoadingModels) {
    console.log('⏳ [ModelSelector] Rendering loading state');
    return (
      <div className="flex items-center gap-4">
        <div className="w-[200px] h-10 bg-muted animate-pulse rounded-md" />
        <div className="text-sm text-muted-foreground">Loading models...</div>
      </div>
    );
  }

  // Show debug info if no models
  if (models.length === 0) {
    console.log('❌ [ModelSelector] No models available, rendering error state');
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm text-destructive">
          No models found (Debug: models.length = {models.length}, isLoading = {isLoadingModels})
        </div>
      </div>
    );
  }

  console.log('✅ [ModelSelector] Rendering normal state with', models.length, 'models');

  return (
    <>
      <div className="flex items-center gap-4">
        {/* AI Model Selector */}
        <div className="flex items-center gap-2">
          <Select value={selectedModel || ''} onValueChange={handleModelChange}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={`Select AI model (${models.length} available)`} />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => {
                console.log('🔧 [ModelSelector] Rendering model option:', model);
                return (
                  <SelectItem key={model} value={model}>
                    <div className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      <span>{model}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Vision Model Selector */}
        {visionModels.length > 0 && (
          <div className="flex items-center gap-2">
            <Select 
              value={selectedVisionModel || 'auto'} 
              onValueChange={handleVisionModelChange}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={`Vision model (${visionModels.length} available)`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Auto-detect</span>
                  </div>
                </SelectItem>
                {visionModels.map((model) => {
                  console.log('🔧 [ModelSelector] Rendering vision model option:', model);
                  return (
                    <SelectItem key={model} value={model}>
                      <div className="flex items-center gap-2">
                        <ImageIcon className="h-4 w-4" />
                        <span>{model}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {hasImages && (
              <Badge variant="secondary" className="gap-1">
                <ImageIcon className="h-3 w-3" />
                Active
              </Badge>
            )}
          </div>
        )}
        
        {/* Model Settings Button */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="gap-2"
          onClick={() => {
            console.log('⚙️ [ModelSelector] Settings button clicked');
            setShowSettings(true);
          }}
          title="View model capabilities and settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Model Settings Dialog */}
      <ModelSettings 
        open={showSettings} 
        onOpenChange={setShowSettings} 
      />
    </>
  );
}