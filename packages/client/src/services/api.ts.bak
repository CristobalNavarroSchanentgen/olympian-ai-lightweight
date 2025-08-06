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
  // NEW: Artifact types
  ArtifactDocument,
  CreateArtifactRequest,
  UpdateArtifactRequest,
  ArtifactOperationResponse,
  ArtifactHealthCheck,
  ArtifactMigrationData,
  // NEW: Multi-artifact types (Phase 5)
  MultiArtifactCreationRequest,
  MultiArtifactCreationResponse,
  // NEW: Thinking types
  ThinkingData,
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

// ENHANCED: Streaming event types for basic models with thinking support
interface StreamingEvent {
  type: 'connected' | 'conversation' | 'thinking' | 'streaming_start' | 'token' | 'streaming_end' | 'complete' | 'error' | 'artifact_created' | 'thinking_detected';
  conversation?: Conversation;
  conversationId?: string;
  isThinking?: boolean;
  token?: string;
  content?: string;
  message?: string;
  metadata?: any;
  error?: string;
  // NEW: Artifact-related fields
  artifactId?: string;
  artifactType?: string;
  title?: string; // NEW: Artifact title
  order?: number; // NEW: Artifact order
  // NEW: Thinking-related fields
  thinking?: ThinkingData;
}

// NEW: Bulk artifact operation types
interface BulkArtifactOperation {
  type: 'create' | 'update' | 'delete';
  artifact?: CreateArtifactRequest | UpdateArtifactRequest;
  artifactId?: string;
}

interface BulkArtifactRequest {
  conversationId: string;
  operations: BulkArtifactOperation[];
}

interface BulkArtifactResponse {
  success: boolean;
  data: {
    conversationId: string;
    results: Array<{
      operation: string;
      artifactId?: string;
      success: boolean;
      error?: string;
      artifact?: ArtifactDocument;
    }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
  };
}

// ENHANCED: Messages response with artifacts
interface MessagesWithArtifactsResponse {
  messages: Message[];
  artifacts: ArtifactDocument[];
}

// NEW: Artifact version type
interface ArtifactVersion {
  artifactId: string;
  version: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  checksum: string;
}

// NEW: Multi-artifact API response types (Phase 5)
interface ArtifactsByMessageResponse {
  success: boolean;
  data: {
    messageId: string;
    artifacts: ArtifactDocument[];
    total: number;
    hasMultipleArtifacts: boolean;
    metadata: {
      groupingStrategy?: string;
      detectionStrategy?: string;
      partOfMultiArtifact: boolean;
    };
  };
}

interface ArtifactReorderRequest {
  artifactOrder: Array<{
    artifactId: string;
    order: number;
  }>;
}

interface ArtifactReorderResponse {
  success: boolean;
  data: {
    messageId: string;
    results: Array<{
      artifactId: string;
      success: boolean;
      error?: string;
      newOrder?: number;
    }>;
    summary: {
      total: number;
      successful: number;
      failed: number;
    };
  };
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

  // Helper function to check if a model is basic (no capabilities)
  private isBasicModel(capabilities: ModelCapability | null): boolean {
    if (!capabilities) return false;
    return !capabilities.vision && !capabilities.tools && !capabilities.reasoning;
  }

  // =====================================
  // ARTIFACT API METHODS (enhanced with multi-artifact support)
  // =====================================

  /**
   * Get all artifacts for a conversation with server-first loading
   */
  async getArtifactsForConversation(conversationId: string): Promise<ArtifactDocument[]> {
    console.log(`🎨 [API] Getting artifacts for conversation: ${conversationId}`);
    try {
      const { data } = await this.client.get<ApiResponse<ArtifactDocument[]> & { total: number }>(
        `/artifacts/conversations/${conversationId}`
      );
      console.log(`✅ [API] Retrieved ${data.data?.length || 0} artifacts from server`);
      return data.data || [];
    } catch (error) {
      console.error(`❌ [API] Failed to get artifacts for conversation:`, error);
      throw error;
    }
  }

  /**
   * NEW: Get artifacts specifically for a message ID (Phase 5)
   */
  async getArtifactsByMessageId(messageId: string): Promise<ArtifactsByMessageResponse> {
    console.log(`📋 [API] Getting artifacts for message: ${messageId}`);
    try {
      const { data } = await this.client.get<ArtifactsByMessageResponse>(
        `/artifacts/by-message/${messageId}`
      );
      console.log(`✅ [API] Retrieved ${data.data?.artifacts?.length || 0} artifacts for message: ${messageId}`);
      return data;
    } catch (error) {
      console.error(`❌ [API] Failed to get artifacts for message:`, error);
      throw error;
    }
  }

  /**
   * NEW: Create multiple artifacts in a single request (Phase 5)
   */
  async createMultipleArtifacts(request: MultiArtifactCreationRequest): Promise<MultiArtifactCreationResponse> {
    console.log(`🎨 [API] Creating ${request.artifacts.length} artifacts for message: ${request.messageId}`);
    try {
      const { data } = await this.client.post<MultiArtifactCreationResponse>(
        '/artifacts/multi-create',
        request
      );
      console.log(`✅ [API] Created ${data.artifactCount} artifacts successfully`);
      return data;
    } catch (error) {
      console.error(`❌ [API] Failed to create multiple artifacts:`, error);
      throw error;
    }
  }

  /**
   * NEW: Reorder artifacts within a message (Phase 5)
   */
  async reorderArtifactsInMessage(messageId: string, request: ArtifactReorderRequest): Promise<ArtifactReorderResponse> {
    console.log(`🔄 [API] Reordering ${request.artifactOrder.length} artifacts in message: ${messageId}`);
    try {
      const { data } = await this.client.put<ArtifactReorderResponse>(
        `/artifacts/by-message/${messageId}/reorder`,
        request
      );
      console.log(`✅ [API] Reordered artifacts: ${data.data.summary.successful}/${data.data.summary.total} successful`);
      return data;
    } catch (error) {
      console.error(`❌ [API] Failed to reorder artifacts:`, error);
      throw error;
    }
  }

  /**
   * Get single artifact by ID
   */
  async getArtifactById(artifactId: string): Promise<ArtifactDocument | null> {
    console.log(`🎨 [API] Getting artifact: ${artifactId}`);
    try {
      const { data } = await this.client.get<ApiResponse<ArtifactDocument>>(
        `/artifacts/${artifactId}`
      );
      console.log(`✅ [API] Retrieved artifact: ${artifactId}`);
      return data.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`📭 [API] Artifact not found: ${artifactId}`);
        return null;
      }
      console.error(`❌ [API] Failed to get artifact:`, error);
      throw error;
    }
  }

  /**
   * Get all versions for an artifact
   */
  async getArtifactVersions(artifactId: string): Promise<ArtifactVersion[]> {
    console.log(`📚 [API] Getting versions for artifact: ${artifactId}`);
    try {
      const { data } = await this.client.get<ApiResponse<ArtifactVersion[]> & { total: number }>(
        `/artifacts/${artifactId}/versions`
      );
      console.log(`✅ [API] Retrieved ${data.data?.length || 0} versions for artifact`);
      return data.data || [];
    } catch (error) {
      console.error(`❌ [API] Failed to get artifact versions:`, error);
      throw error;
    }
  }

  /**
   * Get specific version of an artifact
   */
  async getArtifactVersion(artifactId: string, version: number): Promise<ArtifactVersion | null> {
    console.log(`🔍 [API] Getting artifact ${artifactId} version ${version}`);
    try {
      const { data } = await this.client.get<ApiResponse<ArtifactVersion>>(
        `/artifacts/${artifactId}/versions/${version}`
      );
      console.log(`✅ [API] Retrieved artifact version ${version}`);
      return data.data || null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        console.log(`📭 [API] Artifact version not found: ${artifactId} v${version}`);
        return null;
      }
      console.error(`❌ [API] Failed to get artifact version:`, error);
      throw error;
    }
  }

  /**
   * Create new artifact
   */
  async createArtifact(request: CreateArtifactRequest): Promise<ArtifactOperationResponse> {
    console.log(`🎨 [API] Creating artifact:`, { 
      conversationId: request.conversationId,
      type: request.type,
      title: request.title 
    });
    try {
      const { data } = await this.client.post<ArtifactOperationResponse>('/artifacts', request);
      console.log(`✅ [API] Created artifact: ${data.artifact?.id}`);
      return data;
    } catch (error) {
      console.error(`❌ [API] Failed to create artifact:`, error);
      throw error;
    }
  }

  /**
   * Update existing artifact
   */
  async updateArtifact(request: UpdateArtifactRequest): Promise<ArtifactOperationResponse> {
    console.log(`🎨 [API] Updating artifact: ${request.artifactId}`);
    try {
      const { data } = await this.client.put<ArtifactOperationResponse>(
        `/artifacts/${request.artifactId}`,
        request
      );
      console.log(`✅ [API] Updated artifact: ${request.artifactId} (v${data.version})`);
      return data;
    } catch (error) {
      console.error(`❌ [API] Failed to update artifact:`, error);
      throw error;
    }
  }

  /**
   * Delete artifact
   */
  async deleteArtifact(artifactId: string): Promise<void> {
    console.log(`🎨 [API] Deleting artifact: ${artifactId}`);
    try {
      await this.client.delete(`/artifacts/${artifactId}`);
      console.log(`✅ [API] Deleted artifact: ${artifactId}`);
    } catch (error) {
      console.error(`❌ [API] Failed to delete artifact:`, error);
      throw error;
    }
  }

  /**
   * Perform bulk artifact operations
   */
  async bulkArtifactOperations(request: BulkArtifactRequest): Promise<BulkArtifactResponse> {
    console.log(`📦 [API] Performing bulk artifact operations:`, {
      conversationId: request.conversationId,
      operationCount: request.operations.length
    });
    try {
      const { data } = await this.client.post<BulkArtifactResponse>('/artifacts/bulk', request);
      console.log(`✅ [API] Bulk operations completed: ${data.data.summary.successful}/${data.data.summary.total} successful`);
      return data;
    } catch (error) {
      console.error(`❌ [API] Failed bulk artifact operations:`, error);
      throw error;
    }
  }

  /**
   * Migrate artifacts from message metadata
   */
  async migrateArtifactsForConversation(conversationId: string): Promise<ArtifactMigrationData> {
    console.log(`🔄 [API] Migrating artifacts for conversation: ${conversationId}`);
    try {
      const { data } = await this.client.post<ApiResponse<ArtifactMigrationData>>(
        `/artifacts/conversations/${conversationId}/migrate`
      );
      console.log(`✅ [API] Migration completed: ${data.data!.migratedCount} migrated, ${data.data!.failedCount} failed`);
      return data.data!;
    } catch (error) {
      console.error(`❌ [API] Failed to migrate artifacts:`, error);
      throw error;
    }
  }

  /**
   * Get artifacts health check
   */
  async getArtifactsHealth(conversationId?: string): Promise<ArtifactHealthCheck> {
    const endpoint = conversationId 
      ? `/artifacts/conversations/${conversationId}/health`
      : '/artifacts/health';
    
    console.log(`🏥 [API] Getting artifacts health check: ${endpoint}`);
    try {
      const { data } = await this.client.get<ApiResponse<ArtifactHealthCheck>>(endpoint);
      console.log(`✅ [API] Health check completed:`, {
        totalArtifacts: data.data!.totalArtifacts,
        syncedArtifacts: data.data!.syncedArtifacts,
        issueCount: data.data!.issues.length
      });
      return data.data!;
    } catch (error) {
      console.error(`❌ [API] Failed to get artifacts health:`, error);
      throw error;
    }
  }

  /**
   * Force sync for specific artifact
   */
  async syncArtifact(artifactId: string): Promise<ArtifactDocument> {
    console.log(`🔄 [API] Syncing artifact: ${artifactId}`);
    try {
      const { data } = await this.client.post<ApiResponse<ArtifactDocument>>(
        `/artifacts/${artifactId}/sync`
      );
      console.log(`✅ [API] Artifact synced: ${artifactId}`);
      return data.data!;
    } catch (error) {
      console.error(`❌ [API] Failed to sync artifact:`, error);
      throw error;
    }
  }

  /**
   * Get artifacts with sync conflicts
   */
  async getArtifactConflicts(page = 1, limit = 20): Promise<{ artifacts: ArtifactDocument[]; total: number }> {
    console.log(`⚠️ [API] Getting artifact conflicts: page ${page}, limit ${limit}`);
    try {
      const { data } = await this.client.get<ApiResponse<ArtifactDocument[]> & { total: number }>(
        `/artifacts/conflicts?page=${page}&limit=${limit}`
      );
      console.log(`✅ [API] Retrieved ${data.data?.length || 0} artifacts with conflicts`);
      return { artifacts: data.data || [], total: data.total || 0 };
    } catch (error) {
      console.error(`❌ [API] Failed to get artifact conflicts:`, error);
      throw error;
    }
  }

  /**
   * Get debug statistics (development only)
   */
  async getArtifactDebugStats(): Promise<any> {
    console.log(`🔧 [API] Getting artifact debug statistics`);
    try {
      const { data } = await this.client.get<ApiResponse<any>>('/artifacts/debug/stats');
      console.log(`✅ [API] Retrieved debug statistics`);
      return data.data;
    } catch (error) {
      console.error(`❌ [API] Failed to get debug statistics:`, error);
      throw error;
    }
  }

  // =====================================
  // ENHANCED STREAMING WITH MULTI-ARTIFACTS AND THINKING
  // =====================================

  // ENHANCED: Streaming API for basic models with thinking support
  async sendMessageStreaming(
    params: {
      message: string;
      model: string;
      visionModel?: string;
      conversationId?: string;
      images?: string[];
    },
    onEvent: (event: StreamingEvent) => void,
    capabilities?: ModelCapability | null | undefined
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if model is basic before attempting to stream
      // Handle undefined by treating it as null
      const normalizedCapabilities = capabilities === undefined ? null : capabilities;
      if (!this.isBasicModel(normalizedCapabilities)) {
        reject(new Error('Streaming is only available for basic models (models without vision, tools, or reasoning capabilities)'));
        return;
      }

      // For now, let's use fetch with ReadableStream since EventSource doesn't support POST
      this.streamWithFetch(params, onEvent)
        .then(resolve)
        .catch(reject);
    });
  }

  // ENHANCED: Stream handling with thinking support
  private async streamWithFetch(
    params: {
      message: string;
      model: string;
      visionModel?: string;
      conversationId?: string;
      images?: string[];
    },
    onEvent: (event: StreamingEvent) => void
  ): Promise<void> {
    console.log('🌊 [API] Starting enhanced streaming with thinking support...');
    
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('🌊 [API] Stream completed');
          break;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n'); // FIXED: Changed from '\\\\n' to '\n' for proper line splitting

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6)) as StreamingEvent;
              
              // ENHANCED: Enhanced thinking event handling
              if (eventData.type === 'thinking_detected') {
                console.log('🧠 [API] Thinking content detected during streaming:', {
                  hasThinking: eventData.thinking?.hasThinking,
                  contentLength: eventData.thinking?.content?.length,
                  processedAt: eventData.thinking?.processedAt
                });
              }
              
              // Enhanced artifact creation event handling (Phase 5)
              if (eventData.type === 'artifact_created') {
                console.log(`🎨 [API] Artifact created during streaming:`, {
                  id: eventData.artifactId,
                  type: eventData.artifactType,
                  title: eventData.title,
                  order: eventData.order
                });
              }

              // Enhanced thinking state event handling
              if (eventData.type === 'thinking') {
                console.log(`🧠 [API] Thinking state change:`, {
                  isThinking: eventData.isThinking
                });
              }

              onEvent(eventData);
            } catch (error) {
              console.warn('⚠️ [API] Failed to parse streaming event:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
      console.log('🌊 [API] Stream reader released');
    }
  }

  // =====================================
  // ENHANCED CHAT API WITH MULTI-ARTIFACTS AND THINKING
  // =====================================

  // ENHANCED: Chat API with thinking support
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
    // ENHANCED: Multi-artifact support (Phase 5)
    artifacts?: Array<{
      artifactId: string;
      artifactType: string;
      title?: string;
      order?: number;
    }>;
    artifactCount?: number;
    // Legacy artifact information for backward compatibility
    artifact?: { id: string; type: string };
    // NEW: Thinking support
    thinking?: ThinkingData;
    originalContentWithThinking?: string;
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
      artifacts?: Array<{
        artifactId: string;
        artifactType: string;
        title?: string;
        order?: number;
      }>;
      artifactCount?: number;
      artifact?: { id: string; type: string };
      thinking?: ThinkingData;
      originalContentWithThinking?: string;
    }>>('/chat/send', params, {
      timeout,
      // Add progress monitoring for long requests
      onUploadProgress: hasImages ? (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
        console.log(`📤 Upload progress: ${percentCompleted}%`);
      } : undefined,
    });

    // ENHANCED: Enhanced artifact and thinking logging
    if (data.data!.artifacts && data.data!.artifacts.length > 0) {
      console.log(`🎨 [API] ${data.data!.artifacts.length} artifacts created:`, 
        data.data!.artifacts.map(a => `${a.artifactId} (${a.artifactType})`));
    } else if (data.data!.artifact) {
      console.log(`🎨 [API] Artifact created: ${data.data!.artifact.id} (${data.data!.artifact.type})`);
    }

    if (data.data!.thinking?.hasThinking) {
      console.log(`🧠 [API] Thinking content received:`, {
        contentLength: data.data!.thinking.content?.length,
        processedAt: data.data!.thinking.processedAt,
        hasOriginalContent: !!data.data!.originalContentWithThinking
      });
    }

    return data.data!;
  }

  // =====================================
  // EXISTING API METHODS (unchanged but extended)
  // =====================================

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

  // ENHANCED: Get messages with artifacts
  async getMessages(conversationId: string, page = 1, limit = 50): Promise<{ messages: Message[]; artifacts: ArtifactDocument[]; total: number }> {
    console.log(`📋 [API] Getting messages with artifacts for conversation: ${conversationId}`);
    
    const { data } = await this.client.get<ApiResponse<MessagesWithArtifactsResponse> & { total: number }>(
      `/chat/conversations/${conversationId}/messages?page=${page}&limit=${limit}`
    );
    
    // Handle both old format (data as array) and new format (data as object with messages and artifacts)
    if (Array.isArray(data.data)) {
      // Old format - messages only
      console.log(`⚠️ [API] Received legacy response format (messages only)`);
      return { 
        messages: data.data as Message[], 
        artifacts: [], 
        total: data.total 
      };
    } else {
      // New format - messages and artifacts
      const response = data.data as MessagesWithArtifactsResponse;
      console.log(`✅ [API] Received enhanced response with ${response.messages?.length || 0} messages and ${response.artifacts?.length || 0} artifacts`);
      return { 
        messages: response.messages || [], 
        artifacts: response.artifacts || [], 
        total: data.total 
      };
    }
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

  // Model API - FIXED: Updated to use correct endpoints from models router
  async getModels(): Promise<string[]> {
    console.log('🌐 [API] getModels called - making request to /models/list with increased timeout');
    try {
      const response = await this.client.get<{ success: boolean; data: string[]; timestamp: string }>('/models/list', {
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
    console.log('🌐 [API] getVisionModels called - making request to /models/vision with increased timeout');
    try {
      const response = await this.client.get<{ success: boolean; data: string[]; timestamp: string }>('/models/vision', {
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
      const response = await this.client.get<{ success: boolean; data: ModelCapability; timestamp: string }>(`/models/capabilities/${model}`, {
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
export type { 
  StreamingEvent, 
  BulkArtifactOperation, 
  BulkArtifactRequest, 
  BulkArtifactResponse, 
  ArtifactVersion,
  // NEW: Multi-artifact types (Phase 5)
  ArtifactsByMessageResponse,
  ArtifactReorderRequest,
  ArtifactReorderResponse
};