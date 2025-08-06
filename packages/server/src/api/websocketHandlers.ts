import { Socket } from 'socket.io';
import { HILManager } from '../services/HILManager';
import { ToolSelectionService } from '../services/ToolSelectionService';
import { logger } from '../utils/logger';

/**
 * Register HIL (Human-in-the-Loop) handlers
 */
export function registerHILHandlers(socket: Socket): void {
  const hilManager = HILManager.getInstance();
  
  // HIL approval handler
  socket.on('hil:approve', (data: { requestId: string }) => {
    logger.info('HIL approval received for ' + data.requestId);
    hilManager.processUserResponse(data.requestId, true);
    
    socket.emit('hil:response', {
      requestId: data.requestId,
      approved: true
    });
  });
  
  // HIL rejection handler
  socket.on('hil:reject', (data: { requestId: string }) => {
    logger.info('HIL rejection received for ' + data.requestId);
    hilManager.processUserResponse(data.requestId, false);
    
    socket.emit('hil:response', {
      requestId: data.requestId,
      approved: false
    });
  });
  
  // HIL toggle handler
  socket.on('hil:toggle', () => {
    hilManager.toggle();
    const enabled = hilManager.isEnabled();
    logger.info('HIL toggled to ' + (enabled ? 'enabled' : 'disabled'));
    
    socket.emit('hil:status', {
      enabled
    });
  });
  
  // Get HIL status
  socket.on('hil:get_status', () => {
    const stats = hilManager.getStats();
    socket.emit('hil:status', stats);
  });
  
  // Get pending HIL requests
  socket.on('hil:get_pending', () => {
    const pending = hilManager.getPendingRequests();
    socket.emit('hil:pending_requests', {
      requests: pending
    });
  });
}

/**
 * Register Tool Selection handlers
 */
export function registerToolHandlers(socket: Socket): void {
  const toolSelection = ToolSelectionService.getInstance();
  
  // Get tool selection state
  socket.on('tools:get_selection', () => {
    const state = toolSelection.getSelectionState();
    socket.emit('tools:selection_state', {
      data: state
    });
  });
  
  // Toggle individual tool
  socket.on('tools:toggle', (data: { toolName: string }) => {
    const enabled = toolSelection.toggleTool(data.toolName);
    logger.info('Tool ' + data.toolName + ' toggled to ' + (enabled ? 'enabled' : 'disabled'));
    
    socket.emit('tools:toggled', {
      toolName: data.toolName,
      enabled
    });
    
    // Send updated state
    const state = toolSelection.getSelectionState();
    socket.emit('tools:selection_state', {
      data: state
    });
  });
  
  // Toggle all tools for a server
  socket.on('tools:toggle_server', (data: { serverId: string }) => {
    const enabled = toolSelection.toggleServer(data.serverId);
    logger.info('Server ' + data.serverId + ' tools toggled to ' + (enabled ? 'enabled' : 'disabled'));
    
    socket.emit('tools:server_toggled', {
      serverId: data.serverId,
      enabled
    });
    
    // Send updated state
    const state = toolSelection.getSelectionState();
    socket.emit('tools:selection_state', {
      data: state
    });
  });
  
  // Enable all tools
  socket.on('tools:enable_all', () => {
    toolSelection.enableAll();
    logger.info('All tools enabled');
    
    socket.emit('tools:all_enabled');
    
    // Send updated state
    const state = toolSelection.getSelectionState();
    socket.emit('tools:selection_state', {
      data: state
    });
  });
  
  // Disable all tools
  socket.on('tools:disable_all', () => {
    toolSelection.disableAll();
    logger.info('All tools disabled');
    
    socket.emit('tools:all_disabled');
    
    // Send updated state
    const state = toolSelection.getSelectionState();
    socket.emit('tools:selection_state', {
      data: state
    });
  });
  
  // Process selection command (supports ranges)
  socket.on('tools:process_command', (data: { command: string }) => {
    const result = toolSelection.processSelectionCommand(data.command);
    logger.info('Tool selection command processed: ' + result.message);
    
    socket.emit('tools:command_result', result);
    
    if (result.success) {
      // Send updated state
      const state = toolSelection.getSelectionState();
      socket.emit('tools:selection_state', {
        data: state
      });
    }
  });
  
  // Get tool stats
  socket.on('tools:get_stats', () => {
    const stats = toolSelection.getStats();
    socket.emit('tools:stats', stats);
  });
}

/**
 * Register all MCP-related WebSocket handlers
 */
export function registerMCPHandlers(socket: Socket): void {
  registerHILHandlers(socket);
  registerToolHandlers(socket);
  
  registerMCPStatusHandlers(socket);
  logger.info('MCP WebSocket handlers registered for socket ' + socket.id);
}

/**
 * Register MCP Server Status handlers
 */
export function registerMCPStatusHandlers(socket: Socket): void {
  const { MCPManager } = require('../services/MCPManager');
  const mcpManager = MCPManager.getInstance();
  
  // Get MCP server status
  socket.on('mcp:get_status', () => {
    const status = mcpManager.getStatus();
    const servers = Array.from(mcpManager.getServers().entries()).map(([id, server]) => ({
      id,
      name: server.name,
      status: server.status === 'running' ? 'connected' : 
              server.status === 'error' ? 'error' : 'disconnected',
      toolCount: server.tools.length
    }));
    
    socket.emit('mcp:status', { servers });
  });
  
  // Get tools list with enable/disable state
  socket.on('tools:request-list', async () => {
    const toolSelection = ToolSelectionService.getInstance();
    const mcpTools = await mcpManager.listTools();
    const selectionState = toolSelection.getSelectionState();
    
    const servers = Array.from(mcpManager.getServers().entries()).map(([id, server]) => ({
      id,
      name: server.name,
      status: server.status === 'running' ? 'connected' : 'disconnected',
      tools: server.tools.map((tool: any) => ({
        id: tool.name,
        name: tool.name,
        description: tool.description,
        enabled: selectionState.servers.find(s => s.id === id)?.tools.find(t => t.name === tool.name)?.enabled || false
      }))
    }));
    
    socket.emit('tools:list', { servers });
  });
  
  // Enable specific tool
  socket.on('tools:enable', (data: { toolId: string }) => {
    const toolSelection = ToolSelectionService.getInstance();
    const enabled = toolSelection.toggleTool(data.toolId);
    if (!enabled) {
      // Toggle again to ensure it's enabled
      toolSelection.toggleTool(data.toolId);
    }
    socket.emit('tools:updated', { toolId: data.toolId, enabled: true });
  });
  
  // Disable specific tool  
  socket.on('tools:disable', (data: { toolId: string }) => {
    const toolSelection = ToolSelectionService.getInstance();
    const enabled = toolSelection.toggleTool(data.toolId);
    if (enabled) {
      // Toggle again to ensure it's disabled
      toolSelection.toggleTool(data.toolId);
    }
    socket.emit('tools:updated', { toolId: data.toolId, enabled: false });
  });
  
  // Toggle server tools
  socket.on('tools:server:toggle', (data: { serverId: string, enabled: boolean }) => {
    const toolSelection = ToolSelectionService.getInstance();
    toolSelection.toggleServer(data.serverId);
    socket.emit('tools:server:updated', { serverId: data.serverId, enabled: data.enabled });
  });
}
