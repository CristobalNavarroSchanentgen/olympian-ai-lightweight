import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { WebSocketService } from './WebSocketService';

interface HILRequest {
  id: string;
  toolName: string;
  arguments: any;
  serverId: string;
  timestamp: Date;
  status: 'pending' | 'approved' | 'rejected' | 'timeout';
}

/**
 * Human-in-the-Loop Manager for tool execution approval
 * Based on MCP Client for Ollama's HIL implementation
 */
export class HILManager extends EventEmitter {
  private static instance: HILManager;
  private enabled: boolean = true; // HIL enabled by default for safety
  private pendingRequests = new Map<string, HILRequest>();
  private ws: WebSocketService | null = null;
  private readonly TIMEOUT_MS = 30000; // 30 second timeout
  
  private constructor() {
    super();
    // WebSocketService will be set during initialization
  }
  
  static getInstance(): HILManager {
    if (!HILManager.instance) {
      HILManager.instance = new HILManager();
    }
    return HILManager.instance;
  }
  
  /**
   * Initialize with WebSocket service
   */
  initialize(ws: WebSocketService): void {
    this.ws = ws;
    logger.info('🛡️ HIL Manager initialized');
  }
  
  /**
   * Request user confirmation for tool execution
   */
  async requestConfirmation(params: {
    toolName: string;
    arguments: any;
    serverId: string;
  }): Promise<boolean> {
    if (!this.enabled) {
      return true; // Auto-approve if HIL is disabled
    }
    
    const requestId = `hil_${Date.now()}_${Math.random()}`;
    const request: HILRequest = {
      id: requestId,
      toolName: params.toolName,
      arguments: params.arguments,
      serverId: params.serverId,
      timestamp: new Date(),
      status: 'pending'
    };
    
    this.pendingRequests.set(requestId, request);
    
    // Send to WebSocket clients if available
    if (this.ws) {
      this.ws.broadcast('hil:request', {
        id: requestId,
        toolName: params.toolName,
        arguments: params.arguments,
        serverId: params.serverId
      });
    }
    
    logger.info(`🛡️ HIL request ${requestId} for ${params.toolName}`);
    
    // Wait for response with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        request.status = 'timeout';
        this.pendingRequests.delete(requestId);
        logger.warn(`⏱️ HIL request ${requestId} timed out`);
        resolve(false); // Reject on timeout for safety
      }, this.TIMEOUT_MS);
      
      const checkResponse = setInterval(() => {
        const req = this.pendingRequests.get(requestId);
        if (!req || req.status === 'pending') return;
        
        clearInterval(checkResponse);
        clearTimeout(timeout);
        
        const approved = req.status === 'approved';
        this.pendingRequests.delete(requestId);
        
        logger.info(`✅ HIL request ${requestId} ${approved ? 'approved' : 'rejected'}`);
        resolve(approved);
      }, 100);
    });
  }
  
  /**
   * Process user response to HIL request
   */
  processUserResponse(requestId: string, approved: boolean): void {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      logger.warn(`HIL request ${requestId} not found`);
      return;
    }
    
    request.status = approved ? 'approved' : 'rejected';
    
    // Notify clients
    if (this.ws) {
      this.ws.broadcast('hil:response', {
        id: requestId,
        approved,
        toolName: request.toolName
      });
    }
  }
  
  /**
   * Toggle HIL on/off
   */
  toggle(): void {
    this.enabled = !this.enabled;
    logger.info(`HIL ${this.enabled ? 'enabled' : 'disabled'}`);
    
    if (this.ws) {
      this.ws.broadcast('hil:status', {
        enabled: this.enabled
      });
    }
  }
  
  isEnabled(): boolean {
    return this.enabled;
  }
  
  /**
   * Set HIL enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`HIL set to ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Get pending requests
   */
  getPendingRequests(): HILRequest[] {
    return Array.from(this.pendingRequests.values())
      .filter(r => r.status === 'pending');
  }
  
  /**
   * Clear all pending requests
   */
  clearPendingRequests(): void {
    for (const request of this.pendingRequests.values()) {
      if (request.status === 'pending') {
        request.status = 'rejected';
      }
    }
    this.pendingRequests.clear();
    logger.info('🧹 Cleared all pending HIL requests');
  }
  
  /**
   * Get statistics
   */
  getStats(): {
    enabled: boolean;
    pendingCount: number;
    timeoutMs: number;
  } {
    return {
      enabled: this.enabled,
      pendingCount: this.getPendingRequests().length,
      timeoutMs: this.TIMEOUT_MS
    };
  }
}
