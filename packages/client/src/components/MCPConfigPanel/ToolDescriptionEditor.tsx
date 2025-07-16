import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash, Edit2, Save, X } from 'lucide-react';

interface ToolDescriptionEditorProps {  overrides: Record<string, any>;
  availableTools?: any[];
  onChange: (overrides: Record<string, any>) => void;
}export function ToolDescriptionEditor({ overrides, availableTools = [], onChange }: ToolDescriptionEditorProps) {  const [editingTool, setEditingTool] = useState<string | null>(null);
  const [newTool, setNewTool] = useState({ name: '', description: '', examples: [''] });
  const [showNewForm, setShowNewForm] = useState(false);

  const handleSaveTool = (toolName: string, data: any) => {
    onChange({
      ...overrides,
      [toolName]: data,
    });
    setEditingTool(null);
  };

  const handleDeleteTool = (toolName: string) => {
    const newOverrides = { ...overrides };
    delete newOverrides[toolName];
    onChange(newOverrides);
  };

  const handleAddNewTool = () => {
    if (newTool.name) {
      handleSaveTool(newTool.name, {
        description: newTool.description,
        examples: newTool.examples.filter(e => e.trim()),
      });
      setNewTool({ name: '', description: '', examples: [''] });
      setShowNewForm(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Available Tools from MCP Servers */}
      {availableTools.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Available MCP Tools</CardTitle>
            <CardDescription>
              Tools discovered from running MCP servers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              {availableTools.map((tool, index) => (
                <div key={`${tool.serverId}-${tool.name}-${index}`} className="flex items-center justify-between p-2 border rounded">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{tool.serverId}</Badge>
                      <span className="font-medium">{tool.name}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{tool.description}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const toolKey = `${tool.serverId}.${tool.name}`;
                      if (!overrides[toolKey]) {
                        handleSaveTool(toolKey, {
                          description: tool.description,
                          examples: []
                        });
                      }
                    }}
                  >
                    {overrides[`${tool.serverId}.${tool.name}`] ? "Configured" : "Configure"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      {/* Add New Tool Button */}
      <div className="mb-4">
        <Button
          onClick={() => setShowNewForm(true)}
          disabled={showNewForm}
      {/* Add New Tool Button */}          disabled={showNewForm}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Tool Override
        </Button>
      </div>

      {/* New Tool Form */}
      {showNewForm && (
        <Card>
          <CardHeader>
            <CardTitle>New Tool Override</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="new-tool-name">Tool Name</Label>
              <Input
                id="new-tool-name"
                value={newTool.name}
                onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                placeholder="e.g., filesystem_read"
              />
            </div>
            <div>
              <Label htmlFor="new-tool-description">Description</Label>
              <Textarea
                id="new-tool-description"
                value={newTool.description}
                onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                placeholder="A clear description of what this tool does..."
                rows={3}
              />
            </div>
            <div>
              <Label>Examples</Label>
              {newTool.examples.map((example, index) => (
                <div key={index} className="flex gap-2 mt-2">
                  <Input
                    value={example}
                    onChange={(e) => {
                      const newExamples = [...newTool.examples];
                      newExamples[index] = e.target.value;
                      setNewTool({ ...newTool, examples: newExamples });
                    }}
                    placeholder="Example usage..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      const newExamples = newTool.examples.filter((_, i) => i !== index);
                      setNewTool({ ...newTool, examples: newExamples });
                    }}
                    disabled={newTool.examples.length === 1}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setNewTool({ ...newTool, examples: [...newTool.examples, ''] })}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Example
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleAddNewTool}>
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNewForm(false);
                  setNewTool({ name: '', description: '', examples: [''] });
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Existing Tool Overrides */}
      {Object.entries(overrides).map(([toolName, data]) => (
        <Card key={toolName}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{toolName}</CardTitle>
                {editingTool !== toolName && (
                  <CardDescription className="mt-1">
                    {data.description || 'No custom description'}
                  </CardDescription>
                )}
              </div>
              {editingTool !== toolName && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingTool(toolName)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteTool(toolName)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingTool === toolName ? (
              <ToolEditForm
                toolName={toolName}
                data={data}
                onSave={(newData) => handleSaveTool(toolName, newData)}
                onCancel={() => setEditingTool(null)}
              />
            ) : (
              <div className="space-y-2">
                {data.examples && data.examples.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Examples:</p>
                    <div className="space-y-1">
                      {data.examples.map((example: string, index: number) => (
                        <Badge key={index} variant="secondary" className="mr-2">
                          {example}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ToolEditForm({ 
  toolName, 
  data, 
  onSave, 
  onCancel 
}: { 
  toolName: string;
  data: any;
  onSave: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    description: data.description || '',
    examples: data.examples || [''],
  });

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor={`desc-${toolName}`}>Description</Label>
        <Textarea
          id={`desc-${toolName}`}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>
      <div>
        <Label>Examples</Label>
        {formData.examples.map((example: string, index: number) => (
          <div key={index} className="flex gap-2 mt-2">
            <Input
              value={example}
              onChange={(e) => {
                const newExamples = [...formData.examples];
                newExamples[index] = e.target.value;
                setFormData({ ...formData, examples: newExamples });
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                const newExamples = formData.examples.filter((_: any, i: number) => i !== index);
                setFormData({ ...formData, examples: newExamples });
              }}
              disabled={formData.examples.length === 1}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => setFormData({ ...formData, examples: [...formData.examples, ''] })}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Example
        </Button>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave(formData)}>
          <Save className="mr-2 h-4 w-4" />
          Save
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
