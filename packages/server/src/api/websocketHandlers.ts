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
  
  logger.info('MCP WebSocket handlers registered for socket ' + socket.id);
}
