import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Loader2, Clock, Copy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';

interface ToolExecution {
  id: string;
  toolName: string;
  namespace: string;
  status: 'executing' | 'success' | 'error';
  result?: any;
  error?: string;
  timestamp: Date;
}

export function ToolExecutionFeedback() {
  const [executions, setExecutions] = useState<ToolExecution[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const handleExecuting = (event: CustomEvent) => {
      const { id, toolName, namespace } = event.detail;
      setExecutions(prev => [{
        id,
        toolName,
        namespace,
        status: 'executing',
        timestamp: new Date()
      }, ...prev].slice(0, 10));
    };

    const handleResult = (event: CustomEvent) => {
      const { id, result } = event.detail;
      setExecutions(prev => prev.map(e => 
        e.id === id ? { ...e, status: 'success', result } : e
      ));
    };

    const handleError = (event: CustomEvent) => {
      const { id, error } = event.detail;
      setExecutions(prev => prev.map(e => 
        e.id === id ? { ...e, status: 'error', error } : e
      ));
    };

    window.addEventListener('tool:executing', handleExecuting as EventListener);
    window.addEventListener('tool:result', handleResult as EventListener);
    window.addEventListener('tool:error', handleError as EventListener);

    return () => {
      window.removeEventListener('tool:executing', handleExecuting as EventListener);
      window.removeEventListener('tool:result', handleResult as EventListener);
      window.removeEventListener('tool:error', handleError as EventListener);
    };
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const latestExecution = executions[0];

  return (
    <>
      {latestExecution && (
        <div className={cn(
          "fixed bottom-4 right-4 p-4 rounded-lg shadow-lg max-w-md",
          latestExecution.status === 'executing' ? "bg-blue-900" :
          latestExecution.status === 'success' ? "bg-green-900" : "bg-red-900"
        )}>
          <div className="flex items-center gap-3">
            {latestExecution.status === 'executing' && (
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
            )}
            {latestExecution.status === 'success' && (
              <CheckCircle className="w-5 h-5 text-green-400" />
            )}
            {latestExecution.status === 'error' && (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-white">
                {latestExecution.namespace}.{latestExecution.toolName}
              </p>
              <p className="text-xs text-gray-300">
                {latestExecution.status === 'executing' ? 'Executing...' :
                 latestExecution.status === 'success' ? 'Completed' : 'Failed'}
              </p>
            </div>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-gray-400 hover:text-white"
            >
              <Clock className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed bottom-20 right-4 w-96 max-h-96 overflow-y-auto bg-gray-900 rounded-lg shadow-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Execution History</h3>
          <div className="space-y-2">
            {executions.map(exec => (
              <div key={exec.id} className="p-3 bg-gray-800 rounded">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    {exec.namespace}.{exec.toolName}
                  </span>
                  <span className={cn(
                    "text-xs",
                    exec.status === 'success' ? "text-green-400" :
                    exec.status === 'error' ? "text-red-400" : "text-blue-400"
                  )}>
                    {exec.status}
                  </span>
                </div>
                {exec.result && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(JSON.stringify(exec.result))}
                    className="mt-2"
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Copy Result
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
