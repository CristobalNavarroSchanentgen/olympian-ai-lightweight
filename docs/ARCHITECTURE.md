# Architecture Overview

## System Architecture

Olympian AI Lightweight follows a modern client-server architecture with real-time communication capabilities.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│  React Client   │────▶│  Express Server │────▶│    MongoDB      │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                        │                        
        │                        │                        
        ▼                        ▼                        
┌─────────────────┐     ┌─────────────────┐              
│                 │     │                 │              
│  WebSocket.io   │     │  Ollama API    │              
│                 │     │                 │              
└─────────────────┘     └─────────────────┘              
```

## Core Components

### Frontend (React + TypeScript)

#### Components Structure
- **ConnectionsPanel**: Manages Ollama, MCP, and database connections
  - Auto-discovery scanner
  - Manual connection forms
  - Connection status monitoring
  
- **MCPConfigPanel**: Configuration management for MCP
  - JSON editor with syntax highlighting
  - Tool description customization
  - Backup/restore functionality
  
- **DivineDialog**: Advanced chat interface
  - Real-time message streaming
  - Image upload support
  - Model state indicators
  - Conversation history

#### State Management
- **Zustand** for global state
- Separate stores for:
  - Connections
  - Chat/Conversations
  - WebSocket state

#### Real-time Communication
- Socket.io client for WebSocket connections
- Event-based messaging system
- Automatic reconnection handling

### Backend (Node.js + Express)

#### Service Layer

1. **DatabaseService** (Singleton)
   - MongoDB connection management
   - Collection access methods
   - Schema enforcement
   - Index management

2. **ConnectionScanner**
   - Port scanning for Ollama
   - Docker container detection
   - MCP config file discovery
   - MongoDB instance detection

3. **OllamaStreamliner**
   - Model capability detection
   - Request formatting based on model type
   - Stream processing
   - Error handling for unsupported features

4. **MCPClient**
   - MCP server lifecycle management
   - Tool discovery and invocation
   - Configuration persistence

5. **WebSocketService**
   - Real-time event handling
   - Chat message streaming
   - Connection status updates
   - Scan progress notifications

#### API Routes

- `/api/connections` - Connection CRUD operations
- `/api/mcp` - MCP server management
- `/api/chat` - Conversation and message handling
- `/api/config` - Configuration management

### Database (MongoDB)

#### Collections

1. **conversations**
   - Stores chat conversations
   - Indexes: createdAt, updatedAt

2. **messages**
   - Individual chat messages
   - Full-text search index on content
   - Compound index on conversationId + createdAt

3. **connections**
   - Ollama, MCP, and database connections
   - Indexes: type, status

4. **config**
   - Key-value configuration storage
   - Index on key field

## Data Flow

### Chat Message Flow
1. User sends message via React UI
2. WebSocket emits 'chat:message' event
3. Server processes request through OllamaStreamliner
4. Ollama API streams response tokens
5. Server emits tokens back via WebSocket
6. React UI displays streaming response
7. Complete message saved to MongoDB

### Connection Discovery Flow
1. User initiates scan from UI
2. Server starts ConnectionScanner
3. Scanner checks ports, Docker, file system
4. Progress events emitted via WebSocket
5. Results saved to MongoDB
6. UI updates with discovered connections

## Security Considerations

- Rate limiting on all API endpoints
- Input validation with Zod schemas
- CORS configuration
- Helmet.js for security headers
- Environment variable management
- No localStorage for sensitive data

## Performance Optimizations

- Connection pooling for MongoDB
- Indexed database queries
- Streaming responses for chat
- Lazy loading of components
- WebSocket for real-time updates
- Efficient re-renders with React hooks

## Scalability

- Stateless server design
- Database connection pooling
- Modular service architecture
- Separate concerns between packages
- TypeScript for type safety across packages