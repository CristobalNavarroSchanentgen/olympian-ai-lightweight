import { useState, useRef, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Import common languages for the light build
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import php from 'react-syntax-highlighter/dist/esm/languages/prism/php';
import ruby from 'react-syntax-highlighter/dist/esm/languages/prism/ruby';
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import scala from 'react-syntax-highlighter/dist/esm/languages/prism/scala';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import shell from 'react-syntax-highlighter/dist/esm/languages/prism/shell-session';
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import xml from 'react-syntax-highlighter/dist/esm/languages/prism/xml-doc';
import html from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
import nginx from 'react-syntax-highlighter/dist/esm/languages/prism/nginx';
import git from 'react-syntax-highlighter/dist/esm/languages/prism/git';

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  language?: string;
  showLineNumbers?: boolean;
}

// Keep track of registered languages for validation
const registeredLanguages = new Set<string>();

// Register languages once when the module loads
let languagesRegistered = false;

const registerLanguages = () => {
  if (languagesRegistered) return;
  
  // Register all common languages for multi-host deployment
  SyntaxHighlighter.registerLanguage('javascript', javascript);
  SyntaxHighlighter.registerLanguage('js', javascript);
  SyntaxHighlighter.registerLanguage('typescript', typescript);
  SyntaxHighlighter.registerLanguage('ts', typescript);
  SyntaxHighlighter.registerLanguage('jsx', jsx);
  SyntaxHighlighter.registerLanguage('tsx', tsx);
  SyntaxHighlighter.registerLanguage('python', python);
  SyntaxHighlighter.registerLanguage('py', python);
  SyntaxHighlighter.registerLanguage('java', java);
  SyntaxHighlighter.registerLanguage('csharp', csharp);
  SyntaxHighlighter.registerLanguage('cs', csharp);
  SyntaxHighlighter.registerLanguage('c#', csharp);
  SyntaxHighlighter.registerLanguage('cpp', cpp);
  SyntaxHighlighter.registerLanguage('c++', cpp);
  SyntaxHighlighter.registerLanguage('c', c);
  SyntaxHighlighter.registerLanguage('go', go);
  SyntaxHighlighter.registerLanguage('golang', go);
  SyntaxHighlighter.registerLanguage('rust', rust);
  SyntaxHighlighter.registerLanguage('rs', rust);
  SyntaxHighlighter.registerLanguage('php', php);
  SyntaxHighlighter.registerLanguage('ruby', ruby);
  SyntaxHighlighter.registerLanguage('rb', ruby);
  SyntaxHighlighter.registerLanguage('swift', swift);
  SyntaxHighlighter.registerLanguage('kotlin', kotlin);
  SyntaxHighlighter.registerLanguage('kt', kotlin);
  SyntaxHighlighter.registerLanguage('scala', scala);
  SyntaxHighlighter.registerLanguage('bash', bash);
  SyntaxHighlighter.registerLanguage('sh', bash);
  SyntaxHighlighter.registerLanguage('shell', shell);
  SyntaxHighlighter.registerLanguage('powershell', powershell);
  SyntaxHighlighter.registerLanguage('ps1', powershell);
  SyntaxHighlighter.registerLanguage('sql', sql);
  SyntaxHighlighter.registerLanguage('json', json);
  SyntaxHighlighter.registerLanguage('yaml', yaml);
  SyntaxHighlighter.registerLanguage('yml', yaml);
  SyntaxHighlighter.registerLanguage('xml', xml);
  SyntaxHighlighter.registerLanguage('html', html);
  SyntaxHighlighter.registerLanguage('markup', html);
  SyntaxHighlighter.registerLanguage('css', css);
  SyntaxHighlighter.registerLanguage('scss', scss);
  SyntaxHighlighter.registerLanguage('sass', scss);
  SyntaxHighlighter.registerLanguage('markdown', markdown);
  SyntaxHighlighter.registerLanguage('md', markdown);
  SyntaxHighlighter.registerLanguage('docker', docker);
  SyntaxHighlighter.registerLanguage('dockerfile', docker);
  SyntaxHighlighter.registerLanguage('nginx', nginx);
  SyntaxHighlighter.registerLanguage('git', git);
  
  // Keep track of registered languages
  registeredLanguages.add('javascript');
  registeredLanguages.add('js');
  registeredLanguages.add('typescript');
  registeredLanguages.add('ts');
  registeredLanguages.add('jsx');
  registeredLanguages.add('tsx');
  registeredLanguages.add('python');
  registeredLanguages.add('py');
  registeredLanguages.add('java');
  registeredLanguages.add('csharp');
  registeredLanguages.add('cs');
  registeredLanguages.add('c#');
  registeredLanguages.add('cpp');
  registeredLanguages.add('c++');
  registeredLanguages.add('c');
  registeredLanguages.add('go');
  registeredLanguages.add('golang');
  registeredLanguages.add('rust');
  registeredLanguages.add('rs');
  registeredLanguages.add('php');
  registeredLanguages.add('ruby');
  registeredLanguages.add('rb');
  registeredLanguages.add('swift');
  registeredLanguages.add('kotlin');
  registeredLanguages.add('kt');
  registeredLanguages.add('scala');
  registeredLanguages.add('bash');
  registeredLanguages.add('sh');
  registeredLanguages.add('shell');
  registeredLanguages.add('powershell');
  registeredLanguages.add('ps1');
  registeredLanguages.add('sql');
  registeredLanguages.add('json');
  registeredLanguages.add('yaml');
  registeredLanguages.add('yml');
  registeredLanguages.add('xml');
  registeredLanguages.add('html');
  registeredLanguages.add('markup');
  registeredLanguages.add('css');
  registeredLanguages.add('scss');
  registeredLanguages.add('sass');
  registeredLanguages.add('markdown');
  registeredLanguages.add('md');
  registeredLanguages.add('docker');
  registeredLanguages.add('dockerfile');
  registeredLanguages.add('nginx');
  registeredLanguages.add('git');
  
  languagesRegistered = true;
};

// Extract language from className (e.g., "language-javascript" -> "javascript")
const extractLanguage = (className?: string): string => {
  if (!className) return 'text';
  const match = className.match(/language-([\w-]+)/);
  return match ? match[1].toLowerCase() : 'text';
};

// Get the text content from children
const getTextContent = (children: React.ReactNode): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) {
    return children.map(child => getTextContent(child)).join('');
  }
  if (children && typeof children === 'object' && 'props' in children) {
    return getTextContent((children as any).props.children);
  }
  return String(children || '');
};

// Language mapping for common aliases and better detection
const normalizeLanguage = (lang: string): string => {
  const langMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'cs': 'csharp',
    'c#': 'csharp',
    'c++': 'cpp',
    'golang': 'go',
    'rs': 'rust',
    'kt': 'kotlin',
    'sh': 'bash',
    'ps1': 'powershell',
    'yml': 'yaml',
    'md': 'markdown',
    'dockerfile': 'docker',
    'markup': 'html',
    'sass': 'scss'
  };
  
  return langMap[lang.toLowerCase()] || lang.toLowerCase();
};

export function CodeBlock({ 
  children, 
  className, 
  language, 
  showLineNumbers = false 
}: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const codeRef = useRef<HTMLElement>(null);
  
  // Register languages on component mount
  useEffect(() => {
    registerLanguages();
  }, []);
  
  // Extract and normalize language
  const detectedLanguage = language || extractLanguage(className);
  const normalizedLanguage = normalizeLanguage(detectedLanguage);
  const codeContent = getTextContent(children);

  const copyToClipboard = async () => {
    const textContent = codeRef.current?.textContent || codeContent;
    
    try {
      await navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers or insecure contexts
      const textArea = document.createElement('textarea');
      textArea.value = textContent;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (execErr) {
        console.error('Fallback copy failed: ', execErr);
      }
      
      document.body.removeChild(textArea);
    }
  };

  // Check if language is supported using our registered languages set
  const isLanguageSupported = registeredLanguages.has(normalizedLanguage);
  const finalLanguage = isLanguageSupported ? normalizedLanguage : 'text';

  return (
    <div className="relative group not-prose">
      <div className="syntax-highlighter-wrapper">
        <SyntaxHighlighter
          language={finalLanguage}
          style={atomDark}
          PreTag={({ children, ...props }) => (
            <pre {...props} ref={codeRef} className="!m-0">
              {children}
            </pre>
          )}
          showLineNumbers={showLineNumbers}
          wrapLines={true}
          customStyle={{
            margin: '0.5rem 0',
            border: '1px solid #3c3836',
            borderRadius: '0.5rem',
            padding: '1rem',
            fontSize: '0.875rem',
            lineHeight: '1.5',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          }}
          lineNumberStyle={{
            color: '#928374',
            paddingRight: '1em',
            textAlign: 'right',
            userSelect: 'none',
            fontSize: '0.75rem'
          }}
          codeTagProps={{
            style: {
              fontFamily: 'inherit',
              fontSize: 'inherit',
              color: 'inherit', // Ensure color inheritance
            }
          }}
        >
          {codeContent}
        </SyntaxHighlighter>
      </div>
      
      {/* Copy button with improved styling for multi-host deployment */}
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-all duration-200",
          "bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white",
          "border border-gray-600/50 hover:border-gray-500",
          "backdrop-blur-sm",
          isCopied && "opacity-100 bg-green-800/80 text-green-300"
        )}
        onClick={copyToClipboard}
        aria-label={isCopied ? "Copied!" : "Copy code"}
        title={isCopied ? "Copied!" : "Copy code"}
      >
        {isCopied ? (
          <Check className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>

      {/* Language indicator for multi-host deployment */}
      {detectedLanguage !== 'text' && (
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <span className="text-xs px-2 py-1 bg-gray-800/80 text-gray-300 rounded border border-gray-600/50 backdrop-blur-sm font-mono">
            {detectedLanguage}
          </span>
        </div>
      )}
      
      <style jsx>{`
        .syntax-highlighter-wrapper :global(pre),
        .syntax-highlighter-wrapper :global(code) {
          color: inherit !important;
        }
        .syntax-highlighter-wrapper :global(span) {
          color: inherit !important;
        }
      `}</style>
    </div>
  );
}
