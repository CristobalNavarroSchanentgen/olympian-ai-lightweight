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

  async getModels(): Promise<string[]> {
    const { data } = await this.client.get<ApiResponse<string[]>>('/chat/models');
    return data.data || [];
  }

  async getModelCapabilities(model: string): Promise<ModelCapability> {
    const { data } = await this.client.get<ApiResponse<ModelCapability>>(`/chat/models/${model}/capabilities`);
    return data.data!;
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