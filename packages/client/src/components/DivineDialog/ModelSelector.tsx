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
import { Button } from '@/components/ui/button';
import { Bot, Settings, ImageIcon } from 'lucide-react';

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
          {hasImages && (
            <Badge variant="secondary" className="gap-1">
              <ImageIcon className="h-3 w-3" />
              Active
            </Badge>
          )}
        </div>
      )}
      
      {/* Model Settings Button (placeholder for future functionality) */}
      <Button 
        variant="ghost" 
        size="sm" 
        className="gap-2"
        onClick={() => {
          // Placeholder for model settings functionality
          console.log('Model settings clicked');
        }}
      >
        <Settings className="h-4 w-4" />
      </Button>
    </div>
  );
}