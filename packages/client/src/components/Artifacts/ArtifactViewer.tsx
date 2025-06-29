import { useState, useEffect, useRef } from 'react';
import { Artifact } from '@olympian/shared';
import { useArtifactStore } from '@/stores/useArtifactStore';
import { ArtifactHeader } from './ArtifactHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  AlertCircle, 
  Save, 
  X
} from 'lucide-react';
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

export function ArtifactViewer({ artifact }: ArtifactViewerProps) {
  const { viewMode, updateArtifact } = useArtifactStore();
  const [editContent, setEditContent] = useState(artifact.content);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const codeRef = useRef<HTMLElement>(null);

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

  const renderEditModeActions = () => {
    if (!isEditing) return null;
    
    return (
      <div className="flex items-center gap-1 p-2 border-b bg-muted/50">
        <div className="flex-1" />
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
      </div>
    );
  };

  const renderCodeView = () => (
    <div className="h-full flex flex-col">
      <ArtifactHeader artifact={artifact} />
      {renderEditModeActions()}
      
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
            {!isEditing && <ArtifactHeader artifact={artifact} />}
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
            {!isEditing && <ArtifactHeader artifact={artifact} />}
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
            {!isEditing && <ArtifactHeader artifact={artifact} />}
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
              {!isEditing && <ArtifactHeader artifact={artifact} />}
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
            {!isEditing && <ArtifactHeader artifact={artifact} />}
            <div className="flex-1">
              {renderCSVPreview(artifact.content)}
            </div>
          </div>
        );
      
      case 'mermaid':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && <ArtifactHeader artifact={artifact} />}
            <div className="flex-1">
              {renderMermaidPreview(artifact.content)}
            </div>
          </div>
        );
      
      case 'react':
        return (
          <div className="h-full flex flex-col">
            {!isEditing && <ArtifactHeader artifact={artifact} />}
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
    <div className="h-full flex flex-col">
      <ArtifactHeader artifact={artifact} />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="p-6 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <h3 className="font-medium mb-1">Preview Error</h3>
          <p className="text-sm text-muted-foreground">{message}</p>
        </Card>
      </div>
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
      <div className="h-full flex flex-col">
        <ArtifactHeader artifact={artifact} />
        {renderEditModeActions()}
        <div className="flex-1 flex">
          <div className="w-1/2 border-r border-border min-h-0">
            <div className="h-full flex flex-col">
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
          </div>
          <div className="w-1/2 min-h-0">
            {/* Preview without header in split mode */}
            {artifact.type === 'html' && (
              <div className="h-full overflow-hidden">
                <iframe
                  srcDoc={artifact.content}
                  className="w-full h-full border-0"
                  sandbox="allow-scripts allow-same-origin"
                  title={artifact.title}
                />
              </div>
            )}
            {artifact.type === 'svg' && (
              <div className="h-full p-4 overflow-auto bg-white dark:bg-gray-900">
                <div 
                  className="flex items-center justify-center min-h-full"
                  dangerouslySetInnerHTML={{ __html: artifact.content }}
                />
              </div>
            )}
            {/* Add other preview types as needed */}
          </div>
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
