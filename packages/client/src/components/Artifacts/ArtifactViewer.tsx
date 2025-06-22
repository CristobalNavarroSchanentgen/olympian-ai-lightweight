import { useState, useEffect } from 'react';
import { Artifact } from '@olympian/shared';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { AlertCircle, Save, X } from 'lucide-react';
import { toast } from '@/hooks/useToast';

interface ArtifactViewerProps {
  artifact: Artifact;
}

export function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  const { viewMode, updateArtifact } = useArtifactStore();
  const [editContent, setEditContent] = useState(artifact.content);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setEditContent(artifact.content);
    setHasChanges(false);
  }, [artifact.content]);

  useEffect(() => {
    setHasChanges(editContent !== artifact.content);
  }, [editContent, artifact.content]);

  const handleSave = () => {
    if (hasChanges) {
      updateArtifact(artifact.id, editContent, `Updated ${artifact.type}`);
      setIsEditing(false);
      toast({
        title: 'Saved',
        description: 'Artifact has been updated.',
      });
    }
  };

  const handleCancel = () => {
    setEditContent(artifact.content);
    setIsEditing(false);
    setHasChanges(false);
  };

  const renderCodeView = () => (
    <div className="h-full flex flex-col">
      {isEditing ? (
        <>
          <div className="flex items-center justify-between p-2 border-b bg-muted/50">
            <span className="text-sm font-medium">Editing {artifact.type}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button 
                size="sm" 
                onClick={handleSave} 
                disabled={!hasChanges}
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </div>
          </div>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="flex-1 resize-none font-mono text-sm border-0 rounded-none"
            placeholder="Enter your content here..."
          />
        </>
      ) : (
        <div 
          className="h-full p-4 overflow-auto cursor-text hover:bg-muted/20 transition-colors"
          onClick={() => setIsEditing(true)}
        >
          <pre className="text-sm font-mono whitespace-pre-wrap break-words">
            <code>{artifact.content}</code>
          </pre>
        </div>
      )}
    </div>
  );

  const renderPreview = () => {
    switch (artifact.type) {
      case 'html':
        return (
          <div className="h-full">
            <iframe
              srcDoc={artifact.content}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
              title={artifact.title}
            />
          </div>
        );
      
      case 'svg':
        return (
          <div className="h-full p-4 overflow-auto bg-white dark:bg-gray-900">
            <div 
              className="flex items-center justify-center min-h-full"
              dangerouslySetInnerHTML={{ __html: artifact.content }}
            />
          </div>
        );
      
      case 'markdown':
        return (
          <div className="h-full p-4 overflow-auto prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown>{artifact.content}</ReactMarkdown>
          </div>
        );
      
      case 'json':
        try {
          const jsonData = JSON.parse(artifact.content);
          return (
            <div className="h-full p-4 overflow-auto">
              <pre className="text-sm font-mono">
                {JSON.stringify(jsonData, null, 2)}
              </pre>
            </div>
          );
        } catch (error) {
          return renderError('Invalid JSON format');
        }
      
      case 'csv':
        return renderCSVPreview(artifact.content);
      
      case 'mermaid':
        return renderMermaidPreview(artifact.content);
      
      case 'react':
        return (
          <div className="h-full p-4 overflow-auto">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium">React Component Preview</span>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                React component preview is not yet implemented. Use code view to see the component source.
              </p>
              <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-auto max-h-32">
                {artifact.content.substring(0, 200)}...
              </pre>
            </Card>
          </div>
        );
      
      default:
        return renderCodeView();
    }
  };

  const renderError = (message: string) => (
    <div className="h-full flex items-center justify-center p-4">
      <Card className="p-6 text-center">
        <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
        <h3 className="font-medium mb-1">Preview Error</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </Card>
    </div>
  );

  const renderCSVPreview = (csvContent: string) => {
    try {
      const lines = csvContent.split('\n').filter(line => line.trim());
      const headers = lines[0]?.split(',').map(h => h.trim()) || [];
      const rows = lines.slice(1).map(line => line.split(',').map(cell => cell.trim()));

      return (
        <div className="h-full p-4 overflow-auto">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-border">
              <thead>
                <tr className="bg-muted">
                  {headers.map((header, i) => (
                    <th key={i} className="border border-border p-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/50">
                    {row.map((cell, j) => (
                      <td key={j} className="border border-border p-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    } catch (error) {
      return renderError('Invalid CSV format');
    }
  };

  const renderMermaidPreview = (mermaidContent: string) => {
    return (
      <div className="h-full p-4 overflow-auto">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-yellow-500" />
            <span className="text-sm font-medium">Mermaid Diagram Preview</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Mermaid diagram rendering is not yet implemented. Use code view to see the diagram source.
          </p>
          <pre className="text-xs font-mono bg-muted/50 p-2 rounded overflow-auto max-h-32">
            {mermaidContent.substring(0, 200)}...
          </pre>
        </Card>
      </div>
    );
  };

  if (viewMode === 'split') {
    return (
      <div className="h-full flex">
        <div className="w-1/2 border-r border-border">
          {renderCodeView()}
        </div>
        <div className="w-1/2">
          {renderPreview()}
        </div>
      </div>
    );
  }

  if (viewMode === 'preview') {
    return renderPreview();
  }

  return renderCodeView();
}

// Simple markdown renderer (you might want to use react-markdown instead)
function ReactMarkdown({ children }: { children: string }) {
  const html = children
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^\\* (.*$)/gim, '<li>$1</li>')
    .replace(/\\*\\*(.*?)\\*\\*/gim, '<strong>$1</strong>')
    .replace(/\\*(.*?)\\*/gim, '<em>$1</em>')
    .replace(/\\[([^\\]]+)\\]\\(([^\\)]+)\\)/gim, '<a href="$2">$1</a>')
    .replace(/\\n/gim, '<br>');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
