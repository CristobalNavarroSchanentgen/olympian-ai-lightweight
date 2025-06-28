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
Get messages for a conversation (Enhanced with artifacts)

**Query Parameters:**
- `page` (default: 1)
- `limit` (default: 50)

**Response:**
```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "_id": "msg_123",
        "role": "assistant",
        "content": "Here's your code: [Created Python Script artifact]",
        "metadata": {
          "artifacts": [
            {
              "artifactId": "artifact_456",
              "artifactType": "code",
              "title": "Python Script",
              "order": 0
            }
          ],
          "artifactCount": 1,
          "hasArtifact": true
        }
      }
    ],
    "artifacts": [
      {
        "id": "artifact_456",
        "title": "Python Script",
        "type": "code",
        "content": "print('Hello World')"
      }
    ]
  }
}
```

#### POST /chat/send
Send a chat message (Enhanced with multi-artifact support)

**Request Body:**
```json
{
  "message": "Create a Python script and HTML page",
  "conversationId": "conv_123",
  "model": "llama3",
  "visionModel": "llava",
  "images": ["base64..."]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conversation": {...},
    "conversationId": "conv_123",
    "message": "Created scripts: [Created Python Script artifact] and [Created HTML Document artifact]",
    "metadata": {
      "artifacts": [
        {
          "artifactId": "artifact_456",
          "artifactType": "code",
          "title": "Python Script",
          "order": 0
        },
        {
          "artifactId": "artifact_789",
          "artifactType": "html",
          "title": "HTML Document",
          "order": 1
        }
      ],
      "artifactCount": 2,
      "hasArtifact": true
    },
    "artifacts": [
      {
        "artifactId": "artifact_456",
        "artifactType": "code"
      },
      {
        "artifactId": "artifact_789",
        "artifactType": "html"
      }
    ],
    "artifactCount": 2
  }
}
```

#### POST /chat/stream
Stream a chat message (Enhanced with artifact creation notifications)

**Request Body:**
```json
{
  "message": "Create multiple scripts",
  "conversationId": "conv_123",
  "model": "llama3"
}
```

**Server-Sent Events:**
```javascript
// Connection established
data: {"type": "connected"}

// Conversation info
data: {"type": "conversation", "conversation": {...}}

// Streaming tokens
data: {"type": "token", "token": "Here", "content": "Here"}
data: {"type": "token", "token": " are", "content": "Here are"}

// Artifact creation notifications
data: {"type": "artifact_created", "artifactId": "artifact_456", "artifactType": "code", "title": "Python Script", "order": 0}
data: {"type": "artifact_created", "artifactId": "artifact_789", "artifactType": "html", "title": "HTML Document", "order": 1}

// Completion
data: {"type": "complete", "message": "...", "metadata": {...}}
```

#### DELETE /chat/conversations/:id
Delete conversation (Enhanced to clean up artifacts)

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

### Artifacts

#### GET /artifacts/conversations/:conversationId
Get all artifacts for a conversation

**Query Parameters:**
- `groupByMessage` - Group by message ID ('true'|'false', default: 'false')
- `orderBy` - Sort field (default: 'createdAt')
- `direction` - Sort direction ('asc'|'desc', default: 'asc')

**Response (grouped):**
```json
{
  "success": true,
  "data": {
    "conversationId": "conv_123",
    "artifactsByMessage": {
      "msg_456": [
        {
          "id": "artifact_789",
          "title": "Python Script",
          "type": "code",
          "order": 0
        }
      ],
      "msg_789": [
        {
          "id": "artifact_101",
          "title": "HTML Document",
          "type": "html",
          "order": 0
        },
        {
          "id": "artifact_102",
          "title": "CSS Stylesheet",
          "type": "code",
          "order": 1
        }
      ]
    },
    "totalArtifacts": 3,
    "totalMessages": 2,
    "messagesWithMultipleArtifacts": 1
  }
}
```

#### GET /artifacts/by-message/:messageId
Get all artifacts for a specific message

**Query Parameters:**
- `orderBy` - Sort field (default: 'order')
- `direction` - Sort direction ('asc'|'desc', default: 'asc')

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "msg_123",
    "artifacts": [
      {
        "id": "artifact_456",
        "title": "Python Script (1 of 2)",
        "type": "code",
        "content": "print('Hello World')",
        "language": "python",
        "order": 0,
        "metadata": {
          "partOfMultiArtifact": true,
          "artifactIndex": 0,
          "totalArtifactsInMessage": 2
        }
      },
      {
        "id": "artifact_789",
        "title": "HTML Document (2 of 2)",
        "type": "html",
        "content": "<h1>Hello World</h1>",
        "order": 1,
        "metadata": {
          "partOfMultiArtifact": true,
          "artifactIndex": 1,
          "totalArtifactsInMessage": 2
        }
      }
    ],
    "total": 2,
    "hasMultipleArtifacts": true
  }
}
```

#### POST /artifacts/multi-create
Create multiple artifacts in a single request

**Request Body:**
```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "artifacts": [
    {
      "title": "Python Script",
      "type": "code",
      "content": "print('Hello World')",
      "language": "python",
      "order": 0
    },
    {
      "title": "HTML Document",
      "type": "html",
      "content": "<h1>Hello World</h1>",
      "order": 1
    }
  ],
  "originalContent": "Here's your code...",
  "processedContent": "Here's your code: [artifacts created]"
}
```

**Response:**
```json
{
  "success": true,
  "artifacts": [
    {
      "id": "artifact_456",
      "title": "Python Script",
      "type": "code",
      "content": "print('Hello World')"
    },
    {
      "id": "artifact_789",
      "title": "HTML Document",
      "type": "html",
      "content": "<h1>Hello World</h1>"
    }
  ],
  "processedContent": "Here's your code: [artifacts created]",
  "artifactCount": 2,
  "operation": "multi-create"
}
```

#### PUT /artifacts/by-message/:messageId/reorder
Reorder artifacts within a message

**Request Body:**
```json
{
  "artifactOrder": [
    {
      "artifactId": "artifact_789",
      "order": 0
    },
    {
      "artifactId": "artifact_456",
      "order": 1
    }
  ]
}
```

#### POST /artifacts/validate
Validate artifacts before creation

**Request Body:**
```json
{
  "artifacts": [
    {
      "content": "print('test')",
      "type": "code",
      "title": "Test Script"
    },
    {
      "content": "print('test')",
      "type": "code",
      "title": "Duplicate Script"
    }
  ]
}
```

**Response:**
```json
{
  "success": false,
  "data": {
    "validation": {
      "valid": false,
      "errors": [],
      "warnings": ["Found 1 potential duplicate artifacts"]
    },
    "duplicates": [
      {
        "index": 1,
        "duplicateOf": 0,
        "similarity": 1.0
      }
    ],
    "artifacts": [
      {
        "index": 0,
        "content": "print('test')",
        "type": "code",
        "contentHash": "abc123",
        "contentSize": 12
      },
      {
        "index": 1,
        "content": "print('test')",
        "type": "code", 
        "contentHash": "abc123",
        "contentSize": 12
      }
    ],
    "summary": {
      "totalArtifacts": 2,
      "validArtifacts": 2,
      "duplicateArtifacts": 1,
      "withinLimits": true,
      "config": {
        "maxArtifacts": 10,
        "minContentSize": 20,
        "duplicateThreshold": 0.95
      }
    }
  }
}
```

#### GET /artifacts/validation-rules
Get current validation rules and configuration

**Response:**
```json
{
  "success": true,
  "data": {
    "limits": {
      "maxArtifactsPerMessage": 10,
      "minContentSize": 20
    },
    "duplicateDetection": {
      "enabled": true,
      "similarityThreshold": 0.95,
      "minContentSizeForDetection": 50,
      "algorithm": "sha256"
    },
    "groupingStrategies": [
      "language-based",
      "type-based",
      "explicit-separation",
      "size-based",
      "sequence-based"
    ],
    "separationMarkers": [
      "File 1:", "File 2:", "Script A:", "Script B:",
      "---", "===", "## ", "### ",
      "Part 1:", "Part 2:", "Section ",
      "1.", "2.", "3.", "4.", "5."
    ],
    "supportedTypes": [
      "text", "code", "html", "react", "svg", 
      "mermaid", "json", "csv", "markdown"
    ]
  }
}
```

#### GET /artifacts/:artifactId
Get single artifact by ID

#### GET /artifacts/:artifactId/versions
Get all versions for an artifact

#### GET /artifacts/:artifactId/versions/:version
Get specific version of an artifact

#### POST /artifacts
Create new artifact

**Request Body:**
```json
{
  "conversationId": "conv_123",
  "messageId": "msg_456",
  "title": "My Script",
  "type": "code",
  "content": "print('Hello World')",
  "language": "python",
  "order": 0,
  "metadata": {
    "detectionStrategy": "manual",
    "partOfMultiArtifact": false
  }
}
```

#### PUT /artifacts/:artifactId
Update existing artifact

#### DELETE /artifacts/:artifactId
Delete artifact

#### POST /artifacts/bulk
Perform bulk artifact operations

**Request Body:**
```json
{
  "conversationId": "conv_123",
  "operations": [
    {
      "type": "create",
      "artifact": {
        "title": "New Script",
        "type": "code",
        "content": "print('New')"
      }
    },
    {
      "type": "update",
      "artifactId": "artifact_456",
      "artifact": {
        "content": "print('Updated')"
      }
    },
    {
      "type": "delete",
      "artifactId": "artifact_789"
    }
  ]
}
```

#### POST /artifacts/conversations/:conversationId/migrate
Migrate artifacts from message metadata

#### GET /artifacts/health
Get overall artifacts health status

#### GET /artifacts/conversations/:conversationId/health
Get health status for specific conversation artifacts

#### POST /artifacts/:artifactId/sync
Force sync for specific artifact (for multi-host coordination)

#### GET /artifacts/conflicts
Get all artifacts with sync conflicts

#### GET /artifacts/debug/stats
Get detailed artifacts statistics (development only)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalArtifacts": 1250,
    "compressedArtifacts": 425,
    "syncedArtifacts": 1200,
    "conflictedArtifacts": 5,
    "erroredArtifacts": 2,
    "multiArtifacts": 380,
    "duplicateArtifacts": 25,
    "averageContentSize": 2048,
    "messagesWithMultipleArtifacts": 95,
    "compressionRatio": "34.0%",
    "multiArtifactRatio": "30.4%",
    "duplicateRatio": "2.0%"
  }
}
```

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
  "content": "Create a Python script and HTML page",
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

#### chat:artifact_created
Artifact created during streaming (NEW)
```javascript
{
  "messageId": "msg_123",
  "artifactId": "artifact_456",
  "artifactType": "code",
  "title": "Python Script",
  "order": 0
}
```

#### chat:complete
Message complete (Enhanced with artifact info)
```javascript
{
  "messageId": "msg_123",
  "metadata": {
    "tokens": 150,
    "generationTime": 2500,
    "model": "llama3",
    "artifacts": [
      {
        "artifactId": "artifact_456",
        "artifactType": "code",
        "title": "Python Script",
        "order": 0
      }
    ],
    "artifactCount": 1,
    "hasArtifact": true
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

## Multi-Artifact Support

### Detection Strategy
The system automatically detects multiple artifacts in AI responses:

1. **Code Blocks**: Different languages create separate artifacts
2. **Explicit Separation**: Markers like "File 1:", "---", "## " force separation
3. **Content Types**: HTML, SVG, JSON, CSV, Mermaid diagrams detected automatically
4. **Smart Grouping**: Related content may be grouped based on similarity

### Validation Rules
- **Maximum**: 10 artifacts per message
- **Minimum Size**: 20 characters per artifact
- **Duplicate Detection**: 95% similarity threshold
- **Content Hash**: SHA-256 for duplicate detection

### Backward Compatibility
All existing single-artifact functionality continues to work:
- Legacy `artifactId`, `artifactType`, `hasArtifact` fields preserved
- New `artifacts` array supplements legacy fields
- Client can check for array or fall back to legacy format

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
- `ARTIFACT_VALIDATION_ERROR` - Artifact validation failed (NEW)
- `DUPLICATE_ARTIFACT_ERROR` - Duplicate artifact detected (NEW)
- `ARTIFACT_LIMIT_EXCEEDED` - Too many artifacts in request (NEW)

### Multi-Artifact Specific Errors

#### Validation Error Example
```json
{
  "success": false,
  "error": {
    "code": "ARTIFACT_VALIDATION_ERROR",
    "message": "Artifact validation failed: Too many artifacts: 15 exceeds maximum of 10",
    "details": {
      "validationResult": {
        "valid": false,
        "errors": ["Too many artifacts: 15 exceeds maximum of 10"],
        "warnings": ["Found 3 potential duplicate artifacts"]
      }
    }
  }
}
```

#### Partial Success Example
```json
{
  "success": false,
  "artifacts": [
    {
      "id": "artifact_456",
      "title": "Successful Script"
    }
  ],
  "errors": [
    {
      "index": 1,
      "title": "Failed Script",
      "error": "Content too small: 5 characters, minimum 20 required"
    }
  ],
  "operation": "multi-create"
}
```
