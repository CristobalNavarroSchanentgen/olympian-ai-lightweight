import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';

export function ScanProgress() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Spinner size="sm" />
          Scanning for connections...
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Ollama</span>
              <span>Checking ports...</span>
            </div>
            <Progress value={33} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>MCP Servers</span>
              <span>Scanning config paths...</span>
            </div>
            <Progress value={66} />
          </div>
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>MongoDB</span>
              <span>Testing connections...</span>
            </div>
            <Progress value={90} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}