import { useEffect } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bot, Eye, Wrench, ImageIcon } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface ModelSelectorProps {
  hasImages?: boolean;
}

export function ModelSelector({ hasImages }: ModelSelectorProps) {
  const { 
    models, 
    visionModels,
    selectedModel, 
    selectedVisionModel,
    modelCapabilities, 
    selectModel,
    selectVisionModel,
    fetchVisionModels
  } = useChatStore();

  useEffect(() => {
    // Always fetch vision models on mount to show available options
    fetchVisionModels();
  }, [fetchVisionModels]);

  // Handle vision model selection with "auto" as the default
  const handleVisionModelChange = (value: string) => {
    // If "auto" is selected, set to empty string (no specific vision model)
    selectVisionModel(value === 'auto' ? '' : value);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Label htmlFor="model-select">AI Model</Label>
          <Select value={selectedModel || ''} onValueChange={selectModel}>
            <SelectTrigger id="model-select" className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4" />
                    <span>{model}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        {modelCapabilities && (
          <div className="flex gap-2 mt-6">
            {modelCapabilities.vision && (
              <Badge variant="secondary" className="gap-1">
                <Eye className="h-3 w-3" />
                Vision
              </Badge>
            )}
            {modelCapabilities.tools && (
              <Badge variant="secondary" className="gap-1">
                <Wrench className="h-3 w-3" />
                Tools
              </Badge>
            )}
            <Badge variant="outline" className="text-xs">
              {modelCapabilities.contextWindow.toLocaleString()} tokens
            </Badge>
          </div>
        )}
      </div>

      {visionModels.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Label htmlFor="vision-model-select">
              Vision Model {hasImages ? '(For image processing)' : '(Optional - for when you upload images)'}
            </Label>
            <Select 
              value={selectedVisionModel || 'auto'} 
              onValueChange={handleVisionModelChange}
            >
              <SelectTrigger id="vision-model-select" className="w-full">
                <SelectValue placeholder="Select a vision model (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Auto-detect</span>
                  </div>
                </SelectItem>
                {visionModels.map((model) => (
                  <SelectItem key={model} value={model}>
                    <div className="flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      <span>{model}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              {hasImages 
                ? 'Selected vision model will process your images before sending to the main model'
                : 'When you upload images, this model will process them if your main model doesn\'t support vision'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}