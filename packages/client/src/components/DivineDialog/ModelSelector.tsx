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
    <div className="flex items-center gap-4">
      {/* AI Model Selector */}
      <div className="flex items-center gap-2">
        <Select value={selectedModel || ''} onValueChange={selectModel}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select AI model" />
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

      {/* Vision Model Selector */}
      {visionModels.length > 0 && (
        <div className="flex items-center gap-2">
          <Select 
            value={selectedVisionModel || 'auto'} 
            onValueChange={handleVisionModelChange}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Vision model" />
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
        </div>
      )}
      
      {/* Model Capabilities Badges */}
      {modelCapabilities && (
        <div className="flex gap-2">
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
  );
}