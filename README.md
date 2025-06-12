# Olympian AI Lightweight

A minimalist MCP client application focused on seamless Ollama integration with automatic connection discovery and intelligent request handling.

## Features

- **MCP Client**: Full MCP client implementation with tool discovery and invocation
- **Plugs (Auto-Discovery)**: Automatic scanning for Ollama instances, MCP servers, and MongoDB databases
- **MCP Config Panel**: Visual editor for MCP configuration and tool descriptions
- **Divine Dialog**: Advanced chat interface with model state indicators, image support, and persistent history
- **Ollama Streamliner**: Intelligent request handling based on model capabilities

## Tech Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: MongoDB (local or remote)
- **Communication**: WebSockets for real-time streaming
- **MCP SDK**: Official MCP TypeScript SDK

## Prerequisites

- Node.js 18+
- MongoDB (local or remote instance)
- Ollama installed and running
- MCP servers (optional)

## Installation

```bash
# Clone the repository
git clone https://github.com/CristobalNavarroSchanentgen/olympian-ai-lightweight.git
cd olympian-ai-lightweight

# Install dependencies
npm install

# Start development servers
npm run dev
```

## Usage

1. **Start the application**: Run `npm run dev` to start both frontend and backend
2. **Auto-discover connections**: The app will automatically scan for Ollama, MCP servers, and MongoDB
3. **Configure MCP**: Use the MCP Config panel to set up your MCP servers and tools
4. **Start chatting**: Select a model in Divine Dialog and start conversing

## Project Structure

```
olympian-ai-lightweight/
├── packages/
│   ├── client/          # React frontend
│   ├── server/          # Express backend
│   └── shared/          # Shared types and utilities
├── docs/                # Documentation
└── scripts/             # Build and utility scripts
```

## Configuration

The application stores configuration in `~/.olympian-ai-lite/`:
- `mcp_config.json` - MCP server configurations
- `tool_overrides.json` - Custom tool descriptions
- `backups/` - Configuration backups

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.
