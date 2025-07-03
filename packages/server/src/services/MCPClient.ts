import { 
  MCPServer, 
  MCPTool, 
  MCPInvokeRequest, 
  MCPInvokeResponse, 
  MCPProtocolNegotiation,
  MCPSession,
  MCPFallbackStrategy,
  MCPArgumentValidation,
  MCPMetrics,
  MCPEvent,
  MCPEventHandler,
  MCPError,
  MCPErrorType
} from '@olympian/shared';

import { logger } from '../utils/logger';
import EventEmitter from 'events';

/**
 * Legacy HTTP-based MCP Client Service - DEPRECATED FOR SUBPROJECT 3
 * 
 * ⚠️  WARNING: This HTTP transport implementation is NOT compatible with subproject 3
 * ⚠️  Subproject 3 MUST use MCPClientStdio with npx subprocess execution
 * 
 * This legacy implementation is maintained only for subprojects 1 & 2 compatibility.
 * The new architecture requires:
 * 1. No HTTP/SSE transport
 * 2. No container-based MCP servers  
 * 3. Use npx to launch MCP servers as child processes
 * 4. Stdio transport only
 * 
 * For subproject 3, use MCPClientStdio instead.
 */
export class MCPClient extends EventEmitter {
  private static instance: MCPClient;
  
  private initialized: boolean = false;

  // Deployment mode validation
  private readonly currentSubproject: string;
  private readonly isSubproject3: boolean;

  // Configuration
  private readonly CLIENT_INFO = {
    name: 'olympian-legacy-http-client',
    version: '1.0.0'
  };

  private constructor() {
    super();
    this.setMaxListeners(50);
    
    // Detect current subproject from environment
    this.currentSubproject = process.env.SUBPROJECT || '1';
    this.isSubproject3 = this.currentSubproject === '3' || 
                        process.env.DEPLOYMENT_MODE === 'docker-multi-host';
    
    // Block initialization for subproject 3
    if (this.isSubproject3) {
      logger.error('❌ [MCP Client] FATAL: HTTP MCP Client is DEPRECATED and NOT SUPPORTED in subproject 3');
      logger.error('❌ [MCP Client] Subproject 3 MUST use MCPClientStdio with npx subprocess execution');
      logger.error('❌ [MCP Client] The new architecture uses stdio transport via child processes');
      throw new Error(
        'HTTP MCP Client is not supported in subproject 3. Use MCPClientStdio instead. ' +
        'Subproject 3 requires npx subprocess execution with stdio transport only.'
      );
    }

    logger.warn('⚠️ [MCP Client] Using LEGACY HTTP transport for subproject ' + this.currentSubproject);
    logger.warn('⚠️ [MCP Client] Consider migrating to stdio transport (MCPClientStdio) for better performance');
  }

  /**
   * Get singleton instance - BLOCKED for subproject 3
   */
  static getInstance(): MCPClient {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient();
    }
    return MCPClient.instance;
  }

  /**
   * Initialize MCP client service - BLOCKED for subproject 3
   */
  async initialize(servers?: MCPServer[]): Promise<void> {
    if (this.isSubproject3) {
      throw new Error(
        'HTTP MCP Client cannot be initialized in subproject 3. ' +
        'Use MCPClientStdio.getInstance().initialize() instead. ' +
        'Subproject 3 requires npx subprocess execution with stdio transport.'
      );
    }

    if (this.initialized) {
      logger.warn('⚠️ [MCP Client] Already initialized, skipping...');
      return;
    }

    // For subprojects 1 & 2, we would implement HTTP transport here
    // But since the focus is on subproject 3, this is left as a placeholder
    throw new Error(
      'HTTP MCP Client implementation has been removed in favor of stdio transport. ' +
      'Use MCPClientStdio for all subprojects. HTTP transport is deprecated.'
    );
  }

  /**
   * Get health statistics - Returns empty for legacy client
   */
  getHealthStats(): { total: number; healthy: number; unhealthy: number } {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().getHealthStats() for subproject 3');
    }
    
    return { total: 0, healthy: 0, unhealthy: 0 };
  }

  /**
   * Cleanup MCP client service
   */
  async cleanup(): Promise<void> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().cleanup() for subproject 3');
    }

    logger.info('🧹 [MCP Client] Cleaning up legacy HTTP MCP client service...');
    this.initialized = false;
    logger.info('✅ [MCP Client] Legacy HTTP MCP client service cleaned up');
  }

  /**
   * List tools from a specific server
   */
  async listTools(serverId: string): Promise<MCPTool[]> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().listTools() for subproject 3');
    }
    
    throw new Error('HTTP transport not implemented. Use MCPClientStdio instead.');
  }

  /**
   * Invoke MCP tool
   */
  async invokeTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().invokeTool() for subproject 3');
    }
    
    throw new Error('HTTP transport not implemented. Use MCPClientStdio instead.');
  }

  // Legacy methods for backward compatibility - all blocked for subproject 3

  async addServer(server: Omit<MCPServer, 'id' | 'status'>): Promise<MCPServer> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().addServer() for subproject 3');
    }
    
    throw new Error('HTTP transport not implemented. Use MCPClientStdio instead.');
  }

  async removeServer(serverId: string): Promise<void> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().removeServer() for subproject 3');
    }
    
    throw new Error('HTTP transport not implemented. Use MCPClientStdio instead.');
  }

  async startServer(serverId: string): Promise<void> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().startServer() for subproject 3');
    }
    
    throw new Error('HTTP transport not implemented. Use MCPClientStdio instead.');
  }

  async stopServer(serverId: string): Promise<void> {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().stopServer() for subproject 3');
    }
    
    throw new Error('HTTP transport not implemented. Use MCPClientStdio instead.');
  }

  getServers(): MCPServer[] {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().getServers() for subproject 3');
    }
    
    return [];
  }

  getServer(serverId: string): MCPServer | undefined {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().getServer() for subproject 3');
    }
    
    return undefined;
  }

  /**
   * Get comprehensive status and metrics
   */
  getStatus(): {
    servers: MCPServer[];
    health: any;
    cache: any;
    metrics: MCPMetrics;
    sessions: MCPSession[];
    deploymentMode: string;
  } {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().getStatus() for subproject 3');
    }

    return {
      servers: [],
      health: { status: 'legacy_client_deprecated' },
      cache: { status: 'not_available' },
      metrics: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        cacheHitRate: 0,
        uptime: 0,
        activeConnections: 0,
        serverMetrics: {},
        requestsPerMinute: 0,
        errorsPerMinute: 0,
        lastUpdated: new Date()
      },
      sessions: [],
      deploymentMode: 'legacy-http-deprecated'
    };
  }

  /**
   * Shutdown gracefully (alias for cleanup)
   */
  async shutdown(): Promise<void> {
    await this.cleanup();
  }

  /**
   * Add event listener for MCP events
   */
  onMCPEvent(handler: MCPEventHandler): void {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().onMCPEvent() for subproject 3');
    }
    
    this.on('mcp_event', handler);
  }

  /**
   * Remove event listener for MCP events
   */
  offMCPEvent(handler: MCPEventHandler): void {
    if (this.isSubproject3) {
      throw new Error('Use MCPClientStdio.getInstance().offMCPEvent() for subproject 3');
    }
    
    this.off('mcp_event', handler);
  }
}

// Export singleton instance for legacy compatibility
export const MCPClientService = MCPClient;
