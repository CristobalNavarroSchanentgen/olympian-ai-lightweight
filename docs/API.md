# API Documentation

## Base URL

```
http://localhost:4000/api
```

## Authentication

Currently, the API does not require authentication. This may change in future versions.

## Endpoints

### Connections

#### GET /connections
Get all connections

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "type": "ollama",
      "name": "Local Ollama",
      "endpoint": "http://localhost:11434",
      "status": "online",
      "metadata": {},
      "isManual": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /connections
Create a new connection

**Request Body:**
```json
{
  "type": "ollama",
  "name": "My Ollama",
  "endpoint": "http://localhost:11434",
  "authentication": {
    "type": "none"
  }
}
```

#### PUT /connections/:id
Update a connection

#### DELETE /connections/:id
Delete a connection

#### POST /connections/:id/test
Test a connection

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Connection successful",
    "latency": 45
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### POST /connections/scan
Scan for connections

**Request Body:**
```json
{
  "types": ["ollama", "mcp", "database"]
}
```

### MCP Servers

#### GET /mcp/servers
Get all MCP servers

#### POST /mcp/servers
Add MCP server

**Request Body:**
```json
{
  "name": "File System",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],
  "transport": "stdio"
}
```

#### DELETE /mcp/servers/:id
Remove MCP server

#### POST /mcp/servers/:id/start
Start MCP server

#### POST /mcp/servers/:id/stop
Stop MCP server

#### GET /mcp/servers/:id/tools
List tools for a server

#### POST /mcp/invoke
Invoke MCP tool

**Request Body:**
```json
{
  "serverId": "mcp_123",
  "toolName": "read_file",
  "arguments": {
    "path": "/example.txt"
  }
}
```

### Chat

#### GET /chat/conversations
Get conversations

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 20)

#### GET /chat/conversations/:id
Get conversation by ID

#### GET /chat/conversations/:id/messages
Get messages for a conversation

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50)

#### DELETE /chat/conversations/:id
Delete conversation

#### GET /chat/search
Search messages

**Query Parameters:**
- `q` - Search query (required)
- `page` (default: 1)
- `limit` (default: 20)

#### GET /chat/models
Get available models

#### GET /chat/models/:name/capabilities
Get model capabilities

### Configuration

#### GET /config/mcp
Get MCP configuration

#### PUT /config/mcp
Update MCP configuration

#### GET /config/tool-overrides
Get tool overrides

#### PUT /config/tool-overrides
Update tool overrides

#### GET /config/backups
List configuration backups

#### POST /config/backups/:filename/restore
Restore from backup

## WebSocket Events

### Client → Server

#### chat:message
Send a chat message
```javascript
{
  "content": "Hello, how are you?",
  "images": ["base64..."],
  "model": "llama3",
  "conversationId": "507f1f77bcf86cd799439011"
}
```

#### chat:cancel
Cancel message generation
```javascript
{
  "messageId": "msg_123"
}
```

#### model:select
Select a model
```javascript
{
  "model": "llama3"
}
```

#### scan:start
Start connection scan
```javascript
{
  "types": ["ollama", "mcp", "database"]
}
```

### Server → Client

#### chat:thinking
Model is thinking
```javascript
{
  "messageId": "msg_123"
}
```

#### chat:generating
Model is generating
```javascript
{
  "messageId": "msg_123",
  "progress": 0.5
}
```

#### chat:token
Streamed token
```javascript
{
  "messageId": "msg_123",
  "token": "Hello"
}
```

#### chat:complete
Message complete
```javascript
{
  "messageId": "msg_123",
  "metadata": {
    "tokens": 150,
    "generationTime": 2500,
    "model": "llama3"
  }
}
```

#### scan:progress
Scan progress update
```javascript
{
  "type": "ollama",
  "current": 3,
  "total": 9,
  "message": "Checking port 11436..."
}
```

## Error Responses

All endpoints may return error responses in the following format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": {}
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Error Codes

- `INTERNAL_ERROR` - Server error
- `VALIDATION_ERROR` - Invalid request data
- `NOT_FOUND` - Resource not found
- `MODEL_CAPABILITY_ERROR` - Model doesn't support requested feature
- `CONNECTION_ERROR` - Failed to connect to service