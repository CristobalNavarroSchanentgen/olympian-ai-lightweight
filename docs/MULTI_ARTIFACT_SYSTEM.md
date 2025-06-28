# Multi-Artifact System Implementation

## Overview

The Multi-Artifact System enables the AI to create multiple independent artifacts in a single response when the user requests logically separate content (e.g., different scripts, separate documents, etc.). This implementation maintains backward compatibility while providing enhanced capabilities for handling complex, multi-part responses.

## Implementation Phases

### ✅ Phase 1: Data Model Updates
- **Enhanced Message Metadata**: Support for array of artifacts instead of single artifact
- **Backward Compatibility**: Legacy fields preserved (`artifactId`, `artifactType`, `hasArtifact`)
- **New Fields**: 
  - `artifacts`: Array of artifact references
  - `artifactCount`: Total number of artifacts in message
  - `order`: Display order for artifacts

### ✅ Phase 2: Detection Logic Enhancement
- **Multi-Artifact Detection**: Scans entire response for multiple code blocks and content types
- **Smart Grouping Rules**:
  - Different languages = separate artifacts
  - Same language with related content = potential grouping
  - Explicit separation markers = force separation
- **Supported Content Types**: Code blocks, HTML, SVG, JSON, CSV, Mermaid diagrams, React components

### ✅ Phase 3: Artifact Creation Flow
- **Sequential Creation**: Artifacts created in order to maintain consistency
- **Enhanced Metadata**: Each artifact includes multi-artifact context
- **Error Handling**: Partial success handling with detailed error reporting
- **Content Processing**: Original content preserved while removing code blocks for prose display

### ✅ Phase 4: Client-Side Updates
- **Message Display**: Shows multiple artifact indicators
- **Artifact Panel**: Tabs/dropdown for switching between artifacts
- **State Management**: Enhanced artifact store for multi-artifact support

### ✅ Phase 5: API Updates
- **New Endpoints**:
  - `GET /api/artifacts/by-message/:messageId` - Get all artifacts for a message
  - `POST /api/artifacts/multi-create` - Create multiple artifacts in one request
  - `PUT /api/artifacts/by-message/:messageId/reorder` - Reorder artifacts
- **Enhanced Response Format**: Includes artifact arrays and counts
- **Backward Compatibility**: Legacy single artifact fields maintained

### ✅ Phase 6: Edge Cases & Rules
- **Validation Rules**: Maximum 10 artifacts per message, minimum 20 characters per artifact
- **Duplicate Detection**: Content similarity analysis and deduplication
- **Smart Grouping Logic**: Intelligent artifact grouping based on content similarity
- **Enhanced Error Handling**: Comprehensive validation and error reporting

## Configuration

### Multi-Artifact Limits
```typescript
export const MULTI_ARTIFACT_CONFIG = {
  MAX_ARTIFACTS_PER_MESSAGE: 10,
  MIN_CONTENT_SIZE: 20,
  GROUPING_STRATEGIES: [
    'language-based',
    'type-based', 
    'explicit-separation',
    'size-based',
    'sequence-based'
  ],
  SEPARATION_MARKERS: [
    'File 1:', 'File 2:', 'Script A:', 'Script B:',
    '---', '===', '## ', '### ',
    'Part 1:', 'Part 2:', 'Section ',
    '1.', '2.', '3.', '4.', '5.'
  ],
  DUPLICATE_DETECTION: {
    SIMILARITY_THRESHOLD: 0.95,
    MIN_CONTENT_SIZE_FOR_DETECTION: 50,
    HASH_ALGORITHM: 'sha256',
    ENABLE_FUZZY_MATCHING: true
  }
}
```

## API Endpoints

### Multi-Artifact Endpoints

#### Get Artifacts by Message
```http
GET /api/artifacts/by-message/:messageId
```
**Query Parameters:**
- `orderBy`: Sort field (default: 'order')
- `direction`: Sort direction ('asc'|'desc', default: 'asc')

**Response:**
```json
{
  "success": true,
  "data": {
    "messageId": "string",
    "artifacts": [
      {
        "id": "string",
        "title": "string",
        "type": "code|html|react|svg|mermaid|json|csv|markdown",
        "content": "string",
        "order": 0,
        "metadata": {
          "partOfMultiArtifact": true,
          "artifactIndex": 0,
          "totalArtifactsInMessage": 3
        }
      }
    ],
    "total": 3,
    "hasMultipleArtifacts": true
  }
}
```

#### Create Multiple Artifacts
```http
POST /api/artifacts/multi-create
```
**Request Body:**
```json
{
  "conversationId": "string",
  "messageId": "string",
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
  "originalContent": "string",
  "processedContent": "string"
}
```

#### Validate Artifacts
```http
POST /api/artifacts/validate
```
**Request Body:**
```json
{
  "artifacts": [
    {
      "content": "print('test')",
      "type": "code",
      "title": "Test Script"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "validation": {
      "valid": true,
      "errors": [],
      "warnings": []
    },
    "duplicates": [],
    "summary": {
      "totalArtifacts": 1,
      "validArtifacts": 1,
      "duplicateArtifacts": 0,
      "withinLimits": true
    }
  }
}
```

#### Get Validation Rules
```http
GET /api/artifacts/validation-rules
```

### Enhanced Existing Endpoints

#### Chat Endpoints
- **POST /api/chat/send**: Enhanced with multi-artifact support
- **POST /api/chat/stream**: Enhanced with artifact creation notifications
- **GET /api/chat/conversations/:id/messages**: Includes artifacts array

#### Artifact Management
- **GET /api/artifacts/conversations/:conversationId**: Enhanced with groupByMessage option
- **POST /api/artifacts/bulk**: Support for batch operations
- **GET /api/artifacts/debug/stats**: Enhanced with multi-artifact statistics

## Data Structures

### ArtifactReference
```typescript
interface ArtifactReference {
  artifactId: string;
  artifactType: ArtifactType;
  title: string;
  language?: string;
  order: number;
}
```

### Enhanced Message Metadata
```typescript
interface ArtifactMessageMetadata {
  // Legacy support
  artifactId?: string;
  artifactType?: ArtifactType;
  hasArtifact?: boolean;
  
  // New multi-artifact fields
  artifacts?: ArtifactReference[];
  artifactCount?: number;
  originalContent?: string;
  codeBlocksRemoved?: boolean;
}
```

### Enhanced Artifact Metadata
```typescript
interface ArtifactMetadata {
  // Core fields
  syncStatus: ArtifactSyncStatus;
  detectionStrategy: string;
  originalContent: string;
  reconstructionHash: string;
  contentSize: number;
  codeBlocksRemoved: boolean;
  
  // Multi-artifact fields
  partOfMultiArtifact?: boolean;
  artifactIndex?: number;
  totalArtifactsInMessage?: number;
  groupingStrategy?: string;
  
  // Duplicate detection
  contentHash?: string;
  isDuplicate?: boolean;
  duplicateOf?: string;
  similarityScore?: number;
}
```

## Detection Logic

### Code Block Detection
The system uses enhanced regex patterns to detect various content types:

```typescript
const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
const htmlRegex = /<!DOCTYPE html|<html|<div|<p>|<span>|<h[1-6]>/i;
const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
const jsonRegex = /```json\n([\s\S]*?)```/g;
const csvRegex = /```csv\n([\s\S]*?)```/g;
const reactRegex = /```(jsx?|tsx?)\n([\s\S]*?)```/g;
const mermaidRegex = /```mermaid\n([\s\S]*?)```/g;
```

### Smart Grouping Rules
1. **Language-based grouping**: Same language artifacts may be grouped
2. **Type-based grouping**: Different types always separated
3. **Explicit separation**: Separation markers force independent artifacts
4. **Size-based filtering**: Content below minimum size threshold excluded
5. **Content similarity**: High similarity content may be grouped or marked as duplicate

### Separation Markers
The system recognizes explicit separation indicators:
- File prefixes: "File 1:", "File 2:", "Script A:", "Script B:"
- Markdown headers: "## ", "### "
- Separators: "---", "==="
- Part indicators: "Part 1:", "Part 2:", "Section "
- Numbered lists: "1.", "2.", "3.", etc.

## Usage Examples

### Creating Multiple Code Files
When the AI responds with multiple code files:

```
Here are the files you requested:

## File 1: main.py
```python
def main():
    print("Hello World")

if __name__ == "__main__":
    main()
```

## File 2: utils.py
```python
def utility_function():
    return "Helper function"
```

## File 3: requirements.txt
```
flask==2.0.1
requests==2.26.0
```
```

This creates 3 separate artifacts:
1. "Python Script (1 of 3)" - main.py
2. "Python Script (2 of 3)" - utils.py  
3. "Text Document (3 of 3)" - requirements.txt

### Creating Mixed Content Types
```
Here's your web page with styling:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Page</title>
</head>
<body>
    <h1>Hello World</h1>
</body>
</html>
```

```css
body {
    font-family: Arial, sans-serif;
    margin: 0;
    padding: 20px;
}

h1 {
    color: blue;
}
```

```javascript
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded');
});
```
```

This creates 3 separate artifacts:
1. "HTML Document (1 of 3)"
2. "CSS Stylesheet (2 of 3)"  
3. "JavaScript Code (3 of 3)"

## Backward Compatibility

The implementation maintains full backward compatibility:

### Legacy Message Format
```json
{
  "metadata": {
    "artifactId": "artifact-123",
    "artifactType": "code",
    "hasArtifact": true
  }
}
```

### New Multi-Artifact Format
```json
{
  "metadata": {
    "artifacts": [
      {
        "artifactId": "artifact-123",
        "artifactType": "code",
        "title": "Python Script",
        "order": 0
      }
    ],
    "artifactCount": 1,
    "hasArtifact": true,
    // Legacy fields preserved
    "artifactId": "artifact-123",
    "artifactType": "code"
  }
}
```

## Performance Considerations

### Sequential Creation
Artifacts are created sequentially to maintain order and prevent race conditions:

```typescript
for (let i = 0; i < artifacts.length; i++) {
  const result = await artifactService.createArtifact(artifacts[i]);
  // Process result...
}
```

### Duplicate Detection
Content similarity is calculated using Levenshtein distance with configurable thresholds:

```typescript
const similarity = calculateSimilarityScore(content1, content2);
if (similarity >= MULTI_ARTIFACT_CONFIG.DUPLICATE_DETECTION.SIMILARITY_THRESHOLD) {
  // Mark as duplicate
}
```

### Content Processing
Original content is preserved while code blocks are removed for prose display:

```typescript
const processedContent = removeArtifactsFromContent(originalContent, artifacts);
// Result: "Here are the scripts: [Created Python Script artifact] and [Created HTML Document artifact]"
```

## Error Handling

### Validation Errors
```json
{
  "success": false,
  "error": "Artifact validation failed: Too many artifacts: 15 exceeds maximum of 10"
}
```

### Partial Success
```json
{
  "success": false,
  "artifacts": [
    { "id": "artifact-1", "title": "Success" }
  ],
  "errors": [
    {
      "index": 1,
      "title": "Failed Script",
      "error": "Content too small"
    }
  ]
}
```

## Best Practices

### For Developers
1. **Always handle partial success**: Check for both created artifacts and errors
2. **Use validation endpoint**: Pre-validate artifacts before creation
3. **Respect limits**: Stay within configured limits for artifacts per message
4. **Handle duplicates**: Consider duplicate detection results in UI

### For AI Responses
1. **Use clear separation**: Employ separation markers for distinct artifacts
2. **Meaningful titles**: Provide descriptive titles for each code block
3. **Appropriate sizing**: Ensure each artifact meets minimum size requirements
4. **Logical grouping**: Group related content appropriately

## Troubleshooting

### Common Issues

#### "Too many artifacts" Error
- **Cause**: Exceeding MAX_ARTIFACTS_PER_MESSAGE limit
- **Solution**: Reduce number of artifacts or increase limit in configuration

#### "Content too small" Warning
- **Cause**: Artifact content below MIN_CONTENT_SIZE threshold
- **Solution**: Combine small artifacts or add more content

#### Duplicate Detection False Positives
- **Cause**: Similar but intentionally different content
- **Solution**: Adjust SIMILARITY_THRESHOLD or use explicit separation markers

#### Artifacts Not Grouping as Expected
- **Cause**: Different languages or explicit separation detected
- **Solution**: Use same language and avoid separation markers for grouping

### Debug Information

Enable debug logging to see detection process:
```
🔍 [MultiArtifactDetection] Analyzing content... Separation markers: 2
📦 [MultiArtifactDetection] Found 3 code blocks
🎯 [MultiArtifactDetection] After grouping: 3 artifacts (was 3)
✅ [ChatAPI] Assistant message updated with 3 artifacts
```

## Migration Guide

### From Single Artifacts
Existing single artifact implementations continue to work without changes. To add multi-artifact support:

1. **Check for artifact arrays**: 
```typescript
const artifacts = message.metadata.artifacts || 
  (message.metadata.artifactId ? [{
    artifactId: message.metadata.artifactId,
    artifactType: message.metadata.artifactType,
    order: 0
  }] : []);
```

2. **Update UI components**: Handle multiple artifacts in display logic

3. **Use new endpoints**: Leverage multi-artifact endpoints for enhanced functionality

### Database Migration
No manual database migration required. The system handles both old and new formats transparently.

## Configuration Options

### Environment Variables
```bash
# Maximum artifacts per message (default: 10)
MAX_ARTIFACTS_PER_MESSAGE=10

# Minimum content size in characters (default: 20) 
MIN_ARTIFACT_CONTENT_SIZE=20

# Enable duplicate detection (default: true)
ENABLE_DUPLICATE_DETECTION=true

# Similarity threshold for duplicates (default: 0.95)
DUPLICATE_SIMILARITY_THRESHOLD=0.95
```

### Runtime Configuration
Configuration can be updated via the validation rules endpoint:
```http
GET /api/artifacts/validation-rules
```

## Monitoring and Analytics

### Health Checks
Monitor multi-artifact system health:
```http
GET /api/artifacts/health
```

### Statistics
Track multi-artifact usage:
```http
GET /api/artifacts/debug/stats
```

Key metrics:
- `multiArtifacts`: Count of artifacts that are part of multi-artifact messages
- `messagesWithMultipleArtifacts`: Number of messages containing multiple artifacts
- `duplicateArtifacts`: Count of detected duplicate artifacts
- `multiArtifactRatio`: Percentage of artifacts in multi-artifact messages
- `duplicateRatio`: Percentage of artifacts marked as duplicates

## Future Enhancements

### Planned Features
1. **Cross-message artifact linking**: Link related artifacts across different messages
2. **Template-based artifact creation**: Pre-defined templates for common artifact combinations
3. **Advanced grouping strategies**: ML-based content similarity for intelligent grouping
4. **Artifact dependency tracking**: Track dependencies between artifacts
5. **Bulk artifact operations**: Enhanced batch operations for large-scale management

### Performance Optimizations
1. **Parallel creation**: Safe parallel artifact creation where order is not critical
2. **Caching layers**: Content hash-based caching for duplicate detection
3. **Streaming artifact creation**: Real-time artifact creation during response generation
4. **Compression**: Automatic content compression for large artifacts

This completes the Multi-Artifact System implementation. The system provides robust, scalable support for creating and managing multiple artifacts while maintaining backward compatibility and providing comprehensive validation and error handling.
