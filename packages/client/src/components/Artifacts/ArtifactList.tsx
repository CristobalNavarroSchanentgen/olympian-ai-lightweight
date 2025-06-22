import { Artifact } from '@olympian/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  FileText, 
  Code, 
  Image, 
  FileJson, 
  Table, 
  ArrowLeft,
  Calendar,
} from 'lucide-react';

interface ArtifactListProps {
  artifacts: Artifact[];
  onSelectArtifact: (artifact: Artifact) => void;
  onClose: () => void;
}

export function ArtifactList({ artifacts, onSelectArtifact, onClose }: ArtifactListProps) {
  const getArtifactIcon = (type: string) => {
    switch (type) {
      case 'code':
        return Code;
      case 'html':
      case 'react':
        return Code;
      case 'svg':
        return Image;
      case 'json':
        return FileJson;
      case 'csv':
        return Table;
      case 'markdown':
      case 'text':
        return FileText;
      default:
        return FileText;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'code':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300';
      case 'html':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300';
      case 'react':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300';
      case 'svg':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300';
      case 'json':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300';
      case 'csv':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300';
      case 'markdown':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300';
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - new Date(date).getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    if (diffInMinutes < 10080) return `${Math.floor(diffInMinutes / 1440)}d ago`;
    
    return new Date(date).toLocaleDateString();
  };

  const sortedArtifacts = [...artifacts].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-medium">All Artifacts ({artifacts.length})</h3>
        </div>
      </div>

      {/* Artifact List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedArtifacts.map((artifact) => {
          const IconComponent = getArtifactIcon(artifact.type);
          
          return (
            <Card 
              key={artifact.id}
              className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => onSelectArtifact(artifact)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  <IconComponent className="h-5 w-5 text-muted-foreground" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{artifact.title}</h4>
                    <span className={`text-xs px-2 py-1 rounded-full capitalize ${getTypeColor(artifact.type)}`}>
                      {artifact.type}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                    {artifact.language && (
                      <span>{artifact.language}</span>
                    )}
                    <span>v{artifact.version}</span>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(artifact.updatedAt)}
                    </div>
                  </div>
                  
                  {/* Content Preview */}
                  <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded font-mono">
                    <div className="line-clamp-2 whitespace-pre-wrap">
                      {artifact.content.substring(0, 100)}
                      {artifact.content.length > 100 && '...'}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
        
        {artifacts.length === 0 && (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">No artifacts yet</h3>
            <p className="text-sm text-muted-foreground">
              Start a conversation and ask the AI to create code, documents, or other content.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
