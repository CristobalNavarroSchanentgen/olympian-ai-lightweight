# MCP Implementation in Olympian AI Lightweight

## Overview

The Model Context Protocol (MCP) implementation in **subproject 3** (multi-host deployment) provides AI models with access to external tools and services through a standardized protocol. The system follows a **unified architecture** that manages server connections, tool discovery, and real-time tool execution during chat conversations.

## Core Architecture

### 1. Backend Components

#### **MCPManager** (`services/MCPManager.ts`)
- **Unified service** managing all MCP functionality
- **Server lifecycle**: Connects to MCP servers via stdio transport
- **Tool discovery**: Automatically discovers and caches available tools
- **Health monitoring**: Tracks server status with automatic reconnection
- **Default servers**: GitHub, NASA, AppleScript, Context7, Met Museum, Basic Memory

```typescript
// Pre-configured servers with environment-based authentication
const defaultServers = [
  {
    id: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_PERSONAL_ACCESS_TOKEN }
  }
  // ... other servers
];
```

#### **MCPStreamliner** (`services/MCPStreamliner.ts`)
- **Tool registry**: Maps tool names to server endpoints and schemas
- **Request processing**: Handles tool invocation with correlation tracking
- **Observability**: Structured logging with performance metrics
- **Error handling**: Graceful failure management for tool calls

#### **ToolEnabledOllamaStreamliner** (`services/ToolEnabledOllamaStreamliner.ts`)
- **Enhanced streamliner** for subproject 3 with MCP integration
- **Model capability detection**: Determines if models support tools
- **Tool injection**: Adds available tools to compatible model requests
- **Streaming integration**: Processes tool calls within response streams

#### **StreamlinerFactory** (`api/StreamlinerFactory.ts`)
- **Dynamic selection**: Chooses appropriate streamliner based on deployment mode
- **Environment-driven**: Uses `SUBPROJECT=3` and `MCP_ENABLED=true` flags
- **Backward compatibility**: Falls back to standard streamliner for subprojects 1 & 2

### 2. API Integration

#### **MCP Endpoints** (`api/mcp.ts`)
- `GET /api/mcp/status` - Service health and server statistics
- `GET /api/mcp/servers` - List all configured servers
- `GET /api/mcp/tools` - Available tools across all servers
- `POST /api/mcp/tools/call` - Execute specific tool with parameters

#### **Chat Integration** (`api/chat.ts`)
```typescript
// Factory-based streamliner selection
import { getStreamlinerInstance } from './StreamlinerFactory';
const streamliner = getStreamlinerInstance();
```

### 3. Frontend Components

#### **MCPConfigPanel** (`client/src/components/MCPConfigPanel/`)
- **Tabbed interface**: Configuration, Tools, Backups, Servers
- **Live status**: Real-time server health monitoring  
- **Tool management**: Override descriptions and enable/disable tools
- **Import/Export**: Backup and restore MCP configurations

## Tool Execution Flow

### 1. **Initialization Phase**
```
App Start → MCPManager.initialize() → Connect to default servers → Discover tools
```

### 2. **Chat Request Processing**
```
User Message → StreamlinerFactory → ToolEnabledOllamaStreamliner → 
Check model capabilities → Inject tools → Send to Ollama
```

### 3. **Tool Call Handling**
```
Model generates tool_calls → MCPStreamliner.processToolCall() → 
Route to appropriate server → Execute via stdio → Return results
```

### 4. **Response Streaming**
```
Tool results → Format for Ollama → Continue conversation → 
Stream final response to user
```

## Configuration

### Environment Variables
```bash
SUBPROJECT=3                    # Enable subproject 3
MCP_ENABLED=true               # Enable MCP functionality
DEPLOYMENT_MODE=docker-multi-host
GITHUB_PERSONAL_ACCESS_TOKEN=  # GitHub MCP server
NASA_API_KEY=                  # NASA MCP server
```

### Server Configuration
Each MCP server is configured with:
- **Transport**: stdio (standard input/output)
- **Command**: Executable path (npx, uv, uvx)
- **Arguments**: Server-specific arguments
- **Environment**: API keys and configuration
- **Optional**: Graceful degradation for missing dependencies

## Key Features

### **Unified Management**
- Single MCPManager handles all server lifecycle
- Consolidated tool registry across servers
- Centralized health monitoring and error handling

### **Dynamic Tool Integration**
- Automatic tool discovery from connected servers
- Model-specific tool injection based on capabilities
- Real-time tool execution during conversations

### **Development-Friendly**
- Comprehensive debug information and correlation IDs
- Performance tracking for tool calls
- WebSocket notifications for status updates

### **Production-Ready**
- Graceful failure handling for optional servers
- Connection timeouts and retry mechanisms
- Health checks with automatic reconnection

## Tool Categories

1. **Development**: GitHub integration, AppleScript automation
2. **Research**: NASA APIs, Met Museum collections
3. **Context**: Context7 documentation, Basic Memory
4. **Extensible**: Easy addition of new MCP servers

## Subproject 3 Specifics

The MCP implementation is **exclusive to subproject 3** (multi-host deployment):

- Uses Docker Compose for orchestration
- Environment-based feature flagging
- Separate streamliner architecture
- Enhanced error handling and monitoring
- Production-grade configuration management

This architecture provides a **scalable, maintainable** foundation for extending AI capabilities through standardized tool integration while maintaining backward compatibility with simpler deployment modes.
