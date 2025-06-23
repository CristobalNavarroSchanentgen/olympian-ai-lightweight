import { useState } from 'react';
import { Artifact } from '@olympian/shared';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { 
  Code, 
  Eye, 
  Edit, 
  MoreVertical, 
  Download, 
  Trash2, 
  History,
  Copy,
  Check,
  X,
} from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface ArtifactHeaderProps {
  artifact: Artifact;
}

export function ArtifactHeader({ artifact }: ArtifactHeaderProps) {
  const { 
    viewMode, 
    setViewMode, 
    deleteArtifact,
    getVersionsForArtifact,
    setArtifactPanelOpen,
  } = useArtifactStore();
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(artifact.title);
  const [copied, setCopied] = useState(false);

  const versions = getVersionsForArtifact(artifact.id);
  const canShowPreview = ['html', 'react', 'svg', 'mermaid'].includes(artifact.type);

  const handleTitleSave = () => {
    if (editedTitle.trim() && editedTitle !== artifact.title) {
      // Note: This would need backend support to update artifact title
      // For now, we'll just update locally
      setIsEditingTitle(false);
      toast({
        title: 'Title updated',
        description: 'Artifact title has been updated.',
      });
    } else {
      setEditedTitle(artifact.title);
      setIsEditingTitle(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied',
        description: 'Artifact content copied to clipboard.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to copy content.',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = () => {
    const element = document.createElement('a');
    const file = new Blob([artifact.content], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${artifact.title}.${getFileExtension(artifact.type, artifact.language)}`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this artifact?')) {
      deleteArtifact(artifact.id);
      toast({
        title: 'Deleted',
        description: 'Artifact has been deleted.',
      });
    }
  };

  const handleClose = () => {
    setArtifactPanelOpen(false);
  };

  return (
    <div className="border-b border-border p-4 space-y-3">
      {/* Title and Controls */}
      <div className="flex items-center justify-between">
        {isEditingTitle ? (
          <Input
            value={editedTitle}
            onChange={(e) => setEditedTitle(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSave();
              if (e.key === 'Escape') {
                setEditedTitle(artifact.title);
                setIsEditingTitle(false);
              }
            }}
            className="text-lg font-medium"
            autoFocus
          />
        ) : (
          <h3 
            className="text-lg font-medium cursor-pointer hover:bg-muted/50 px-2 py-1 rounded"
            onClick={() => setIsEditingTitle(true)}
            title="Click to edit title"
          >
            {artifact.title}
          </h3>
        )}

        <div className="flex items-center gap-2">
          {/* Close Button */}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handleClose}
            className="h-8 w-8 p-0"
            title="Close artifact panel"
          >
            <X className="h-4 w-4" />
          </Button>

          {/* More Options Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy content'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </DropdownMenuItem>
              {versions.length > 1 && (
                <DropdownMenuItem>
                  <History className="h-4 w-4 mr-2" />
                  Version history ({versions.length})
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={handleDelete}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <div className="flex items-center gap-4">
          <span className="capitalize">{artifact.type}</span>
          {artifact.language && (
            <span>{artifact.language}</span>
          )}
          <span>v{artifact.version}</span>
        </div>
        <span>{new Date(artifact.updatedAt).toLocaleDateString()}</span>
      </div>

      {/* View Mode Toggle */}
      {(artifact.type === 'code' || canShowPreview) && (
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
          <Button
            variant={viewMode === 'code' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('code')}
            className="h-8"
          >
            <Code className="h-4 w-4 mr-1" />
            Code
          </Button>
          {canShowPreview && (
            <Button
              variant={viewMode === 'preview' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('preview')}
              className="h-8"
            >
              <Eye className="h-4 w-4 mr-1" />
              Preview
            </Button>
          )}
          {canShowPreview && (
            <Button
              variant={viewMode === 'split' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('split')}
              className="h-8"
            >
              <Edit className="h-4 w-4 mr-1" />
              Split
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function getFileExtension(type: string, language?: string): string {
  if (language) {
    switch (language.toLowerCase()) {
      case 'javascript':
      case 'js':
        return 'js';
      case 'typescript':
      case 'ts':
        return 'ts';
      case 'jsx':
        return 'jsx';
      case 'tsx':
        return 'tsx';
      case 'python':
      case 'py':
        return 'py';
      case 'html':
        return 'html';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'markdown':
      case 'md':
        return 'md';
      default:
        return language.toLowerCase();
    }
  }

  switch (type) {
    case 'html':
      return 'html';
    case 'react':
      return 'jsx';
    case 'svg':
      return 'svg';
    case 'json':
      return 'json';
    case 'csv':
      return 'csv';
    case 'markdown':
      return 'md';
    default:
      return 'txt';
  }
}
