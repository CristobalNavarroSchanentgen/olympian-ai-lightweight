import { MCPTool, MCPToolCache as MCPToolCacheType, MCPToolCacheStatus, MCPServer, MCPEvent, MCPEventHandler } from '@olympian/shared';
import { logger } from '../utils/logger';
import EventEmitter from 'events';
import { z } from 'zod';

// Validation schema for MCP tool list response
const toolListResponseSchema = z.object({
  tools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    inputSchema: z.record(z.unknown()).optional()
  })).optional()
});

/**
 * MCP Tool Cache following best practices from guidelines
 * 
 * Implements:
 * 1. Efficient tool discovery and local caching
 * 2. Concurrent tool discovery during initialization
 * 3. Cache invalidation and refresh strategies
 * 4. Tool lookup optimization with hit/miss tracking
 * 5. Background cache warming and maintenance
 */
export class MCPToolCache extends EventEmitter {
  private static instance: MCPToolCache;
  private toolCaches: Map<string, MCPToolCacheType> = new Map();
  private globalToolIndex: Map<string, MCPTool[]> = new Map(); // toolName -> array of tools from different servers
  private serverClients: Map<string, any> = new Map(); // serverId -> MCP client instance
  private cacheStats = {
    hits: 0,
    misses: 0,
    totalRequests: 0,
    lastReset: new Date()
  };

  // Cache configuration
  private readonly DEFAULT_CACHE_EXPIRATION = 3600000; // 1 hour
  private readonly BACKGROUND_REFRESH_INTERVAL = 1800000; // 30 minutes
  private readonly MAX_CONCURRENT_DISCOVERIES = 5;
  private readonly CACHE_WARMING_DELAY = 5000; // 5 seconds after startup

  private backgroundRefreshTimer?: NodeJS.Timeout;
  private isWarming = false;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): MCPToolCache {
    if (!MCPToolCache.instance) {
      MCPToolCache.instance = new MCPToolCache();
    }
    return MCPToolCache.instance;
  }

  /**
   * Initialize tool cache with MCP clients
   */
  async initialize(serverClients: Map<string, any>): Promise<void> {
    logger.info('🗄️ [MCP Cache] Initializing tool cache...');

    this.serverClients = new Map(serverClients);

    // Start background refresh timer
    this.startBackgroundRefresh();

    // Warm cache after a delay (let other services stabilize first)
    setTimeout(() => {
      this.warmCache().catch(error => {
        logger.warn('⚠️ [MCP Cache] Cache warming failed:', error);
      });
    }, this.CACHE_WARMING_DELAY);

    logger.info(`✅ [MCP Cache] Tool cache initialized for ${serverClients.size} servers`);
  }

  /**
   * Discover and cache tools from a specific server
   * Following guideline: "Tools are cached locally for efficient access during user interactions"
   */
  async discoverAndCacheTools(serverId: string, client: any): Promise<MCPTool[]> {
    logger.debug(`🔍 [MCP Cache] Discovering tools for server ${serverId}...`);

    try {
      // Request tools from server using client method directly
      const toolsResponse = await client.listTools();

      const tools = toolsResponse.tools || [];
      const mcpTools: MCPTool[] = tools.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || {},
        serverId,
        cachedAt: new Date(),
        usageCount: 0
      }));

      // Cache the tools
      const toolCache: MCPToolCacheType = {
        serverId,
        tools: mcpTools,
        lastUpdated: new Date(),
        expiry: new Date(Date.now() + this.DEFAULT_CACHE_EXPIRATION),
        version: this.generateCacheVersion()
      };

      this.toolCaches.set(serverId, toolCache);

      // Update global tool index
      this.updateGlobalToolIndex(mcpTools);

      logger.info(`✅ [MCP Cache] Cached ${mcpTools.length} tools for server ${serverId}`);

      // Emit cache update event
      this.emitEvent('cache_updated', serverId, { 
        toolCount: mcpTools.length,
        cacheVersion: toolCache.version 
      });

      return mcpTools;

    } catch (error) {
      logger.error(`❌ [MCP Cache] Failed to discover tools for server ${serverId}:`, error);
      
      // Emit cache miss event
      this.emitEvent('cache_miss', serverId, { 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      return [];
    }
  }

  /**
   * Get tools for a specific server (from cache if available)
   */
  async getServerTools(serverId: string): Promise<MCPTool[]> {
    this.cacheStats.totalRequests++;

    // Check cache first
    const cachedTools = this.getCachedTools(serverId);
    if (cachedTools && !this.isCacheExpired(serverId)) {
      this.cacheStats.hits++;
      logger.debug(`💰 [MCP Cache] Cache hit for server ${serverId}: ${cachedTools.length} tools`);

      // Update last used timestamp
      for (const tool of cachedTools) {
        tool.lastUsed = new Date();
      }

      return cachedTools;
    }

    // Cache miss - need to discover tools
    this.cacheStats.misses++;
    logger.debug(`🔍 [MCP Cache] Cache miss for server ${serverId}, discovering tools...`);

    const client = this.serverClients.get(serverId);
    if (!client) {
      logger.warn(`⚠️ [MCP Cache] No client found for server ${serverId}`);
      return [];
    }

    return await this.discoverAndCacheTools(serverId, client);
  }

  /**
   * Get cached tools for a server (without refresh)
   */
  getCachedTools(serverId: string): MCPTool[] | null {
    const cache = this.toolCaches.get(serverId);
    return cache ? cache.tools : null;
  }

  /**
   * Get all available tools from cache (across all servers)
   */
  getAllCachedTools(): MCPTool[] {
    const allTools: MCPTool[] = [];

    for (const cache of this.toolCaches.values()) {
      if (!this.isCacheExpiredByCache(cache)) {
        allTools.push(...cache.tools);
      }
    }

    return allTools;
  }

  /**
   * Find tools by name across all servers
   */
  findToolsByName(toolName: string): MCPTool[] {
    const tools = this.globalToolIndex.get(toolName) || [];
    
    // Filter out expired tools
    return tools.filter(tool => {
      const cache = this.toolCaches.get(tool.serverId);
      return cache && !this.isCacheExpiredByCache(cache);
    });
  }

  /**
   * Find tools by pattern (fuzzy search)
   */
  findToolsByPattern(pattern: string): MCPTool[] {
    const allTools = this.getAllCachedTools();
    const regex = new RegExp(pattern, 'i');

    return allTools.filter(tool => 
      regex.test(tool.name) || regex.test(tool.description)
    );
  }

  /**
   * Get the best tool for a given name (considering server health and priority)
   */
  getBestToolForName(toolName: string, healthyServerIds?: Set<string>): MCPTool | null {
    const tools = this.findToolsByName(toolName);
    
    if (tools.length === 0) {
      return null;
    }

    if (tools.length === 1) {
      return tools[0];
    }

    // Filter by healthy servers if provided
    const candidateTools = healthyServerIds 
      ? tools.filter(tool => healthyServerIds.has(tool.serverId))
      : tools;

    if (candidateTools.length === 0) {
      return tools[0]; // Fallback to any available tool
    }

    // Sort by usage count (most used first) and then by server priority
    candidateTools.sort((a, b) => {
      // First priority: usage count
      const usageDiff = (b.usageCount || 0) - (a.usageCount || 0);
      if (usageDiff !== 0) return usageDiff;

      // Second priority: server priority (would need to be passed in or stored)
      return 0; // For now, just return the first one
    });

    return candidateTools[0];
  }

  /**
   * Update tool usage statistics
   */
  updateToolUsage(serverId: string, toolName: string): void {
    const cache = this.toolCaches.get(serverId);
    if (!cache) return;

    const tool = cache.tools.find(t => t.name === toolName);
    if (tool) {
      tool.usageCount = (tool.usageCount || 0) + 1;
      tool.lastUsed = new Date();
      logger.debug(`📊 [MCP Cache] Updated usage for tool ${toolName}: ${tool.usageCount} uses`);
    }
  }

  /**
   * Invalidate cache for a specific server
   */
  invalidateServerCache(serverId: string): void {
    logger.info(`🗑️ [MCP Cache] Invalidating cache for server ${serverId}`);

    const cache = this.toolCaches.get(serverId);
    if (cache) {
      // Remove tools from global index
      this.removeFromGlobalIndex(cache.tools);
      
      // Remove cache
      this.toolCaches.delete(serverId);

      this.emitEvent('cache_invalidated', serverId, { 
        toolCount: cache.tools.length 
      });
    }
  }

  /**
   * Invalidate all caches
   */
  invalidateAllCaches(): void {
    logger.info('🗑️ [MCP Cache] Invalidating all caches');

    this.toolCaches.clear();
    this.globalToolIndex.clear();

    this.emitEvent('cache_cleared', undefined, { 
      timestamp: new Date() 
    });
  }

  /**
   * Refresh cache for a specific server
   */
  async refreshServerCache(serverId: string): Promise<MCPTool[]> {
    logger.info(`🔄 [MCP Cache] Refreshing cache for server ${serverId}`);

    // Invalidate existing cache
    this.invalidateServerCache(serverId);

    // Rediscover tools
    const client = this.serverClients.get(serverId);
    if (!client) {
      logger.warn(`⚠️ [MCP Cache] No client found for server ${serverId}`);
      return [];
    }

    return await this.discoverAndCacheTools(serverId, client);
  }

  /**
   * Warm cache by discovering tools from all servers
   * Following guideline: "Concurrent tool discovery during client initialization"
   */
  private async warmCache(): Promise<void> {
    if (this.isWarming) {
      logger.debug('🔄 [MCP Cache] Cache warming already in progress');
      return;
    }

    this.isWarming = true;
    logger.info('🔥 [MCP Cache] Warming tool cache...');

    const serverIds = Array.from(this.serverClients.keys());
    const chunks = this.chunkArray(serverIds, this.MAX_CONCURRENT_DISCOVERIES);

    let totalTools = 0;

    for (const chunk of chunks) {
      const discoveryPromises = chunk.map(async serverId => {
        const client = this.serverClients.get(serverId);
        if (client) {
          const tools = await this.discoverAndCacheTools(serverId, client);
          totalTools += tools.length;
          return tools.length;
        }
        return 0;
      });

      await Promise.allSettled(discoveryPromises);
    }

    this.isWarming = false;
    logger.info(`✅ [MCP Cache] Cache warming completed: ${totalTools} tools cached from ${serverIds.length} servers`);
  }

  /**
   * Start background cache refresh
   */
  private startBackgroundRefresh(): void {
    if (this.backgroundRefreshTimer) {
      clearInterval(this.backgroundRefreshTimer);
    }

    this.backgroundRefreshTimer = setInterval(async () => {
      logger.debug('🔄 [MCP Cache] Starting background cache refresh...');
      await this.refreshExpiredCaches();
    }, this.BACKGROUND_REFRESH_INTERVAL);

    logger.debug(`⏰ [MCP Cache] Background refresh scheduled every ${this.BACKGROUND_REFRESH_INTERVAL}ms`);
  }

  /**
   * Refresh expired caches in background
   */
  private async refreshExpiredCaches(): Promise<void> {
    const expiredServerIds: string[] = [];

    for (const [serverId, cache] of this.toolCaches) {
      if (this.isCacheExpiredByCache(cache)) {
        expiredServerIds.push(serverId);
      }
    }

    if (expiredServerIds.length === 0) {
      logger.debug('👍 [MCP Cache] No expired caches found');
      return;
    }

    logger.info(`🔄 [MCP Cache] Refreshing ${expiredServerIds.length} expired caches`);

    // Refresh in chunks to avoid overwhelming servers
    const chunks = this.chunkArray(expiredServerIds, this.MAX_CONCURRENT_DISCOVERIES);

    for (const chunk of chunks) {
      const refreshPromises = chunk.map(serverId => this.refreshServerCache(serverId));
      await Promise.allSettled(refreshPromises);
    }
  }

  /**
   * Check if cache is expired for a server
   */
  private isCacheExpired(serverId: string): boolean {
    const cache = this.toolCaches.get(serverId);
    return cache ? this.isCacheExpiredByCache(cache) : true;
  }

  /**
   * Check if a cache object is expired
   */
  private isCacheExpiredByCache(cache: MCPToolCacheType): boolean {
    return Date.now() > cache.expiry.getTime();
  }

  /**
   * Update global tool index
   */
  private updateGlobalToolIndex(tools: MCPTool[]): void {
    for (const tool of tools) {
      const existingTools = this.globalToolIndex.get(tool.name) || [];
      
      // Remove any existing tool from the same server
      const filteredTools = existingTools.filter(t => t.serverId !== tool.serverId);
      
      // Add new tool
      filteredTools.push(tool);
      
      this.globalToolIndex.set(tool.name, filteredTools);
    }
  }

  /**
   * Remove tools from global index
   */
  private removeFromGlobalIndex(tools: MCPTool[]): void {
    for (const tool of tools) {
      const existingTools = this.globalToolIndex.get(tool.name) || [];
      const filteredTools = existingTools.filter(t => t.serverId !== tool.serverId);
      
      if (filteredTools.length === 0) {
        this.globalToolIndex.delete(tool.name);
      } else {
        this.globalToolIndex.set(tool.name, filteredTools);
      }
    }
  }

  /**
   * Generate cache version string
   */
  private generateCacheVersion(): string {
    return `v${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Get cache status and statistics
   */
  getCacheStatus(): MCPToolCacheStatus {
    let totalTools = 0;
    let expiredCaches = 0;

    for (const cache of this.toolCaches.values()) {
      totalTools += cache.tools.length;
      if (this.isCacheExpiredByCache(cache)) {
        expiredCaches++;
      }
    }

    const hitRate = this.cacheStats.totalRequests > 0 
      ? this.cacheStats.hits / this.cacheStats.totalRequests 
      : 0;

    const missRate = this.cacheStats.totalRequests > 0 
      ? this.cacheStats.misses / this.cacheStats.totalRequests 
      : 0;

    return {
      totalTools,
      cachedTools: totalTools,
      expiredCaches,
      totalServers: this.toolCaches.size,
      lastCacheUpdate: this.getLastCacheUpdate(),
      hitRate,
      missRate
    };
  }

  /**
   * Get last cache update time
   */
  private getLastCacheUpdate(): Date {
    let lastUpdate = new Date(0);

    for (const cache of this.toolCaches.values()) {
      if (cache.lastUpdated > lastUpdate) {
        lastUpdate = cache.lastUpdated;
      }
    }

    return lastUpdate;
  }

  /**
   * Reset cache statistics
   */
  resetCacheStats(): void {
    this.cacheStats = {
      hits: 0,
      misses: 0,
      totalRequests: 0,
      lastReset: new Date()
    };
    logger.info('📊 [MCP Cache] Cache statistics reset');
  }

  /**
   * Add or update server client
   */
  addServerClient(serverId: string, client: any): void {
    this.serverClients.set(serverId, client);
    logger.debug(`➕ [MCP Cache] Added client for server ${serverId}`);
  }

  /**
   * Remove server client and invalidate cache
   */
  removeServerClient(serverId: string): void {
    this.serverClients.delete(serverId);
    this.invalidateServerCache(serverId);
    logger.debug(`➖ [MCP Cache] Removed client for server ${serverId}`);
  }

  /**
   * Stop background processes
   */
  async stop(): Promise<void> {
    logger.info('🛑 [MCP Cache] Stopping tool cache...');

    if (this.backgroundRefreshTimer) {
      clearInterval(this.backgroundRefreshTimer);
      this.backgroundRefreshTimer = undefined;
    }

    this.isWarming = false;

    logger.info('✅ [MCP Cache] Tool cache stopped');
  }

  /**
   * Emit cache events
   */
  private emitEvent(type: string, serverId: string | undefined, data: Record<string, unknown>): void {
    const event: MCPEvent = {
      type: type as any,
      serverId,
      data,
      timestamp: new Date()
    };

    this.emit('cache_event', event);
    this.emit(type, event);
  }

  /**
   * Add event listener for cache events
   */
  onCacheEvent(handler: MCPEventHandler): void {
    this.on('cache_event', handler);
  }

  /**
   * Remove event listener for cache events
   */
  offCacheEvent(handler: MCPEventHandler): void {
    this.off('cache_event', handler);
  }
}
