# MCP (Model Context Protocol) Architecture

## Overview

The MCP architecture in Olympian AI Lightweight has been dramatically simplified from a complex multi-service system to a unified architecture spanning both backend and frontend. This document describes the complete MCP architecture, its evolution, and implementation details.

## Architecture Evolution

### Phase 1: Backend Rationalization (Completed)

#### Before (Complex Multi-Service)
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   MCPService    │────▶│  MCPClientStdio  │────▶│ MCPHealthChecker│
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                          │
         ▼                       ▼                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ MCPConfigParser │────▶│   MCPToolCache   │────▶│MCPToolIntegration│
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                          │
         ▼                       ▼                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  MCPClient      │────▶│ToolIntegration   │────▶│   Complex Flow  │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

#### After (Unified Backend Service)
```
┌─────────────────────────────────────────┐
│            MCPManager                   │
│  ┌─────────────────────────────────┐   │
│  │ • Server Management             │   │
│  │ • Tool Discovery & Caching      │   │
│  │ • Health Monitoring             │   │
│  │ • WebSocket Notifications       │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │  stdio processes │
         │  (npx servers)   │
         └──────────────────┘
```

### Phase 2: Frontend Rationalization (Completed)

#### Before (Scattered Implementation)
```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ ServerManager   │     │ToolDescription   │     │  ChatWindow     │
│  - fetchServers │     │   Editor         │     │  - mcpTools     │
│  - api calls    │     │  - toolOverrides │     │  - toolCalls    │
│  - local state  │     │  - api calls     │     │  - api calls    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
         │                       │                          │
         ▼                       ▼                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Duplicate     │     │   Scattered      │     │   Complex       │
│     Logic       │     │     State        │     │  Integration    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

#### After (Unified Frontend Architecture)
```
┌─────────────────────────────────────────┐
│            useMCP Hook                  │
│  ┌─────────────────────────────────┐   │
│  │ • Unified State Management      │   │
│  │ • WebSocket Integration         │   │
│  │ • API Abstraction               │   │
│  │ • Real-time Updates             │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                    │
         ┌──────────┴───────────┐
         ▼                      ▼
┌─────────────────┐    ┌─────────────────┐
│  Components     │    │   API Service   │
│ • ServerManager │    │ • Type Safety   │
│ • ToolsDisplay  │    │ • Error Handle  │
│ • ConfigPanel   │    │ • Streaming     │
└─────────────────┘    └─────────────────┘
```

## Complete Architecture Overview

### Full System Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (React)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    useMCP Hook                           │   │
│  │  • State: servers, tools, loading, error                │   │
│  │  • Actions: start/stop, add/remove, invoke              │   │
│  │  • WebSocket: real-time updates                         │   │
│  │  • Polling: fallback mechanism                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────┬────────────┴───────────┬────────────────┐   │
│  │ ServerManager│    MCPToolsDisplay     │  ConfigPanel   │   │
│  └──────────────┴────────────────────────┴────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                    ┌───────────┴────────────┐
                    │   HTTP + WebSocket     │
                    └───────────┬────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                        Backend (Node.js)                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    MCPManager                            │   │
│  │  • Server lifecycle management                           │   │
│  │  • Tool discovery and caching                           │   │
│  │  • Health monitoring with retries                       │   │
│  │  • WebSocket event broadcasting                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│  ┌──────────────┬────────────┴───────────┬────────────────┐   │
│  │  API Routes  │  WebSocket Handlers    │  Streamliner   │   │
│  └──────────────┴────────────────────────┴────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### Backend Components

#### 1. MCPManager (`packages/server/src/services/MCPManager.ts`)
The unified backend service handling all MCP operations:

```typescript
class MCPManager extends EventEmitter {
  // Singleton pattern
  private static instance: MCPManager;
  
  // Core functionality
  async initialize(): Promise<void>
  async addServer(config: MCPServer): Promise<void>
  async removeServer(serverId: string): Promise<void>
  async listTools(): Promise<MCPTool[]>
  async callTool(serverId: string, toolName: string, args: any): Promise<any>
  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse>
  getServers(): MCPServer[]
  getStats(): { total: number; running: number; error: number }
  async cleanup(): Promise<void>
}
```

#### 2. MCP Routes (`packages/server/src/routes/mcpRoutes.ts`)
RESTful API endpoints for MCP operations:
- `GET /api/mcp/status` - System status
- `GET /api/mcp/health` - Health check
- `GET /api/mcp/servers` - List servers
- `POST /api/mcp/servers` - Add server
- `DELETE /api/mcp/servers/:id` - Remove server
- `GET /api/mcp/tools` - List all tools
- `POST /api/mcp/invoke` - Invoke tool

#### 3. ToolEnabledOllamaStreamliner (`packages/server/src/services/streamliners/ToolEnabledOllamaStreamliner.ts`)
Integrates MCP tools with AI model streaming responses.

### Frontend Components

#### 1. useMCP Hook (`packages/client/src/hooks/useMCP.ts`)
The unified frontend hook providing all MCP functionality:

```typescript
interface MCPState {
  servers: MCPServer[];
  tools: Map<string, MCPTool[]>;
  loading: boolean;
  error: string | null;
}

function useMCP() {
  // State management
  const [state, setState] = useState<MCPState>({...});
  
  // Server operations
  const startServer = async (id: string) => void;
  const stopServer = async (id: string) => void;
  const addServer = async (server: Omit<MCPServer, 'id' | 'status'>) => void;
  const removeServer = async (id: string) => void;
  
  // Tool operations
  const invokeTool = async (serverId: string, toolName: string, args: any) => any;
  const getAllTools = () => Array<MCPTool & { serverId: string; serverName: string }>;
  
  // WebSocket integration for real-time updates
  // Automatic polling fallback
  
  return { servers, tools, loading, error, ...operations };
}
```

#### 2. MCPToolsDisplay (`packages/client/src/components/MCPToolsDisplay.tsx`)
Minimal component for displaying available MCP tools:
- Shows all tools across servers
- Click to select/invoke tools
- Real-time updates via hook

#### 3. ServerManager (`packages/client/src/components/MCPConfigPanel/ServerManager.tsx`)
Simplified server management UI:
- Uses `useMCP` hook for all operations
- No duplicate API calls or state
- Real-time status updates

#### 4. Export Barrel (`packages/client/src/mcp.ts`)
Centralized exports for easy imports:
```typescript
export { useMCP } from './hooks/useMCP';
export { MCPToolsDisplay } from './components/MCPToolsDisplay';
export { MCPConfigPanel } from './components/MCPConfigPanel';
export type { MCPServer, MCPTool, ... } from '@olympian/shared';
```

## Key Features

### 1. Unified State Management
- Single source of truth in `useMCP` hook
- No scattered state across components
- Automatic synchronization via WebSocket

### 2. Real-time Updates
- WebSocket events for server status changes
- Tool discovery updates
- Fallback polling mechanism

### 3. Type Safety
- Full TypeScript coverage
- Shared types between frontend/backend
- Type-safe API calls

### 4. Error Handling
- Graceful degradation
- User-friendly error messages
- Automatic retry logic

### 5. Performance Optimizations
- In-memory tool caching
- Minimal re-renders
- Efficient WebSocket usage

## Integration Patterns

### Using MCP in Components

```typescript
import { useMCP } from '@/hooks/useMCP';

function MyComponent() {
  const { servers, tools, loading, startServer, invokeTool } = useMCP();
  
  // All MCP functionality available through the hook
  const handleToolClick = async (serverId: string, toolName: string) => {
    const result = await invokeTool(serverId, toolName, { /* args */ });
    console.log('Tool result:', result);
  };
  
  return (
    <div>
      {/* Component UI */}
    </div>
  );
}
```

### WebSocket Events

The system uses WebSocket for real-time updates:

```typescript
// Server events (backend → frontend)
interface ServerEvents {
  'mcp:server:update': { serverId: string; /* ... */ };
  'mcp:server:status': { serverId: string; status: string; error?: string };
  'mcp:tools:update': { serverId: string; tools?: MCPTool[] };
}

// Client events (frontend → backend)
interface ClientEvents {
  'mcp:subscribe': { serverId?: string };
  'mcp:unsubscribe': { serverId?: string };
}
```

## Benefits of Rationalized Architecture

### Backend Benefits
1. **Simplicity**: Single service vs 9+ services (~400 lines vs ~4000)
2. **Reliability**: Built-in retry logic and health monitoring
3. **Performance**: In-memory caching and reduced overhead
4. **Maintainability**: Single file, clear responsibilities

### Frontend Benefits
1. **Code Reduction**: ~60% less code through hook reuse
2. **Consistency**: All components use same patterns
3. **Real-time**: WebSocket integration built-in
4. **Developer Experience**: Simple `useMCP()` API

### System-wide Benefits
1. **Type Safety**: End-to-end TypeScript
2. **Testability**: Isolated, mockable components
3. **Scalability**: Easy to add new MCP servers/tools
4. **Debugging**: Clear data flow and error tracking

## Migration Guide

### Backend Migration
```typescript
// Old
import { MCPService } from './services/MCPService';
import { MCPClient } from './services/MCPClient';
const mcpService = new MCPService();
const mcpClient = new MCPClient();

// New
import { MCPManager } from './services/MCPManager';
const mcpManager = MCPManager.getInstance();
```

### Frontend Migration
```typescript
// Old - Direct API calls in components
const [servers, setServers] = useState([]);
const fetchServers = async () => {
  const data = await api.getMCPServers();
  setServers(data);
};

// New - Use the hook
const { servers, refresh } = useMCP();
```

## Best Practices

### 1. Always Use the Hook
- Don't make direct API calls for MCP operations
- Let the hook manage state and updates
- Leverage built-in error handling

### 2. Handle Loading States
```typescript
const { loading, error, servers } = useMCP();

if (loading) return <Spinner />;
if (error) return <Error message={error} />;
```

### 3. Optimize Re-renders
- Use `getAllTools()` sparingly
- Memoize tool lists if needed
- Leverage React.memo for components

### 4. Error Boundaries
- Wrap MCP components in error boundaries
- Provide fallback UI for failures
- Log errors for debugging

## Troubleshooting

### Common Issues

1. **Tools not appearing**
   - Check server status in `useMCP`
   - Verify WebSocket connection
   - Check backend logs

2. **Real-time updates not working**
   - Verify WebSocket connection
   - Check for proxy configuration
   - Fallback polling should still work

3. **Performance issues**
   - Check for excessive `getAllTools()` calls
   - Verify memoization is working
   - Monitor WebSocket traffic

## Future Enhancements

1. **Optimistic Updates**: Update UI before server confirms
2. **Offline Support**: Queue operations when offline
3. **Tool Favorites**: User-specific tool preferences
4. **Advanced Filtering**: Search/filter tools by capability
5. **Batch Operations**: Execute multiple tools in sequence

## Conclusion

The rationalized MCP architecture represents a significant improvement in both backend and frontend implementations. By consolidating logic into unified services and hooks, we've achieved:

- **60% code reduction** overall
- **Improved reliability** through centralized error handling
- **Better developer experience** with simple APIs
- **Enhanced performance** through caching and optimizations
- **Easier maintenance** with clear separation of concerns

The architecture is now more accessible to developers, easier to test, and simpler to extend with new capabilities.
