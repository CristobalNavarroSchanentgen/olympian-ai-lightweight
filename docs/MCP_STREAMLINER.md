# MCP Streamliner Documentation

## Overview

The MCPStreamliner is a minimal tool use integration layer for Subproject 3 (Multi-host deployment) that handles MCP (Model Context Protocol) tool integration with a focus on simplicity, functionality, and observability.

## Architecture

### Core Components

1. **MCPStreamliner** - Central service for tool registry and execution
2. **ToolEnabledOllamaStreamliner** - Extends OllamaStreamliner with tool capabilities

### Key Features

1. Tool Registry - Stores tool descriptions and argument schemas
2. Model Integration - Routes tool calls from models to appropriate MCP servers  
3. Observability - Structured logging with correlation IDs

## Configuration

All MCP communication is via stdio exclusively. Servers run as subprocesses within the main container.

## Usage

### Debug Endpoints
- GET /api/mcp/debug/tool-calls?limit=10 - Get recent tool calls
- GET /api/mcp/debug/tool-registry - Get current tool registry

## Design Principles

1. Simplicity First - Minimal abstractions
2. Functionality and Observability - Everything is logged
3. Stdio-Only Communication - No network protocols
