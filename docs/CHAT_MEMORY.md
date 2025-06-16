# Chat Memory Feature

The Olympian AI Lightweight client now includes a chat memory feature that maintains conversation context across messages, providing a more coherent and context-aware chat experience.

## How It Works

### Automatic Context Management
When you send a message in an existing conversation, the system automatically:
1. Retrieves previous messages from the conversation history
2. Includes them as context when sending the request to the AI model
3. Manages the context size to stay within the model's token limits

### Memory Configuration
The memory system has sensible defaults but can be customized:
- **Max Messages**: Default 20 (last 20 messages included)
- **Max Tokens**: Default 4000 (reserved for history)
- **System Prompt**: Customizable instruction for the AI
- **Auto-cleanup**: Automatically removes old messages when conversations get too long

## API Endpoints

### Memory Statistics
```
GET /api/chat/conversations/:id/memory-stats
```
Returns statistics about conversation memory usage:
- Message count
- Estimated token usage
- Oldest and newest message timestamps

### Update Memory Configuration
```
PUT /api/chat/conversations/:id/memory-config
```
Update memory settings for a specific conversation:
```json
{
  "maxMessages": 30,
  "maxTokens": 5000,
  "includeSystemPrompt": true,
  "systemPrompt": "You are a helpful coding assistant."
}
```

### Clear Old Messages
```
POST /api/chat/conversations/:id/clear-old-messages
```
Manually clear old messages, keeping only the most recent:
```json
{
  "keepLast": 50
}
```

## WebSocket Events

### Memory Statistics (Real-time)
```javascript
// Request memory stats
socket.emit('memory:stats', { conversationId: 'xxx' });

// Receive stats
socket.on('memory:stats', (data) => {
  console.log(data.stats);
});
```

### Clear Memory (Real-time)
```javascript
// Clear old messages
socket.emit('memory:clear', { 
  conversationId: 'xxx',
  keepLast: 50 
});

// Confirmation
socket.on('memory:cleared', (data) => {
  console.log(data.message);
});
```

## Implementation Details

### Token Management
The system automatically calculates token budgets based on:
- Model's context window size
- Current message length
- Available space for response

### Performance Optimization
- Messages are loaded efficiently from MongoDB
- Token counting uses a fast approximation (1 token ≈ 4 characters)
- Auto-cleanup prevents unbounded memory growth

### Consistency
- User messages are saved before processing to ensure they're included in context
- Both HTTP and WebSocket endpoints use the same memory service
- Memory configuration persists with the conversation

## Best Practices

1. **Long Conversations**: For very long conversations, consider:
   - Periodically clearing old messages
   - Adjusting the max messages limit
   - Using conversation summaries for context

2. **Model Selection**: Different models have different context windows:
   - Smaller models: May need lower message limits
   - Larger models: Can handle more context

3. **Custom System Prompts**: Use system prompts to:
   - Set the AI's personality or role
   - Provide consistent instructions
   - Include domain-specific context

## Example Usage

### Starting a New Conversation with Memory
```javascript
// First message creates conversation
const response = await fetch('/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Hello, I'm working on a Python project",
    model: "llama3"
  })
});

const { conversationId } = await response.json();

// Subsequent messages include context
const followUp = await fetch('/api/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: "Can you help me with error handling?",
    model: "llama3",
    conversationId // Memory automatically loaded
  })
});
```

### Monitoring Memory Usage
```javascript
// Check memory stats
const stats = await fetch(`/api/chat/conversations/${conversationId}/memory-stats`);
const data = await stats.json();

console.log(`Messages: ${data.messageCount}`);
console.log(`Estimated tokens: ${data.estimatedTokens}`);

// Clear if needed
if (data.messageCount > 100) {
  await fetch(`/api/chat/conversations/${conversationId}/clear-old-messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keepLast: 50 })
  });
}
```

## Troubleshooting

### Memory Not Working?
1. Ensure you're passing the `conversationId` in subsequent messages
2. Check that the conversation exists in the database
3. Verify the model's context window is large enough

### Performance Issues?
1. Reduce `maxMessages` in memory configuration
2. Use auto-cleanup for long conversations
3. Consider clearing very old messages

### Token Limit Errors?
1. The system automatically manages tokens, but you can:
   - Reduce `maxTokens` in configuration
   - Clear old messages more aggressively
   - Use a model with a larger context window
