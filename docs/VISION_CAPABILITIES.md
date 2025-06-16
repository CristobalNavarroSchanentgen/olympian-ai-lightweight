# Vision Capabilities Documentation

## Overview

Olympian AI Lightweight now supports vision capabilities through integration with Ollama's vision models. Users can upload images and process them using either vision-capable models or hybrid processing with separate vision and text models.

## Features

### 1. Image Upload
- Drag and drop images directly into the chat input
- Click the image icon to browse and select files
- Support for multiple image formats: PNG, JPG, JPEG, GIF, WebP
- Preview uploaded images before sending
- Remove individual images before sending

### 2. Vision Models
The system automatically detects and lists available vision models from your Ollama installation, including:
- `llava:13b` - Large vision model (recommended for accuracy)
- `llava:7b` - Smaller, faster vision model
- `llama3.2-vision:11b` - Latest Llama vision model
- `bakllava` - Alternative vision implementation
- `llava-llama3` - Llava with Llama 3 base
- `llava-phi3` - Llava with Phi-3 base

### 3. Processing Modes

#### Direct Vision Processing
If your selected model supports vision (indicated by the "Vision" badge), images are processed directly by that model.

#### Hybrid Processing
For models without vision support, you can select a separate vision model to process images first. The vision model will:
1. Analyze and describe the images
2. Pass the description to your selected text model
3. Generate a response based on both the text prompt and image description

### 4. User Interface

#### Model Selector
- **AI Model**: Select your primary model for text generation
- **Vision Model**: Optional selector for hybrid processing
  - Always visible when vision models are available
  - Shows helpful context based on whether images are attached
  - "Auto-detect" option lets the system choose based on your primary model's capabilities

#### Error Handling
Clear error messages when:
- Selected model doesn't support vision
- No vision models are available
- Image processing fails

## Usage Examples

### Example 1: Using a Vision-Capable Model
1. Select a model with vision support (e.g., `llama3.2-vision:11b`)
2. Upload an image
3. Ask a question about the image
4. The model processes both text and image directly

### Example 2: Using Hybrid Processing
1. Select a text-only model (e.g., `deepseek-r1:7b`)
2. Select a vision model (e.g., `llava:13b`)
3. Upload an image
4. Ask a question
5. The vision model describes the image, then the text model responds

### Example 3: Automatic Fallback
1. Select a text-only model
2. Don't select a vision model
3. Upload an image
4. System will prompt you to either:
   - Switch to a vision-capable model
   - Select a vision model for hybrid processing

## Implementation Details

### Backend Architecture
```typescript
// Vision model detection
private hasVisionSupport(model: string, modelfile: string): boolean {
  const visionModels = ['llava', 'bakllava', 'llava-llama3', 'llava-phi3', 'llama3.2-vision'];
  return visionModels.some(vm => model.toLowerCase().includes(vm)) ||
         modelfile.toLowerCase().includes('vision') ||
         modelfile.toLowerCase().includes('image');
}

// Hybrid processing pipeline
async processImageWithVisionModel(
  images: string[], 
  content: string, 
  visionModel: string
): Promise<string> {
  // Use vision model to analyze images
  // Return description for text model
}
```

### Frontend Integration
- React components with image upload via `react-dropzone`
- Base64 encoding for image transmission
- Real-time model capability detection
- Dynamic UI updates based on selected models

### API Endpoints
- `GET /api/chat/vision-models` - List available vision models
- `POST /api/chat/send` - Send messages with optional images and vision model

## Best Practices

1. **Model Selection**
   - Use vision-capable models for best results with images
   - Use hybrid processing when you need specific text model capabilities

2. **Image Quality**
   - Upload clear, well-lit images for better analysis
   - Multiple angles can provide more context

3. **Prompting**
   - Be specific about what you want to know about the image
   - Reference specific elements or areas in your questions

4. **Performance**
   - Larger vision models (13b) provide more accurate descriptions
   - Smaller models (7b) are faster but may miss details
   - Hybrid processing adds processing time but enables more flexibility

## Troubleshooting

### "Vision Model Required" Error
- Your selected model doesn't support images
- Solution: Choose a vision-capable model or select a vision model for hybrid processing

### No Vision Models Available
- No vision models are installed in Ollama
- Solution: Pull a vision model using `ollama pull llava:13b` or similar

### Image Upload Fails
- File might be too large or in unsupported format
- Solution: Use smaller images in supported formats (PNG, JPG, etc.)

### Slow Processing
- Vision models require more computational resources
- Solution: Use smaller vision models or ensure adequate GPU/CPU resources
