# Thinking Models - Quick Reference

## 🧠 What is it?
Modern UI pattern for AI models that show their reasoning process. Users see **milestones** by default and can **expand** to see full reasoning when needed.

## 🎯 Target: Subproject 3 (Multi-host deployment)
Trigger with: `make quick-docker-multi`

## 📝 How it works

### For AI Models
Include thinking in responses using `<think>` tags:

```
<think>
The user wants to understand React components. I should:
1. Explain what components are
2. Show a simple example
3. Mention props and state basics
This will give them a solid foundation.
</think>

React components are reusable pieces of UI...
```

### For Users
1. **Collapsed view**: See "🧠 Thinking" badge with word count
2. **Click "View reasoning"**: Expand to see full AI reasoning  
3. **Rich content**: Markdown support, unlimited length
4. **Clean design**: Non-intrusive, fits existing UI

## 🏗️ Implementation Details

### Frontend Components
- `ThinkingSection.tsx` - Main UI component
- Integrated into `MessageItem.tsx` - Positioned between content and artifacts
- Uses existing UI components (Button, Badge, Markdown)

### Backend Processing  
- `OllamaStreamliner.ts` - Parses `<think>` tags during streaming
- `chat.ts` API - Stores thinking data in message metadata
- Real-time detection via Server-Sent Events

### Database Storage
```javascript
message.metadata.thinking = {
  content: "Raw thinking content...",
  hasThinking: true,
  processedAt: new Date()
}
```

## 🚀 Usage Examples

### Testing with o1-style models
```bash
# In chat interface
User: "Solve this step by step: If a store sells 3 apples for $2, how much do 10 apples cost?"

# Expected: Model shows <think> tags with reasoning
# Result: Thinking section appears with expand/collapse
```

### Custom model responses
Any model can use thinking by including `<think>` tags in responses.

## 🔧 Configuration
- **No setup required** - Works with existing subproject 3 configuration
- **Automatic detection** - Thinking content parsed automatically
- **Graceful fallback** - Works fine even if no thinking content present

## 📱 UI Behavior

**Default (Collapsed)**:
```
┌─── AI Response ─────┐
│ Here's the solution │
├─── 🧠 Thinking ────┤  
│ 25 words • ~1min    │ ← Compact indicator
│ [View reasoning] →  │ ← Expand button  
└─────────────────────┘
```

**Expanded**:
```
┌─── AI Response ─────┐
│ Here's the solution │
├─── 🧠 Thinking ────┤
│ ┌─ Reasoning ─────┐ │
│ │ I need to find  │ │ ← Full reasoning
│ │ the unit price  │ │   with markdown
│ │ first: $2/3...  │ │   
│ └─────────────────┘ │
│ [Hide reasoning] ←  │ ← Collapse button
└─────────────────────┘
```

## ⚡ Performance
- **Lazy rendering**: Expanded content only loaded when needed
- **Efficient parsing**: Minimal overhead during message processing  
- **Scalable**: Works with unlimited thinking content length
- **Multi-host ready**: Stateless design for container scaling

## 🔗 Integration Points
- **SSE Events**: `thinking_detected`, `thinking_start`, `thinking_complete`
- **API Fields**: `thinking`, `originalContentWithThinking` in message metadata
- **Backward Compatible**: Existing messages work unchanged

---

**Key Benefits:**
- ✅ **Transparency**: See how AI reaches conclusions
- ✅ **Progressive Disclosure**: Information when you need it  
- ✅ **Clean UX**: Doesn't clutter the main conversation
- ✅ **Unlimited Content**: No restrictions on thinking length
- ✅ **Multi-host Compatible**: Works with subproject 3 scaling

For detailed documentation, see [`docs/THINKING_MODELS.md`](./THINKING_MODELS.md).
