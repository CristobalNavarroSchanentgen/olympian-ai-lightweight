# Vision Capability Detection - Technical Implementation

## Overview

This document provides a comprehensive technical explanation of how **Olympian AI Lightweight** identifies vision capabilities in Ollama models, specifically for **Subproject 2: Same-host with existing Ollama** (triggered by: `make quick-docker-same-existing`).

## Architecture Context - Subproject 2

In subproject 2, the application connects to an existing Ollama instance running on the host machine:

- **Deployment Mode**: `same-host-existing-ollama`
- **Ollama Connection**: `OLLAMA_HOST: http://host.docker.internal:11434`
- **Container Setup**: Uses `docker-compose.same-host-existing-ollama.yml`
- **Network Access**: Container communicates with host Ollama via `host.docker.internal`

## Core Implementation

### Service Location
The vision detection logic is implemented in:
```
packages/server/src/services/OllamaStreamliner.ts
```

### Key Interface Definitions
```typescript
// From packages/shared/src/types/chat.ts
interface ModelCapability {
  name: string;
  vision: boolean;              // Vision capability detected
  tools: boolean;
  maxTokens: number;
  contextWindow: number;
  description?: string;
}

interface OllamaModelInfo {
  modelfile?: string;
  description?: string;
  modalities?: string[];         // Primary detection field
  model_info?: {
    architecture?: string;
  };
  details?: {
    families?: string[];
  };
  capabilities?: {
    image_processing?: boolean;
  };
  config?: {
    vision_encoder?: any;
    image_processor?: any;
    modalities?: string[];
  };
}
```

## Vision Detection Algorithm

### Multi-Method Detection Strategy

The system employs **8 cascading detection methods** for maximum accuracy and coverage:

#### 1. Modalities Field Detection (Primary Method)
**Reliability**: ⭐⭐⭐⭐⭐ (Highest)

```typescript
if (modelInfo.modalities && Array.isArray(modelInfo.modalities)) {
  const visionModalityPatterns = ['vision', 'multimodal', 'image', 'visual'];
  detectionResults.modalities = modelInfo.modalities.some(modality => 
    visionModalityPatterns.some(pattern => 
      modality.toLowerCase().includes(pattern.toLowerCase())
    )
  );
}
```

**What it detects**: Models with explicit modality declarations in their metadata.

#### 2. Config Modalities Check (Alternative Location)
**Reliability**: ⭐⭐⭐⭐⭐ (Highest)

```typescript
if (modelInfo.config?.modalities && Array.isArray(modelInfo.config.modalities)) {
  const visionModalityPatterns = ['vision', 'multimodal', 'image', 'visual'];
  detectionResults.config = modelInfo.config.modalities.some(modality => 
    visionModalityPatterns.some(pattern => 
      modality.toLowerCase().includes(pattern.toLowerCase())
    )
  );
}
```

**What it detects**: Models with modality information stored in config section.

#### 3. Explicit Capabilities Field
**Reliability**: ⭐⭐⭐⭐⭐ (Highest)

```typescript
if (modelInfo.capabilities?.image_processing === true) {
  detectionResults.capabilities = true;
  return true;
}
```

**What it detects**: Models with explicit `image_processing: true` capability flags.

#### 4. Vision Components Detection
**Reliability**: ⭐⭐⭐⭐ (High)

```typescript
if (modelInfo.config?.vision_encoder || modelInfo.config?.image_processor) {
  detectionResults.config = true;
  return true;
}
```

**What it detects**: Models with vision-specific components in their configuration.

#### 5. Architecture Pattern Analysis
**Reliability**: ⭐⭐⭐⭐ (High)

```typescript
const visionArchPatterns = [
  'vision', 'clip', 'vit', 'llava', 'bakllava', 'moondream', 
  'multimodal', 'image', 'visual', 'cogvlm', 'instructblip',
  'blip', 'flamingo', 'kosmos', 'gpt4v', 'dalle'
];

if (modelInfo.model_info?.architecture) {
  const architecture = modelInfo.model_info.architecture.toLowerCase();
  detectionResults.architecture = visionArchPatterns.some(pattern => 
    architecture.includes(pattern)
  );
}
```

**What it detects**: Models based on known vision architectures.

#### 6. Model Family Classification
**Reliability**: ⭐⭐⭐⭐ (High)

```typescript
const visionFamilyPatterns = [
  'llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'moondream', 
  'vision', 'multimodal', 'cogvlm', 'instructblip', 'blip',
  'minicpm-v', 'qwen-vl', 'internvl', 'deepseek-vl'
];

if (modelInfo.details?.families && Array.isArray(modelInfo.details.families)) {
  detectionResults.families = modelInfo.details.families.some(family =>
    visionFamilyPatterns.some(pattern => 
      family.toLowerCase().includes(pattern.toLowerCase())
    )
  );
}
```

**What it detects**: Models belonging to known vision model families.

#### 7. Modelfile Configuration Analysis
**Reliability**: ⭐⭐⭐ (Medium)

```typescript
const specificVisionPatterns = [
  'vision_encoder', 'image_processor', 'clip_model', 'vision_tower',
  'PARAMETER.*vision', 'vision.*true', 'multimodal.*true',
  'image_size.*\\d+', 'patch_size.*\\d+', 'vision_config',
  'image_token_index', 'vision_feature', 'visual_encoder'
];

detectionResults.modelfile = specificVisionPatterns.some(pattern => {
  const regex = new RegExp(pattern, 'i');
  return regex.test(modelfile);
});
```

**What it detects**: Models with vision-specific configuration parameters in their modelfile.

#### 8. Model Name Pattern Matching (Fallback)
**Reliability**: ⭐⭐ (Lower - Fallback only)

```typescript
const visionNamePatterns = [
  'llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'llava-v1.6',
  'llama3.2-vision', 'moondream', 'cogvlm', 'instructblip', 'blip',
  'minicpm-v', 'qwen.*vl', 'qwen.*vision', 'internvl', 'deepseek-vl', 
  'yi-vl', 'phi.*vision', 'phi-3-vision', 'vision', 'multimodal'
];

detectionResults.namePattern = visionNamePatterns.some(pattern => {
  const regex = new RegExp(pattern, 'i');
  return regex.test(model);
});
```

**What it detects**: Models with vision-indicating names as a final fallback.

## API Communication Process

### 1. Model Information Retrieval
```typescript
const response = await fetch(`${ollamaHost}/api/show`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: model }),
});

const modelInfo = await response.json() as OllamaModelInfo;
```

### 2. Comprehensive Analysis Pipeline
```typescript
async detectCapabilities(model: string): Promise<ModelCapability> {
  // 1. Check cache first
  if (this.modelCapabilities.has(model)) {
    return this.modelCapabilities.get(model)!;
  }

  // 2. Query Ollama API
  const ollamaHost = this.getOllamaHost();
  const modelInfo = await this.fetchModelInfo(model, ollamaHost);
  
  // 3. Run 8-method detection
  const hasVision = await this.hasVisionSupport(model, modelInfo);
  
  // 4. Build complete capability profile
  const capability: ModelCapability = {
    name: model,
    vision: hasVision,
    tools: this.hasToolSupport(model, modelInfo.modelfile || ''),
    maxTokens: this.parseMaxTokens(modelInfo.modelfile || '') || 4096,
    contextWindow: this.parseContextWindow(modelInfo.modelfile || '') || 128000,
    description: modelInfo.description,
  };

  // 5. Cache and return
  this.modelCapabilities.set(model, capability);
  return capability;
}
```

## Performance Optimizations

### Intelligent Caching System
```typescript
private modelCapabilities: Map<string, ModelCapability> = new Map();
```

- **Cache Strategy**: Results cached per model name
- **Cache Scope**: Process-lifetime caching
- **Cache Benefits**: Eliminates repeated API calls for same model
- **Memory Impact**: Minimal - stores only capability metadata

### Load Balancer Integration
```typescript
private getOllamaHost(clientIp?: string): string {
  if (this.loadBalancer && this.deploymentConfig.ollama.hosts.length > 0) {
    return this.loadBalancer.getNextHost(clientIp);
  }
  return this.deploymentConfig.ollama.host;
}
```

- **Multi-host Support**: Distributes detection requests across Ollama instances
- **Failure Recovery**: Automatic failover on detection errors
- **Health Monitoring**: Tracks host availability and performance

## Error Handling & Resilience

### Network Failure Recovery
```typescript
catch (error) {
  logger.error(`Failed to detect capabilities for model ${model}:`, error);
  
  if (this.loadBalancer) {
    this.loadBalancer.reportFailure(ollamaHost);
  }
  
  // Return safe defaults
  return {
    name: model,
    vision: false,
    tools: false,
    maxTokens: 4096,
    contextWindow: 8192,
  };
}
```

### Graceful Degradation
- **API Failures**: Returns conservative defaults with `vision: false`
- **Partial Data**: Attempts detection with available information
- **Timeout Handling**: 10-second timeout with abort controller
- **Load Balancer**: Automatic host switching on failures

## Logging & Observability

### Comprehensive Debug Information
```typescript
logger.info(`Vision detection results for model '${model}':`, {
  hasVision: capability.vision,
  modalities: modelInfo.modalities,
  architecture: modelInfo.model_info?.architecture,
  families: modelInfo.details?.families,
  capabilities: modelInfo.capabilities,
  config: modelInfo.config,
  modelfilePreview: modelfile.substring(0, 300) + '...'
});
```

### Detection Method Tracking
```typescript
const detectionResults = {
  modalities: false,
  architecture: false,
  families: false,
  modelfile: false,
  capabilities: false,
  config: false,
  namePattern: false
};
```

- **Method Success Tracking**: Records which detection method succeeded
- **Availability Mapping**: Logs what data fields were available
- **Debug Support**: Detailed information for troubleshooting
- **Performance Monitoring**: Track detection success rates

## Integration Points

### Vision Model Availability
```typescript
async getAvailableVisionModels(): Promise<string[]> {
  const models = await this.listModels();
  const visionModels: string[] = [];
  
  for (const model of models) {
    const capabilities = await this.detectCapabilities(model);
    if (capabilities.vision) {
      visionModels.push(model);
    }
  }
  
  return visionModels;
}
```

### Request Processing Integration
```typescript
async processRequest(request: ChatRequest): Promise<ProcessedRequest> {
  const capabilities = await this.detectCapabilities(request.model);

  if (request.images && request.images.length > 0) {
    if (!capabilities.vision && !request.visionModel) {
      const availableVisionModels = await this.getAvailableVisionModels();
      throw new VisionError({
        error: 'VISION_UNSUPPORTED',
        message: `Model '${request.model}' doesn't support images`,
        available_vision_models: availableVisionModels,
      });
    }
  }
  
  // Continue with appropriate processing...
}
```

## Deployment-Specific Considerations

### Subproject 2 Network Configuration
- **Host Communication**: Uses `host.docker.internal:11434` for Ollama access
- **Container Isolation**: Backend runs in container but connects to host Ollama
- **Port Mapping**: Standard Ollama port 11434 on host
- **Health Checks**: Container health depends on Ollama connectivity

### Configuration Environment
```yaml
# docker-compose.same-host-existing-ollama.yml
backend:
  environment:
    DEPLOYMENT_MODE: same-host-existing-ollama
    OLLAMA_HOST: http://host.docker.internal:11434
  extra_hosts:
    - "host.docker.internal:host-gateway"
```

## Troubleshooting Guide

### Common Detection Issues

#### 1. False Negatives (Vision models not detected)
**Symptoms**: Known vision models showing as text-only
**Debugging**:
```bash
# Check model info directly
curl -X POST http://localhost:11434/api/show \
  -H "Content-Type: application/json" \
  -d '{"name": "llava:13b"}'
```

#### 2. Network Connectivity
**Symptoms**: No models detected, connection errors
**Debugging**:
```bash
# Test connectivity from container
docker exec olympian-backend curl -f http://host.docker.internal:11434/api/tags
```

#### 3. Performance Issues
**Symptoms**: Slow model selection, timeouts
**Solutions**:
- Check Ollama resource usage
- Monitor detection cache hit rates
- Review network latency

### Logging Analysis
```bash
# View detection logs
docker logs olympian-backend | grep "Vision detection"

# Monitor detection performance
docker logs olympian-backend | grep "Successfully connected to Ollama"
```

## Future Enhancements

### Planned Improvements
1. **Model Metadata Standardization**: Working with Ollama community on standard vision metadata
2. **Performance Caching**: Persistent cache across restarts
3. **Real-time Updates**: WebSocket-based model capability updates
4. **Enhanced Patterns**: Machine learning-based capability detection

### Extensibility
The detection system is designed for easy extension:
- Add new detection methods to the cascade
- Update pattern lists for new model families
- Implement custom detection logic per deployment mode

---

**Note**: This documentation is specific to **Subproject 2: Same-host with existing Ollama**. Other subprojects may have different networking configurations but use the same core detection logic.
