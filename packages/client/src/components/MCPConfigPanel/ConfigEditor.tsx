import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from '@/components/ThemeProvider';

interface ConfigEditorProps {
  value: any;
  onChange: (value: any) => void;
}

export function ConfigEditor({ value, onChange }: ConfigEditorProps) {
  const { theme } = useTheme();

  const handleChange = (val: string) => {
    try {
      const parsed = JSON.parse(val);
      onChange(parsed);
    } catch (error) {
      // Invalid JSON, don't update
      console.error('Invalid JSON:', error);
    }
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <CodeMirror
        value={JSON.stringify(value, null, 2)}
        height="400px"
        theme={theme === 'dark' ? oneDark : undefined}
        extensions={[json()]}
        onChange={handleChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          rectangularSelection: true,
          highlightSelectionMatches: true,
          searchKeymap: true,
          defaultKeymap: true,
        }}
      />
    </div>
  );
}