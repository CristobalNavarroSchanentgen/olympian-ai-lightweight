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

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: '/api',
      headers: {
        'Content-Type': 'application/json',
      },
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
    const { data } = await this.client.post<ApiResponse<{
      conversation: Conversation;
      conversationId: string;
      message: string;
      metadata: any;
    }>>('/chat/send', params);
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

  // Model API - Fixed to use chat endpoints with correct response format
  async getModels(): Promise<string[]> {
    console.log('🌐 [API] getModels called - making request to /chat/models');
    try {
      const response = await this.client.get<{ success: boolean; data: string[]; timestamp: string }>('/chat/models');
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
    console.log('🌐 [API] getVisionModels called - making request to /chat/vision-models');
    try {
      const response = await this.client.get<{ success: boolean; data: string[]; timestamp: string }>('/chat/vision-models');
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
      const response = await this.client.get<{ success: boolean; data: ModelCapability; timestamp: string }>(`/chat/models/${model}/capabilities`);
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
    const { data } = await this.client.get<{ capabilities: ModelCapability[] }>('/models/capabilities');
    return data.capabilities || [];
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