import { useChatStore } from '@/stores/useChatStore';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Bot, Eye, Wrench } from 'lucide-react';

export function ModelSelector() {
  const { models, selectedModel, modelCapabilities, selectModel } = useChatStore();

  return (
    <div className="flex items-center gap-4">
      <Select value={selectedModel || ''} onValueChange={selectModel}>
        <SelectTrigger className="w-[300px]">
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