import { MCPServer, MCPHealthCheck, MCPHealthStatus, MCPError, MCPEvent, MCPEventHandler } from '@olympian/shared';
import { logger } from '../utils/logger';
import EventEmitter from 'events';

/**
 * MCP Health Checker following best practices from guidelines
 * 
 * Implements:
 * 1. Proactive health checking of MCP servers
 * 2. Exponential backoff for failed connections
 * 3. Health status tracking and reporting
 * 4. Automatic failover detection
 * 5. Connection testing and validation
 */
export class MCPHealthChecker extends EventEmitter {
  private static instance: MCPHealthChecker;
  private healthChecks: Map<string, MCPHealthCheck> = new Map();
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;
  private servers: Map<string, MCPServer> = new Map();

  // Health check configuration
  private readonly DEFAULT_HEALTH_CHECK_INTERVAL = 300000; // 5 minutes
  private readonly MIN_HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
  private readonly MAX_HEALTH_CHECK_INTERVAL = 3600000; // 1 hour
  private readonly MAX_CONSECUTIVE_FAILURES = 5;
  private readonly HEALTH_CHECK_TIMEOUT = 10000; // 10 seconds

  private constructor() {
    super();
    this.setMaxListeners(50); // Allow multiple listeners
  }

  static getInstance(): MCPHealthChecker {
    if (!MCPHealthChecker.instance) {
      MCPHealthChecker.instance = new MCPHealthChecker();
    }
    return MCPHealthChecker.instance;
  }

  /**
   * Initialize health checker with servers
   */
  async initialize(servers: MCPServer[]): Promise<void> {
    logger.info('🏥 [MCP Health] Initializing health checker...');

    // Store servers for reference
    for (const server of servers) {
      this.servers.set(server.id, server);
    }

    // Initialize health check records
    for (const server of servers) {
      const healthCheck: MCPHealthCheck = {
        serverId: server.id,
        timestamp: new Date(),
        status: 'healthy', // Start optimistic
        consecutiveFailures: 0
      };
      this.healthChecks.set(server.id, healthCheck);
    }

    // Start health checking
    await this.startHealthChecking();

    // Perform initial health checks
    await this.performInitialHealthChecks();

    logger.info(`✅ [MCP Health] Health checker initialized for ${servers.length} servers`);
  }

  /**
   * Start background health checking
   */
  private async startHealthChecking(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    logger.info('🔄 [MCP Health] Starting background health checks...');

    for (const [serverId, server] of this.servers) {
      this.scheduleHealthCheck(serverId);
    }
  }

  /**
   * Schedule health check for a specific server
   */
  private scheduleHealthCheck(serverId: string): void {
    const server = this.servers.get(serverId);
    if (!server) return;

    // Clear existing interval
    const existingInterval = this.healthCheckIntervals.get(serverId);
    if (existingInterval) {
      clearTimeout(existingInterval);
    }

    // Calculate interval with exponential backoff for failing servers
    const healthCheck = this.healthChecks.get(serverId);
    const baseInterval = server.healthCheckInterval || this.DEFAULT_HEALTH_CHECK_INTERVAL;
    const backoffMultiplier = healthCheck?.consecutiveFailures || 0;
    const interval = Math.min(
      baseInterval * Math.pow(1.5, backoffMultiplier),
      this.MAX_HEALTH_CHECK_INTERVAL
    );

    // Schedule next health check
    const timeoutId = setTimeout(async () => {
      await this.performHealthCheck(serverId);
      this.scheduleHealthCheck(serverId); // Reschedule
    }, Math.max(interval, this.MIN_HEALTH_CHECK_INTERVAL));

    this.healthCheckIntervals.set(serverId, timeoutId);
    
    logger.debug(`⏰ [MCP Health] Scheduled health check for ${server.name} in ${interval}ms`);
  }

  /**
   * Perform initial health checks for all servers
   */
  private async performInitialHealthChecks(): Promise<void> {
    logger.info('🔍 [MCP Health] Performing initial health checks...');

    const healthCheckPromises = Array.from(this.servers.keys()).map(serverId => 
      this.performHealthCheck(serverId)
    );

    await Promise.allSettled(healthCheckPromises);
    
    const status = this.getOverallHealthStatus();
    logger.info(`📊 [MCP Health] Initial health checks completed: ${status.overall.healthyServers}/${status.overall.totalServers} servers healthy`);
  }

  /**
   * Perform health check for a specific server
   * Following guideline: "test endpoints and validate server responsiveness"
   */
  async performHealthCheck(serverId: string): Promise<MCPHealthCheck> {
    const server = this.servers.get(serverId);
    if (!server) {
      throw new Error(`Server ${serverId} not found`);
    }

    const startTime = Date.now();
    const currentCheck = this.healthChecks.get(serverId) || {
      serverId,
      timestamp: new Date(),
      status: 'unknown' as const,
      consecutiveFailures: 0
    };

    try {
      logger.debug(`🏥 [MCP Health] Checking health of ${server.name}...`);

      // Perform health check based on transport type
      const isHealthy = await this.checkServerHealth(server);
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        // Server is healthy
        const healthCheck: MCPHealthCheck = {
          serverId,
          timestamp: new Date(),
          status: 'healthy',
          responseTime,
          consecutiveFailures: 0,
          lastSuccessfulCheck: new Date()
        };

        // Reset consecutive failures if this is a recovery
        if (currentCheck.consecutiveFailures > 0) {
          logger.info(`✅ [MCP Health] Server ${server.name} recovered after ${currentCheck.consecutiveFailures} failures`);
          this.emitEvent('server_recovered', serverId, { 
            previousFailures: currentCheck.consecutiveFailures,
            responseTime 
          });
        }

        this.healthChecks.set(serverId, healthCheck);
        return healthCheck;
      } else {
        throw new Error('Health check failed - server not responding correctly');
      }

    } catch (error) {
      // Server failed health check
      const healthCheck: MCPHealthCheck = {
        serverId,
        timestamp: new Date(),
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        consecutiveFailures: currentCheck.consecutiveFailures + 1,
        lastSuccessfulCheck: currentCheck.lastSuccessfulCheck
      };

      this.healthChecks.set(serverId, healthCheck);

      // Log health check failure
      if (healthCheck.consecutiveFailures === 1) {
        logger.warn(`⚠️ [MCP Health] Server ${server.name} health check failed: ${healthCheck.error}`);
      } else if (healthCheck.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        logger.error(`❌ [MCP Health] Server ${server.name} has failed ${healthCheck.consecutiveFailures} consecutive health checks`);
      }

      // Update server status if needed
      if (healthCheck.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES && server.status !== 'error') {
        server.status = 'error';
        server.lastError = healthCheck.error;
        this.emitEvent('server_failed', serverId, { 
          consecutiveFailures: healthCheck.consecutiveFailures,
          error: healthCheck.error 
        });
      }

      return healthCheck;
    }
  }

  /**
   * Check server health based on transport type
   */
  private async checkServerHealth(server: MCPServer): Promise<boolean> {
    switch (server.transport) {
      case 'http':
      case 'streamable_http':
        return await this.checkHttpHealth(server);
      
      case 'sse':
        return await this.checkSSEHealth(server);
      
      case 'stdio':
        return await this.checkStdioHealth(server);
      
      default:
        logger.warn(`⚠️ [MCP Health] Unknown transport type: ${server.transport}`);
        return false;
    }
  }

  /**
   * Check HTTP/Streamable HTTP server health
   */
  private async checkHttpHealth(server: MCPServer): Promise<boolean> {
    if (!server.endpoint) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

    try {
      // Try health endpoint first
      const healthUrl = new URL('/health', server.endpoint).href;
      let response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Olympian-AI-MCP-Client/1.0',
          'Accept': 'application/json'
        }
      });

      // If health endpoint doesn't exist, try main endpoint
      if (!response.ok && response.status === 404) {
        response = await fetch(server.endpoint, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Olympian-AI-MCP-Client/1.0'
          }
        });
      }

      return response.ok || response.status === 405; // 405 Method Not Allowed is acceptable

    } catch (error) {
      logger.debug(`🏥 [MCP Health] HTTP health check failed for ${server.name}:`, error);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check SSE server health
   */
  private async checkSSEHealth(server: MCPServer): Promise<boolean> {
    if (!server.endpoint) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.HEALTH_CHECK_TIMEOUT);

    try {
      const response = await fetch(server.endpoint, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Olympian-AI-MCP-Client/1.0',
          'Accept': 'text/event-stream'
        }
      });

      return response.ok || response.status === 405;

    } catch (error) {
      logger.debug(`🏥 [MCP Health] SSE health check failed for ${server.name}:`, error);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Check stdio server health (basic command validation)
   */
  private async checkStdioHealth(server: MCPServer): Promise<boolean> {
    // For stdio servers, we can only validate that the command exists
    // We can't actually test connectivity without starting the process
    
    if (!server.command) {
      return false;
    }

    // Basic command validation (check if it exists in PATH)
    try {
      const { execSync } = await import('child_process');
      const command = process.platform === 'win32' ? 'where' : 'which';
      execSync(`${command} ${server.command.split(' ')[0]}`, { stdio: 'ignore' });
      return true;
    } catch (error) {
      logger.debug(`🏥 [MCP Health] Stdio health check failed for ${server.name}: command not found`);
      return false;
    }
  }

  /**
   * Get health status for a specific server
   */
  getServerHealth(serverId: string): MCPHealthCheck | undefined {
    return this.healthChecks.get(serverId);
  }

  /**
   * Get overall health status for all servers
   */
  getOverallHealthStatus(): MCPHealthStatus {
    const servers: Record<string, MCPHealthCheck> = {};
    let healthyCount = 0;
    let totalCount = 0;

    for (const [serverId, healthCheck] of this.healthChecks) {
      servers[serverId] = healthCheck;
      totalCount++;
      if (healthCheck.status === 'healthy') {
        healthyCount++;
      }
    }

    const score = totalCount > 0 ? Math.round((healthyCount / totalCount) * 100) : 0;

    return {
      overall: {
        healthy: healthyCount === totalCount && totalCount > 0,
        score,
        totalServers: totalCount,
        healthyServers: healthyCount
      },
      servers,
      lastUpdated: new Date()
    };
  }

  /**
   * Get healthy servers for load balancing
   */
  getHealthyServers(): MCPServer[] {
    const healthyServers: MCPServer[] = [];

    for (const [serverId, healthCheck] of this.healthChecks) {
      if (healthCheck.status === 'healthy') {
        const server = this.servers.get(serverId);
        if (server) {
          healthyServers.push(server);
        }
      }
    }

    // Sort by priority (higher priority first)
    return healthyServers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Check if a server is healthy
   */
  isServerHealthy(serverId: string): boolean {
    const healthCheck = this.healthChecks.get(serverId);
    return healthCheck?.status === 'healthy';
  }

  /**
   * Force health check for a specific server
   */
  async forceHealthCheck(serverId: string): Promise<MCPHealthCheck> {
    logger.info(`🔍 [MCP Health] Forcing health check for server ${serverId}`);
    return await this.performHealthCheck(serverId);
  }

  /**
   * Add a new server to health checking
   */
  async addServer(server: MCPServer): Promise<void> {
    logger.info(`➕ [MCP Health] Adding server ${server.name} to health monitoring`);

    this.servers.set(server.id, server);

    const healthCheck: MCPHealthCheck = {
      serverId: server.id,
      timestamp: new Date(),
      status: 'unknown',
      consecutiveFailures: 0
    };
    this.healthChecks.set(server.id, healthCheck);

    // Perform immediate health check
    await this.performHealthCheck(server.id);

    // Schedule ongoing health checks
    if (this.isRunning) {
      this.scheduleHealthCheck(server.id);
    }
  }

  /**
   * Remove a server from health checking
   */
  removeServer(serverId: string): void {
    logger.info(`➖ [MCP Health] Removing server ${serverId} from health monitoring`);

    // Clear health check interval
    const interval = this.healthCheckIntervals.get(serverId);
    if (interval) {
      clearTimeout(interval);
      this.healthCheckIntervals.delete(serverId);
    }

    // Remove health check record
    this.healthChecks.delete(serverId);
    this.servers.delete(serverId);
  }

  /**
   * Stop health checking
   */
  async stop(): Promise<void> {
    logger.info('🛑 [MCP Health] Stopping health checker...');

    this.isRunning = false;

    // Clear all intervals
    for (const [serverId, interval] of this.healthCheckIntervals) {
      clearTimeout(interval);
    }
    this.healthCheckIntervals.clear();

    logger.info('✅ [MCP Health] Health checker stopped');
  }

  /**
   * Get health check statistics
   */
  getHealthCheckStats(): {
    totalServers: number;
    healthyServers: number;
    unhealthyServers: number;
    averageResponseTime: number;
    totalFailures: number;
    isRunning: boolean;
  } {
    let totalFailures = 0;
    let totalResponseTime = 0;
    let responseTimeCount = 0;
    let unhealthyCount = 0;

    for (const healthCheck of this.healthChecks.values()) {
      totalFailures += healthCheck.consecutiveFailures;
      
      if (healthCheck.status === 'unhealthy') {
        unhealthyCount++;
      }
      
      if (healthCheck.responseTime) {
        totalResponseTime += healthCheck.responseTime;
        responseTimeCount++;
      }
    }

    return {
      totalServers: this.servers.size,
      healthyServers: this.servers.size - unhealthyCount,
      unhealthyServers: unhealthyCount,
      averageResponseTime: responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0,
      totalFailures,
      isRunning: this.isRunning
    };
  }

  /**
   * Emit events for health check updates
   */
  private emitEvent(type: string, serverId: string, data: Record<string, unknown>): void {
    const event: MCPEvent = {
      type: type as any,
      serverId,
      data,
      timestamp: new Date()
    };

    this.emit('health_event', event);
    this.emit(type, event);
  }

  /**
   * Add event listener for health events
   */
  onHealthEvent(handler: MCPEventHandler): void {
    this.on('health_event', handler);
  }

  /**
   * Remove event listener for health events
   */
  offHealthEvent(handler: MCPEventHandler): void {
    this.off('health_event', handler);
  }
}
