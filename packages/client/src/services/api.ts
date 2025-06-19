import axios, { AxiosInstance } from 'axios';
import {
  ApiResponse,
  Connection,
  ConnectionTestResult,
  ScanResult,
  MCPServer,
  MCPTool,
  MCPInvokeRequest,
  MCPInvokeResponse,
  Conversation,
  Message,
  ModelCapability,
} from '@olympian/shared';

interface ProgressiveUpdate {
  type: 'model_processed' | 'vision_model_found' | 'loading_complete' | 'error' | 'initial_state';
  model?: string;
  capability?: ModelCapability;
  isVisionModel?: boolean;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  state?: any;
  error?: string;
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
      // INCREASED DEFAULT TIMEOUT for model capability requests
      timeout: 60000, // 60 seconds (increased from 30 seconds)
    });

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.data?.error) {
          throw new Error(error.response.data.error.message);
        }
        throw error;
      }
    );
  }

  // Connections API
  async getConnections(): Promise<Connection[]> {
    const { data } = await this.client.get<ApiResponse<Connection[]>>('/connections');
    return data.data || [];
  }

  async createConnection(connection: Omit<Connection, '_id' | 'createdAt' | 'updatedAt' | 'isManual'>): Promise<Connection> {
    const { data } = await this.client.post<ApiResponse<Connection>>('/connections', connection);
    return data.data!;
  }

  async updateConnection(id: string, updates: Partial<Connection>): Promise<Connection> {
    const { data } = await this.client.put<ApiResponse<Connection>>(`/connections/${id}`, updates);
    return data.data!;
  }

  async deleteConnection(id: string): Promise<void> {
    await this.client.delete(`/connections/${id}`);
  }

  async testConnection(id: string): Promise<ConnectionTestResult> {
    const { data } = await this.client.post<ApiResponse<ConnectionTestResult>>(`/connections/${id}/test`);
    return data.data!;
  }

  async scanConnections(types?: string[]): Promise<ScanResult[]> {
    const { data } = await this.client.post<ApiResponse<ScanResult[]>>('/connections/scan', { types });
    return data.data || [];
  }

  // MCP API
  async getMCPServers(): Promise<MCPServer[]> {
    const { data } = await this.client.get<ApiResponse<MCPServer[]>>('/mcp/servers');
    return data.data || [];
  }

  async addMCPServer(server: Omit<MCPServer, 'id' | 'status'>): Promise<MCPServer> {
    const { data } = await this.client.post<ApiResponse<MCPServer>>('/mcp/servers', server);
    return data.data!;
  }

  async removeMCPServer(id: string): Promise<void> {
    await this.client.delete(`/mcp/servers/${id}`);
  }

  async startMCPServer(id: string): Promise<void> {
    await this.client.post(`/mcp/servers/${id}/start`);
  }

  async stopMCPServer(id: string): Promise<void> {
    await this.client.post(`/mcp/servers/${id}/stop`);
  }

  async getMCPTools(serverId: string): Promise<MCPTool[]> {
    const { data } = await this.client.get<ApiResponse<MCPTool[]>>(`/mcp/servers/${serverId}/tools`);
    return data.data || [];
  }

  async invokeMCPTool(request: MCPInvokeRequest): Promise<MCPInvokeResponse> {
    const { data } = await this.client.post<ApiResponse<MCPInvokeResponse>>('/mcp/invoke', request);
    return data.data!;
  }

  // Chat API
  async sendMessage(params: {
    message: string;
    model: string;
    visionModel?: string;
    conversationId?: string;
    images?: string[];
  }): Promise<{
    conversation: Conversation;
    conversationId: string;
    message: string;
    metadata: any;
  }> {
    // Match nginx timeout configuration: 300s for vision processing
    const hasImages = params.images && params.images.length > 0;
    const timeout = hasImages ? 300000 : 60000; // 300s (nginx match) for vision, 60s for text
    
    console.log(`🌐 [API] sendMessage with ${hasImages ? 'images' : 'text only'}, timeout: ${timeout}ms (${timeout/1000}s)`);
    
    const { data } = await this.client.post<ApiResponse<{
      conversation: Conversation;
      conversationId: string;
      message: string;
      metadata: any;
    }>>('/chat/send', params, {
      timeout,
      // Add progress monitoring for long requests
      onUploadProgress: hasImages ? (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
        console.log(`📤 Upload progress: ${percentCompleted}%`);
      } : undefined,
    });
    return data.data!;
  }

  async getConversations(page = 1, limit = 20): Promise<{ conversations: Conversation[]; total: number }> {
    const { data } = await this.client.get<ApiResponse<Conversation[]> & { total: number }>(
      `/chat/conversations?page=${page}&limit=${limit}`
    );
    return { conversations: data.data || [], total: data.total };
  }

  async getConversation(id: string): Promise<Conversation> {
    const { data } = await this.client.get<ApiResponse<Conversation>>(`/chat/conversations/${id}`);
    return data.data!;
  }

  async getMessages(conversationId: string, page = 1, limit = 50): Promise<{ messages: Message[]; total: number }> {
    const { data } = await this.client.get<ApiResponse<Message[]> & { total: number }>(
      `/chat/conversations/${conversationId}/messages?page=${page}&limit=${limit}`
    );
    return { messages: data.data || [], total: data.total };
  }

  async deleteConversation(id: string): Promise<void> {
    await this.client.delete(`/chat/conversations/${id}`);
  }

  async searchMessages(query: string, page = 1, limit = 20): Promise<{ messages: Message[]; total: number }> {
    const { data } = await this.client.get<ApiResponse<Message[]> & { total: number }>(
      `/chat/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
    );
    return { messages: data.data || [], total: data.total };
  }

  // Model API - UPDATED WITH INCREASED TIMEOUTS AND PROGRESSIVE LOADING SUPPORT
  async getModels(): Promise<string[]> {
    console.log('🌐 [API] getModels called - making request to /chat/models with increased timeout');
    try {
      const response = await this.client.get<{ success: boolean; data: string[]; timestamp: string }>('/chat/models', {
        timeout: 300000, // 5 minutes for model loading
      });
      console.log('🌐 [API] getModels raw response:', {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        data: response.data
      });
      
      const { data } = response;
      console.log('🌐 [API] getModels response data:', {
        type: typeof data,
        success: data.success,
        dataField: data.data,
        dataType: typeof data.data,
        isArray: Array.isArray(data.data),
        length: data.data?.length
      });
      
      if (!data.success) {
        console.error('❌ [API] getModels - API returned success: false');
        throw new Error('API returned success: false');
      }
      
      if (!Array.isArray(data.data)) {
        console.error('❌ [API] getModels - data.data is not an array:', data.data);
        throw new Error('Invalid response format: data.data is not an array');
      }
      
      console.log('✅ [API] getModels returning:', data.data);
      return data.data || [];
    } catch (error) {
      console.error('❌ [API] getModels error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async getVisionModels(): Promise<string[]> {
    console.log('🌐 [API] getVisionModels called - making request to /chat/vision-models with increased timeout');
    try {
      const response = await this.client.get<{ success: boolean; data: string[]; timestamp: string }>('/chat/vision-models', {
        timeout: 300000, // 5 minutes for vision model detection
      });
      console.log('🌐 [API] getVisionModels raw response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });
      
      const { data } = response;
      console.log('🌐 [API] getVisionModels response data:', {
        type: typeof data,
        success: data.success,
        dataField: data.data,
        dataType: typeof data.data,
        isArray: Array.isArray(data.data),
        length: data.data?.length
      });
      
      if (!data.success) {
        console.error('❌ [API] getVisionModels - API returned success: false');
        throw new Error('API returned success: false');
      }
      
      if (!Array.isArray(data.data)) {
        console.error('❌ [API] getVisionModels - data.data is not an array:', data.data);
        throw new Error('Invalid response format: data.data is not an array');
      }
      
      console.log('✅ [API] getVisionModels returning:', data.data);
      return data.data || [];
    } catch (error) {
      console.error('❌ [API] getVisionModels error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async getModelCapabilities(model: string): Promise<ModelCapability> {
    console.log('🌐 [API] getModelCapabilities called with model:', model);
    try {
      const response = await this.client.get<{ success: boolean; data: ModelCapability; timestamp: string }>(`/chat/models/${model}/capabilities`, {
        timeout: 120000, // 2 minutes for individual model capability detection
      });
      console.log('🌐 [API] getModelCapabilities raw response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data
      });
      
      const { data } = response;
      console.log('🌐 [API] getModelCapabilities response data:', {
        type: typeof data,
        success: data.success,
        dataField: data.data
      });
      
      if (!data.success) {
        console.error('❌ [API] getModelCapabilities - API returned success: false');
        throw new Error('API returned success: false');
      }
      
      console.log('✅ [API] getModelCapabilities returning:', data.data);
      return data.data!;
    } catch (error) {
      console.error('❌ [API] getModelCapabilities error:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error,
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  async getAllModelCapabilities(): Promise<ModelCapability[]> {
    console.log('🌐 [API] getAllModelCapabilities called with increased timeout');
    try {
      const { data } = await this.client.get<{ capabilities: ModelCapability[] }>('/models/capabilities', {
        timeout: 300000, // 5 minutes for all model capabilities
      });
      return data.capabilities || [];
    } catch (error) {
      console.error('❌ [API] getAllModelCapabilities error:', error);
      throw error;
    }
  }

  // PROGRESSIVE LOADING API - NEW ENDPOINTS FOR ROLLING RELEASE
  
  /**
   * Start progressive model capability loading
   */
  async startProgressiveLoading(forceReload = false): Promise<any> {
    console.log('🌐 [API] startProgressiveLoading called:', { forceReload });
    try {
      const { data } = await this.client.post('/progressive/models/capabilities/start', { forceReload }, {
        timeout: 10000, // Quick start, actual loading happens in background
      });
      console.log('✅ [API] startProgressiveLoading response:', data);
      return data;
    } catch (error) {
      console.error('❌ [API] startProgressiveLoading error:', error);
      throw error;
    }
  }

  /**
   * Create EventSource for progressive loading updates
   */
  createProgressiveLoadingStream(onUpdate: (update: ProgressiveUpdate) => void, onError?: (error: Event) => void): EventSource {
    console.log('🌐 [API] Creating progressive loading EventSource...');
    
    const eventSource = new EventSource('/api/progressive/models/capabilities/stream');
    
    eventSource.onmessage = (event) => {
      try {
        const update: ProgressiveUpdate = JSON.parse(event.data);
        console.log('📡 [API] Received progressive update:', update.type, update.progress);
        onUpdate(update);
      } catch (error) {
        console.error('❌ [API] Failed to parse progressive update:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ [API] Progressive loading stream error:', error);
      if (onError) {
        onError(error);
      }
    };
    
    eventSource.onopen = () => {
      console.log('✅ [API] Progressive loading stream connected');
    };
    
    return eventSource;
  }

  /**
   * Get current progressive loading state
   */
  async getProgressiveLoadingState(): Promise<any> {
    console.log('🌐 [API] getProgressiveLoadingState called');
    try {
      const { data } = await this.client.get('/progressive/models/capabilities/state');
      return data;
    } catch (error) {
      console.error('❌ [API] getProgressiveLoadingState error:', error);
      throw error;
    }
  }

  /**
   * Get vision models from progressive loader (fast cached access)
   */
  async getProgressiveVisionModels(): Promise<string[]> {
    console.log('🌐 [API] getProgressiveVisionModels called');
    try {
      const { data } = await this.client.get<{ success: boolean; data: string[]; cached: boolean; isLoading?: boolean }>('/progressive/models/vision');
      console.log('✅ [API] getProgressiveVisionModels response:', {
        modelCount: data.data?.length,
        cached: data.cached,
        isLoading: data.isLoading
      });
      return data.data || [];
    } catch (error) {
      console.error('❌ [API] getProgressiveVisionModels error:', error);
      throw error;
    }
  }

  /**
   * Get all model capabilities from progressive loader (fast cached access)
   */
  async getProgressiveModelCapabilities(): Promise<ModelCapability[]> {
    console.log('🌐 [API] getProgressiveModelCapabilities called');
    try {
      const { data } = await this.client.get<{ success: boolean; data: ModelCapability[]; cached: boolean; isLoading?: boolean }>('/progressive/models/capabilities');
      console.log('✅ [API] getProgressiveModelCapabilities response:', {
        capabilityCount: data.data?.length,
        cached: data.cached,
        isLoading: data.isLoading
      });
      return data.data || [];
    } catch (error) {
      console.error('❌ [API] getProgressiveModelCapabilities error:', error);
      throw error;
    }
  }

  /**
   * Clear progressive loading cache
   */
  async clearProgressiveCache(): Promise<void> {
    console.log('🌐 [API] clearProgressiveCache called');
    try {
      await this.client.delete('/progressive/models/capabilities/cache');
      console.log('✅ [API] Progressive cache cleared');
    } catch (error) {
      console.error('❌ [API] clearProgressiveCache error:', error);
      throw error;
    }
  }

  /**
   * Get progressive loading statistics
   */
  async getProgressiveStats(): Promise<any> {
    console.log('🌐 [API] getProgressiveStats called');
    try {
      const { data } = await this.client.get('/progressive/models/capabilities/stats');
      return data;
    } catch (error) {
      console.error('❌ [API] getProgressiveStats error:', error);
      throw error;
    }
  }

  // Config API
  async getMCPConfig(): Promise<any> {
    const { data } = await this.client.get<ApiResponse<any>>('/config/mcp');
    return data.data;
  }

  async updateMCPConfig(config: any): Promise<void> {
    await this.client.put('/config/mcp', config);
  }

  async getToolOverrides(): Promise<Record<string, any>> {
    const { data } = await this.client.get<ApiResponse<Record<string, any>>>('/config/tool-overrides');
    return data.data || {};
  }

  async updateToolOverrides(overrides: Record<string, any>): Promise<void> {
    await this.client.put('/config/tool-overrides', overrides);
  }

  async getBackups(): Promise<any[]> {
    const { data } = await this.client.get<ApiResponse<any[]>>('/config/backups');
    return data.data || [];
  }

  async restoreBackup(filename: string): Promise<void> {
    await this.client.post(`/config/backups/${filename}/restore`);
  }
}

export const api = new ApiService();
