import { useState, useEffect, useRef } from 'react';
import { Artifact } from '@olympian/shared';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  AlertCircle, 
  Save, 
  X, 
  Copy, 
  Download, 
  Trash2, 
  Check,
  Code,
  Eye,
  Edit,
  MoreHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/hooks/useToast';
import CodeMirror from '@uiw/react-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { loadLanguage } from '@uiw/codemirror-extensions-langs';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { Extension } from '@codemirror/state';
import hljs from 'highlight.js';
import 'highlight.js/styles/github-dark-dimmed.css';

interface ArtifactViewerProps {
  artifact: Artifact;
}

// Helper function to get appropriate CodeMirror extension based on language/type
const getLanguageExtension = (language: string): Extension[] => {
  const lang = language.toLowerCase();
  
  switch (lang) {
    case 'javascript':
    case 'js':
      return [javascript({ jsx: false })];
    case 'typescript':
    case 'ts':
      return [javascript({ typescript: true })];
    case 'jsx':
      return [javascript({ jsx: true })];
    case 'tsx':
      return [javascript({ jsx: true, typescript: true })];
    case 'react':
      return [javascript({ jsx: true, typescript: true })];
    case 'python':
    case 'py':
      return [python()];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    case 'json':
      return [json()];
    case 'markdown':
    case 'md':
      return [markdown()];
    case 'xml':
    case 'svg':
      return [xml()];
    default:
      // Try to load language dynamically if available
      try {
        // Use try-catch to handle unsupported languages gracefully
        const extension = loadLanguage(lang as any);
        return extension ? [extension] : [];
      } catch {
        // Language not supported, return empty array
        return [];
      }
  }
};

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

export function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  const { viewMode, setViewMode, updateArtifact, deleteArtifact } = useArtifactStore();
  const [editContent, setEditContent] = useState(artifact.content);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

  const canShowPreview = ['html', 'react', 'svg', 'mermaid'].includes(artifact.type);

  useEffect(() => {
    setEditContent(artifact.content);
    setHasChanges(false);
  }, [artifact.content]);

  useEffect(() => {
    setHasChanges(editContent !== artifact.content);
  }, [editContent, artifact.content]);

  // Apply syntax highlighting when content changes
  useEffect(() => {
    if (codeRef.current && !isEditing) {
      // Remove any existing highlighting classes
      codeRef.current.removeAttribute('data-highlighted');
      
      // Set language class based on artifact language or type
      const language = artifact.language || artifact.type;
      if (language && language !== 'text') {
        codeRef.current.className = `language-${language}`;
      }
      
      // Apply highlighting
      hljs.highlightElement(codeRef.current);
    }
  }, [artifact.content, artifact.language, artifact.type, isEditing]);

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

  const renderToolbar = () => (
    <div className="flex items-center justify-between p-2 border-b bg-muted/50 flex-shrink-0">
      <div className="flex items-center gap-1">
        {/* View Mode Toggle */}
        {(artifact.type === 'code' || canShowPreview) && (
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant={viewMode === 'code' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('code')}
              className="h-7 px-2 text-xs"
            >
              <Code className="h-3 w-3 mr-1" />
              Code
            </Button>
            {canShowPreview && (
              <>
                <Button
                  variant={viewMode === 'preview' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('preview')}
                  className="h-7 px-2 text-xs"
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Preview
                </Button>
                <Button
                  variant={viewMode === 'split' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('split')}
                  className="h-7 px-2 text-xs"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Split
                </Button>
              </>
            )}
          </div>
        )}
        
        {/* Artifact info */}
        <span className="text-xs text-muted-foreground">
          {artifact.type} • v{artifact.version}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {/* Quick actions */}
        <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 px-2">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleDownload} className="h-7 px-2">
          <Download className="h-3 w-3" />
        </Button>
        
        {/* More options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2">
              <MoreHorizontal className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCopy}>
              {copied ? <Check className="h-3 w-3 mr-2" /> : <Copy className="h-3 w-3 mr-2" />}
              {copied ? 'Copied!' : 'Copy content'}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownload}>
              <Download className="h-3 w-3 mr-2" />
              Download
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Edit mode actions */}
        {isEditing && (
          <>
            <div className="w-px h-4 bg-border mx-1" />
            <Button size="sm" variant="ghost" onClick={handleCancel} className="h-7 px-2">
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
            <Button 
              size="sm" 
              onClick={handleSave} 
              disabled={!hasChanges}
              className="h-7 px-2"
            >
              <Save className="h-3 w-3 mr-1" />
              Save
            </Button>
          </>
        )}
      </div>
    </div>
  );

  const renderCodeView = () => (
    <div className="h-full flex flex-col">
      {renderToolbar()}
      
      {isEditing ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <CodeMirror
            value={editContent}
            onChange={(value) => setEditContent(value)}
            theme={oneDark}
            extensions={getLanguageExtension(artifact.language || artifact.type)}
            style={{
              fontSize: '0.875rem',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            }}
            className="h-full overflow-auto"
            height="100%"
            basicSetup={{
              lineNumbers: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              highlightSelectionMatches: true,
              searchKeymap: true,
              foldGutter: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              history: true,
              drawSelection: true,
              rectangularSelection: true,
              crosshairCursor: true,
            }}
          />
        </div>
      ) : (
        <div 
          className="flex-1 p-4 overflow-auto cursor-text hover:bg-muted/20 transition-colors"
          onClick={() => setIsEditing(true)}
        >
          <pre className="hljs bg-[#22272e] rounded-lg border border-gray-700 p-4 text-sm leading-relaxed overflow-x-auto max-h-full">
            <code 
              ref={codeRef}
              className={artifact.language || artifact.type ? `language-${artifact.language || artifact.type}` : ''}
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                fontSize: '0.875rem',
                lineHeight: '1.5',
                display: 'block',
                whiteSpace: 'pre',
                overflowWrap: 'normal',
              }}
            >
              {artifact.content}
            </code>
          </pre>
        </div>
      )}
    </div>
  );

  const renderPreview = () => {
    switch (artifact.type) {
      case 'html':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && renderToolbar()}
            <div className="flex-1 overflow-hidden">
              <iframe
                srcDoc={artifact.content}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title={artifact.title}
              />
            </div>
          </div>
        );
      
      case 'svg':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && renderToolbar()}
            <div className="flex-1 p-4 overflow-auto bg-white dark:bg-gray-900">
              <div 
                className="flex items-center justify-center min-h-full"
                dangerouslySetInnerHTML={{ __html: artifact.content }}
              />
            </div>
          </div>
        );
      
      case 'markdown':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && renderToolbar()}
            <div className="flex-1 p-4 overflow-auto prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown>{artifact.content}</ReactMarkdown>
            </div>
          </div>
        );
      
      case 'json':
        try {
          const jsonData = JSON.parse(artifact.content);
          return (
            <div className="h-full flex flex-col">
              {!isEditing && renderToolbar()}
              <div className="flex-1 p-4 overflow-auto">
                <pre className="hljs bg-[#22272e] rounded-lg border border-gray-700 p-4 text-sm leading-relaxed overflow-x-auto max-h-full">
                  <code 
                    className="language-json"
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
                      fontSize: '0.875rem',
                      lineHeight: '1.5',
                      display: 'block',
                      whiteSpace: 'pre',
                    }}
                    dangerouslySetInnerHTML={{ 
                      __html: hljs.highlight(JSON.stringify(jsonData, null, 2), { language: 'json' }).value 
                    }}
                  />
                </pre>
              </div>
            </div>
          );
        } catch (error) {
          return renderError('Invalid JSON format');
        }
      
      case 'csv':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && renderToolbar()}
            <div className="flex-1">
              {renderCSVPreview(artifact.content)}
            </div>
          </div>
        );
      
      case 'mermaid':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && renderToolbar()}
            <div className="flex-1">
              {renderMermaidPreview(artifact.content)}
            </div>
          </div>
        );
      
      case 'react':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && renderToolbar()}
            <div className="flex-1 p-4 overflow-auto">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  <span className="text-sm font-medium">React Component Preview</span>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  React component preview is not yet implemented. Use code view to see the component source.
                </p>
                <pre className="hljs bg-[#22272e] rounded-lg border border-gray-700 p-2 text-xs overflow-auto max-h-32">
                  <code 
                    className="language-typescript"
                    dangerouslySetInnerHTML={{ 
                      __html: hljs.highlight(artifact.content.substring(0, 200) + '...', { language: 'typescript' }).value 
                    }}
                  />
                </pre>
              </Card>
            </div>
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
          <pre className="hljs bg-[#22272e] rounded-lg border border-gray-700 p-2 text-xs overflow-auto max-h-32">
            <code 
              className="language-mermaid"
              dangerouslySetInnerHTML={{ 
                __html: hljs.highlight(mermaidContent.substring(0, 200) + '...', { language: 'mermaid' }).value 
              }}
            />
          </pre>
        </Card>
      </div>
    );
  };

  if (viewMode === 'split') {
    return (
      <div className="h-full flex">
        <div className="w-1/2 border-r border-border min-h-0">
          {renderCodeView()}
        </div>
        <div className="w-1/2 min-h-0">
          {renderPreview()}
        </div>
      </div>
    );
  }

  if (viewMode === 'preview') {
    return (
      <div className="h-full min-h-0 overflow-hidden">
        {renderPreview()}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      {renderCodeView()}
    </div>
  );
}

// Simple markdown renderer (you might want to use react-markdown instead)
function ReactMarkdown({ children }: { children: string }) {
  const html = children
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^\* (.*$)/gim, '<li>$1</li>')
    .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/gim, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/gim, '<a href="$2">$1</a>')
    .replace(/\n/gim, '<br>');

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
