# Artifact Functionality

This document describes the Claude-inspired artifact functionality implemented in Olympian AI for **subproject 3 (Multi-host deployment)**.

## Overview

The artifact system allows the AI to create interactive, standalone content that appears in a dedicated side panel. This transforms the experience from linear chat to a dynamic workspace where users can view, edit, and interact with AI-generated content.

## Architecture

### Components Structure

```
packages/client/src/
├── components/
│   ├── Artifacts/
│   │   ├── ArtifactPanel.tsx       # Main artifact panel container
│   │   ├── ArtifactHeader.tsx      # Artifact header with controls
│   │   ├── ArtifactViewer.tsx      # Multi-mode content viewer
│   │   ├── ArtifactList.tsx        # List view for multiple artifacts
│   │   └── index.ts                # Component exports
│   └── DivineDialog/
│       ├── index.tsx               # Updated with split layout
│       └── MessageItem.tsx         # Updated with artifact integration
├── stores/
│   └── useArtifactStore.ts         # Artifact state management
├── lib/
│   └── artifactDetection.ts       # Automatic artifact detection
└── ...
```

### Shared Types

```
packages/shared/src/types/
├── artifacts.ts                    # Artifact-specific types
├── chat.ts                         # Extended with artifact metadata
└── index.ts                        # Updated exports
```

## Features

### 1. Split Layout
- **Left Panel**: Conversation display with message history and input
- **Right Panel**: Artifact viewer (toggleable, 384px width)
- **Responsive**: Smooth transitions when opening/closing artifact panel

### 2. Automatic Artifact Detection
The system automatically detects when AI responses should create artifacts based on:
- Code blocks with substantial content (>20 characters)
- HTML documents
- SVG graphics
- JSON data
- CSV tables
- Mermaid diagrams
- Substantial markdown documents (>200 chars with multiple features)

### 3. Artifact Types
- **code**: General code snippets
- **html**: HTML documents with live preview
- **react**: React components (preview placeholder)
- **svg**: SVG graphics with rendering
- **json**: JSON data with formatted display
- **csv**: CSV data with table rendering
- **markdown**: Markdown documents with rendering
- **mermaid**: Mermaid diagrams (preview placeholder)

### 4. View Modes
- **Code View**: Raw source code with syntax highlighting
- **Preview**: Rendered/visual representation
- **Split**: Side-by-side code and preview

### 5. Artifact Management
- **Versioning**: Track changes with automatic version increments
- **Editing**: In-place editing with save/cancel
- **History**: View previous versions (UI ready, backend needed)
- **Actions**: Copy, download, delete artifacts

### 6. Message Integration
- Messages with artifacts show an \"Artifact\" badge
- Artifact preview cards in message threads
- One-click opening in artifact panel

## Usage

### For Users
1. Ask the AI to create code, documents, or visual content
2. If the content qualifies, it automatically appears in the artifact panel
3. Toggle the panel using the chevron button on the right edge
4. Switch between code and preview modes using header buttons
5. Edit artifacts by clicking in the code view
6. Access artifact actions via the menu (⋮) button

### For Developers
1. Artifacts are automatically detected in `DivineDialog/index.tsx`
2. Detection logic is in `lib/artifactDetection.ts`
3. State management through `stores/useArtifactStore.ts`
4. Extend supported types by updating detection patterns

## Implementation Details

### Artifact Detection Logic
The system uses pattern matching to identify artifact-worthy content:

```typescript
// Code blocks with language hints
const codeBlockRegex = /^```(\w+)?\s*([\s\S]*?)```$/m;

// HTML content detection
const htmlTagRegex = /<\/?([a-z][a-z0-9]*)\b[^>]*>/i;

// JSON validation
JSON.parse(content) && content.startsWith('{' | '[')

// CSV detection (comma-separated with consistent column counts)
// SVG detection (<svg> tags)
// Mermaid detection (keywords: graph, flowchart, etc.)
```

### State Management
The artifact store manages:
- Artifacts per conversation
- Selected artifact
- View mode preferences
- Panel visibility
- Version history

### Performance Considerations
- Artifacts are persisted locally using Zustand's persist middleware
- Large artifacts are handled with virtual scrolling in lists
- Preview rendering is sandboxed for security

## Security

### Sandboxing
- HTML previews run in sandboxed iframes
- Script execution controlled via `sandbox` attributes
- SVG content is sanitized before rendering

### Content Validation
- JSON content is validated before parsing
- Code content is escaped in display contexts
- User input is sanitized in edit modes

## Future Enhancements

### Planned Features
1. **React Component Execution**: Live React component preview
2. **Mermaid Rendering**: Integrate mermaid.js for diagram rendering
3. **Collaborative Editing**: Real-time collaborative artifact editing
4. **Export Options**: Export to various formats (PDF, etc.)
5. **Template Library**: Save and reuse artifact templates
6. **Advanced History**: Diff view between versions

### Backend Integration
The frontend is ready for backend integration for:
- Artifact persistence across sessions
- Version history storage
- Collaborative features
- Advanced export options

## Troubleshooting

### Common Issues
1. **Artifacts not detected**: Check if content meets minimum length requirements
2. **Preview not working**: Verify content format and syntax
3. **Panel not opening**: Check artifact store state and panel toggle

### Debug Tips
- Use browser dev tools to inspect artifact store state
- Check console for detection pattern matches
- Verify artifact creation in `useArtifactStore` actions

## API Integration

The artifact system is designed to work with the existing API structure. When artifacts are created:

1. Message metadata includes `artifactId` and `artifactType`
2. Artifacts are stored locally but can be synced to backend
3. Version history is maintained for each artifact
4. Future API endpoints can provide artifact CRUD operations

## Styling

The artifact system uses:
- Consistent design language with the main application
- Dark theme optimized for code viewing
- Responsive design for different screen sizes
- Smooth animations for state transitions

## Testing

Key test areas:
1. Artifact detection accuracy
2. View mode switching
3. Content editing and saving
4. Panel show/hide functionality
5. Cross-browser compatibility for preview modes
