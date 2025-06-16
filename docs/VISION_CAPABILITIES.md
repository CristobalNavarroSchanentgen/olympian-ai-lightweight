# Vision Capabilities Documentation

## Overview

Olympian AI Lightweight supports advanced vision capabilities through integration with Ollama's vision models. The system features intelligent **automatic vision detection** that analyzes each model's capabilities and provides seamless image processing through direct vision models or hybrid processing pipelines.

## 🔍 Intelligent Vision Detection

The application uses a **comprehensive 8-method detection system** to automatically identify vision capabilities in Ollama models. This ensures accurate detection across different model formats and configurations.

### Supported Vision Models
The system automatically detects and lists available vision models from your Ollama installation, including:
- `llava:13b` - Large vision model (recommended for accuracy)
- `llava:7b` - Smaller, faster vision model  
- `llama3.2-vision:11b` - Latest Llama vision model
- `bakllava` - Alternative vision implementation
- `llava-llama3` - Llava with Llama 3 base
- `llava-phi3` - Llava with Phi-3 base
- `moondream` - Compact vision model
- `cogvlm` - Advanced vision-language model
- `qwen-vl` - Qwen vision-language models
- `minicpm-v` - Efficient vision models

> **Technical Deep Dive**: For detailed information about how vision detection works, see [VISION_DETECTION_TECHNICAL.md](./VISION_DETECTION_TECHNICAL.md)

## Features

### 1. Image Upload & Management
- **Drag and Drop**: Images directly into the chat input
- **File Browser**: Click the image icon to browse and select files
- **Multi-Format Support**: PNG, JPG, JPEG, GIF, WebP
- **Image Preview**: Preview uploaded images before sending
- **Individual Removal**: Remove specific images before sending
- **Multi-Image Support**: Process multiple images in a single request

### 2. Automatic Model Detection
The system intelligently analyzes each model using multiple detection methods:

#### Detection Hierarchy (by reliability):
1. **Modalities Field** ⭐⭐⭐⭐⭐ - Explicit modality declarations
2. **Config Modalities** ⭐⭐⭐⭐⭐ - Alternative modality location
3. **Capabilities Flag** ⭐⭐⭐⭐⭐ - Direct capability indicators
4. **Vision Components** ⭐⭐⭐⭐ - Vision encoder/processor detection
5. **Architecture Analysis** ⭐⭐⭐⭐ - Known vision architectures
6. **Model Families** ⭐⭐⭐⭐ - Model family classification
7. **Modelfile Patterns** ⭐⭐⭐ - Configuration pattern matching
8. **Name Patterns** ⭐⭐ - Fallback name-based detection

### 3. Processing Modes

#### Direct Vision Processing
When your selected model supports vision (indicated by the **"Vision"** badge):
- Images are processed directly by the model
- Optimal performance and accuracy
- Single-step processing pipeline

#### Hybrid Processing  
For models without vision support:
- Select a separate vision model for image analysis
- Vision model analyzes and describes images
- Description passed to your selected text model
- Flexible model combinations

#### Automatic Fallback
- System detects when vision is needed but unavailable
- Provides clear guidance and available options
- Suggests compatible vision models

### 4. Enhanced User Interface

#### Smart Model Selector
- **AI Model**: Primary model selection with vision capability indicators
- **Vision Model**: Dynamic selector that appears when needed
  - Context-aware help text
  - Shows relevance based on image attachment
  - "Auto-detect" option for intelligent selection

#### Visual Indicators
- **Vision Badge**: Clear indication of vision-capable models
- **Model Descriptions**: Detailed capability information
- **Status Messages**: Real-time feedback on processing mode

#### Intelligent Error Handling
- **Capability Mismatches**: Clear explanations when models don't support images
- **Missing Models**: Helpful guidance when no vision models are available
- **Processing Errors**: Detailed error messages with resolution steps

## Usage Examples

### Example 1: Direct Vision Model Usage
```bash
# Select a vision-capable model
Model: llama3.2-vision:11b [Vision Badge]
Upload: screenshot.png
Prompt: "What UI elements do you see in this interface?"
Result: Direct analysis by the vision model
```

### Example 2: Hybrid Processing Pipeline
```bash
# Use a powerful text model with vision assistance
AI Model: deepseek-r1:7b (text-only)
Vision Model: llava:13b (for image analysis)
Upload: diagram.jpg
Prompt: "Explain the architecture shown in this diagram"
Result: llava describes → deepseek-r1 explains architecture
```

### Example 3: Automatic Detection & Guidance
```bash
# System guides you when vision is needed
AI Model: llama3.1:7b (no vision support)
Upload: photo.jpg
System: "Vision Model Required - Select a vision model or switch to a vision-capable model"
Available Options: [llava:13b, llama3.2-vision:11b, moondream:latest]
```

## Implementation Architecture

### Backend Vision Detection
```typescript
// Comprehensive detection system
interface ModelCapability {
  name: string;
  vision: boolean;          // Automatically detected
  tools: boolean;
  maxTokens: number;
  contextWindow: number;
  description?: string;
}

// Multi-method detection pipeline
async detectCapabilities(model: string): Promise<ModelCapability> {
  // 1. Check intelligent cache
  // 2. Query Ollama model info
  // 3. Run 8-method detection cascade
  // 4. Cache results for performance
}
```

### Frontend Intelligence
- **React Components**: Dynamic UI based on detected capabilities
- **Real-time Updates**: Model selector updates as capabilities are detected
- **Performance Optimized**: Results cached to minimize API calls
- **Error Boundaries**: Graceful handling of detection failures

### API Integration
- `GET /api/chat/vision-models` - Get detected vision-capable models
- `POST /api/chat/send` - Send with automatic capability validation
- `GET /api/models/capabilities` - Get cached capability information

## Deployment-Specific Features

### Subproject 2: Same-host with Existing Ollama
- **Host Integration**: Connects to existing Ollama via `host.docker.internal:11434`
- **Zero Configuration**: Automatically discovers and analyzes available models
- **Performance Optimized**: Direct host communication for minimal latency

### Load Balancing Support
- **Multi-host Detection**: Distributes detection across multiple Ollama instances
- **Health Monitoring**: Automatic failover on detection errors
- **Performance Tracking**: Monitors detection success rates across hosts

## Best Practices

### 1. Model Selection Strategy
- **Performance Priority**: Use direct vision models for best results
- **Flexibility Priority**: Use hybrid processing for specialized text capabilities
- **Resource Optimization**: Choose model sizes based on available compute

### 2. Image Optimization
- **Quality**: Use clear, well-lit images for optimal analysis
- **Resolution**: Balance detail vs. processing time
- **Multiple Angles**: Provide different perspectives for complex subjects
- **Format Selection**: Use PNG for screenshots, JPEG for photos

### 3. Prompting Best Practices
- **Specific Questions**: Ask targeted questions about image content
- **Context Provision**: Explain what you're looking for
- **Multi-step Queries**: Break complex analyses into steps
- **Reference Elements**: Point to specific areas or objects

### 4. Performance Optimization
- **Model Sizing**: Larger models (13b) for accuracy, smaller (7b) for speed
- **Cache Utilization**: System automatically caches detection results
- **Resource Monitoring**: Monitor GPU/CPU usage for optimal performance

## Troubleshooting

### Detection Issues

#### Vision Models Not Appearing
**Symptoms**: Known vision models show as text-only
**Diagnosis**:
```bash
# Check model info directly
curl -X POST http://localhost:11434/api/show \
  -H "Content-Type: application/json" \
  -d '{"name": "llava:13b"}'

# Review detection logs
docker logs olympian-backend | grep "Vision detection"
```

#### "Vision Model Required" Error
**Cause**: Selected model doesn't support images
**Solutions**:
1. Switch to a vision-capable model (look for Vision badge)
2. Select a vision model for hybrid processing
3. Use auto-detect to let system choose

### Connection Issues

#### No Models Available
**Cause**: Unable to connect to Ollama
**Diagnosis**:
```bash
# Test Ollama connectivity
curl http://localhost:11434/api/tags

# Check container network (Subproject 2)
docker exec olympian-backend curl -f http://host.docker.internal:11434/api/tags
```

#### Slow Detection
**Causes**: Network latency, Ollama overload, large model files
**Solutions**:
- Check Ollama resource usage
- Monitor network connectivity
- Review detection cache hit rates

### Processing Issues

#### Image Upload Failures
**Common Causes**:
- File size too large (>10MB typical limit)
- Unsupported format
- Network timeout

**Solutions**:
- Compress images before upload
- Use supported formats (PNG, JPG, WebP)
- Check network stability

#### Slow Image Processing
**Optimization Strategies**:
- Use smaller vision models for faster processing
- Reduce image resolution if detail isn't critical
- Monitor GPU/CPU resource availability
- Consider hybrid processing for better resource distribution

## Advanced Configuration

### Environment Variables (Subproject 2)
```yaml
# docker-compose.same-host-existing-ollama.yml
environment:
  OLLAMA_HOST: http://host.docker.internal:11434
  DEPLOYMENT_MODE: same-host-existing-ollama
  LOG_LEVEL: info  # Set to 'debug' for detailed detection logs
```

### Performance Tuning
```typescript
// Detection caching configuration
private modelCapabilities: Map<string, ModelCapability> = new Map();

// Timeout configuration for API calls
const timeout = 10000; // 10 seconds
```

### Custom Detection Patterns
The system is extensible for custom model patterns:
```typescript
// Add custom vision model patterns
const customVisionPatterns = [
  'custom-vision-model',
  'organization.*vision'
];
```

## Monitoring & Analytics

### Detection Success Metrics
- Model capability detection accuracy
- Cache hit rates for performance
- API response times from Ollama
- Error rates by detection method

### Logging Categories
- `Vision detection results` - Capability analysis outcomes
- `Successfully connected to Ollama` - Connection health
- `Vision processing complete` - Image processing metrics
- `Cache utilization` - Performance optimization

---

## Related Documentation

- **[VISION_DETECTION_TECHNICAL.md](./VISION_DETECTION_TECHNICAL.md)** - Comprehensive technical implementation details
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Overall system architecture
- **[API.md](./API.md)** - API endpoints and integration
- **[CHAT_MEMORY.md](./CHAT_MEMORY.md)** - Memory system integration

---

**Note**: This documentation covers the intelligent vision detection system that works across all deployment modes, with specific optimizations for each subproject configuration.
