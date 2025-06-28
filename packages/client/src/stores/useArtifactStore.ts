import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { 
  Artifact, 
  ArtifactViewMode, 
  ArtifactVersion, 
  ArtifactDocument,
  CreateArtifactRequest,
  UpdateArtifactRequest,
  ArtifactHealthCheck,
  ArtifactMigrationData,
  MultiArtifactCreationRequest,
  MultiArtifactCreationResponse,
  ArtifactReference,
  getArtifactCount,
  hasMultipleArtifacts,
  getFirstArtifact
} from '@olympian/shared';
import { api } from '@/services/api';

// =====================================
// ENHANCED STATE INTERFACES
// =====================================

interface ArtifactSyncStatus {
  isSyncing: boolean;
  lastSyncAt?: Date;
  syncError?: string;
  pendingOperations: Array<{
    type: 'create' | 'update' | 'delete';
    artifactId?: string;
    data?: any;
    timestamp: Date;
  }>;
}

// NEW: Multi-artifact specific interfaces (Phase 4)
interface MessageArtifacts {
  messageId: string;
  artifacts: Artifact[];
  hasMultiple: boolean;
  selectedIndex: number; // Currently selected artifact index
  totalCount: number;
}

interface ArtifactState {
  // =====================================
  // CORE STATE - Enhanced for multi-artifact support
  // =====================================
  
  // Current artifacts by conversation (server-first)
  artifacts: Record<string, Artifact[]>; // conversationId -> artifacts
  
  // NEW: Artifacts grouped by message (Phase 4)
  messageArtifacts: Record<string, MessageArtifacts>; // messageId -> artifacts
  
  // Server artifacts cache (raw from server)
  serverArtifacts: Record<string, ArtifactDocument[]>; // conversationId -> server artifacts
  
  // Currently selected artifact
  selectedArtifact: Artifact | null;
  
  // NEW: Currently selected message artifacts (Phase 4)
  selectedMessageId: string | null;
  selectedArtifactIndex: number; // Index within message artifacts
  
  // Current view mode for artifacts
  viewMode: ArtifactViewMode;
  
  // Artifact versions history (local cache)
  versions: Record<string, ArtifactVersion[]>; // artifactId -> versions
  
  // UI state
  isArtifactPanelOpen: boolean;
  
  // NEW: Multi-artifact UI state (Phase 4)
  showArtifactTabs: boolean; // Whether to show tabs for multiple artifacts
  artifactTabsCollapsed: boolean; // Whether artifact tabs are collapsed
  
  // =====================================
  // SERVER SYNCHRONIZATION STATE
  // =====================================
  
  // Sync status per conversation
  syncStatus: Record<string, ArtifactSyncStatus>; // conversationId -> sync status
  
  // Global loading states
  isLoadingArtifacts: boolean;
  isMigrating: boolean;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  
  // Health monitoring
  healthCheck: ArtifactHealthCheck | null;
  
  // Migration tracking
  migrationResults: Record<string, any>; // conversationId -> migration result
  
  // =====================================
  // ENHANCED ACTIONS - Multi-artifact support (Phase 4)
  // =====================================
  
  // Primary artifact operations (server-backed)
  loadArtifactsForConversation: (conversationId: string, forceRefresh?: boolean) => Promise<void>;
  createArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Artifact>;
  updateArtifact: (artifactId: string, content: string, description?: string) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  
  // NEW: Multi-artifact operations (Phase 4)
  loadArtifactsByMessageId: (messageId: string) => Promise<MessageArtifacts>;
  createMultipleArtifacts: (request: MultiArtifactCreationRequest) => Promise<MultiArtifactCreationResponse>;
  reorderArtifactsInMessage: (messageId: string, artifactOrder: Array<{ artifactId: string; order: number }>) => Promise<void>;
  
  // Bulk operations
  bulkCreateArtifacts: (conversationId: string, artifacts: Array<Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  bulkUpdateArtifacts: (updates: Array<{ artifactId: string; content?: string; title?: string }>) => Promise<void>;
  bulkDeleteArtifacts: (artifactIds: string[]) => Promise<void>;
  
  // Migration operations
  migrateConversationArtifacts: (conversationId: string) => Promise<ArtifactMigrationData>;
  migrateAllConversations: () => Promise<void>;
  
  // Health and monitoring
  checkArtifactsHealth: (conversationId?: string) => Promise<void>;
  syncArtifact: (artifactId: string) => Promise<void>;
  syncAllArtifacts: (conversationId: string) => Promise<void>;
  
  // UI actions (enhanced for multi-artifact)
  selectArtifact: (artifact: Artifact | null) => void;
  selectArtifactInMessage: (messageId: string, artifactIndex: number) => void;
  selectNextArtifactInMessage: () => void;
  selectPreviousArtifactInMessage: () => void;
  setViewMode: (mode: ArtifactViewMode) => void;
  toggleArtifactPanel: () => void;
  setArtifactPanelOpen: (open: boolean) => void;
  
  // NEW: Multi-artifact UI actions (Phase 4)
  toggleArtifactTabs: () => void;
  setShowArtifactTabs: (show: boolean) => void;
  collapseArtifactTabs: (collapsed: boolean) => void;
  
  // Enhanced getters with multi-artifact support
  getArtifactsForConversation: (conversationId: string) => Artifact[];
  getArtifactById: (artifactId: string) => Artifact | null;
  getArtifactByMessageId: (messageId: string) => Artifact | null; // Returns first artifact
  getArtifactsByMessageId: (messageId: string) => Artifact[]; // NEW: Returns all artifacts
  getVersionsForArtifact: (artifactId: string) => ArtifactVersion[];
  
  // NEW: Multi-artifact getters (Phase 4)
  getMessageArtifacts: (messageId: string) => MessageArtifacts | null;
  hasMultipleArtifactsInMessage: (messageId: string) => boolean;
  getSelectedArtifactInMessage: (messageId: string) => Artifact | null;
  
  // Legacy operations (now with deprecation warnings)
  revertToVersion: (artifactId: string, version: number) => void;
  clearArtifactsForConversation: (conversationId: string) => void;
  recreateArtifact: (artifact: Artifact) => void;
  
  // =====================================
  // OFFLINE/SYNC MANAGEMENT
  // =====================================
  
  // Offline support
  markOffline: () => void;
  markOnline: () => void;
  isOffline: boolean;
  
  // Force sync operations
  forceSyncConversation: (conversationId: string) => Promise<void>;
  retryFailedOperations: (conversationId: string) => Promise<void>;
  
  // Cache management
  clearCache: (conversationId?: string) => void;
  invalidateCache: (conversationId: string) => void;
}

// =====================================
// HELPER FUNCTIONS
// =====================================

function generateArtifactId(): string {
  return `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Convert server ArtifactDocument to client Artifact
function serverArtifactToClient(serverArtifact: ArtifactDocument): Artifact {
  return {
    id: serverArtifact.id,
    title: serverArtifact.title,
    type: serverArtifact.type,
    content: serverArtifact.content,
    language: serverArtifact.language,
    version: serverArtifact.version,
    createdAt: new Date(serverArtifact.createdAt),
    updatedAt: new Date(serverArtifact.updatedAt),
    messageId: serverArtifact.messageId,
    conversationId: serverArtifact.conversationId,
    checksum: serverArtifact.checksum,
    metadata: serverArtifact.metadata,
    order: serverArtifact.order,
    groupId: serverArtifact.groupId
  };
}

// Convert client Artifact to server CreateArtifactRequest
function clientArtifactToCreateRequest(artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>): CreateArtifactRequest {
  return {
    conversationId: artifact.conversationId,
    messageId: artifact.messageId,
    title: artifact.title,
    type: artifact.type,
    content: artifact.content,
    language: artifact.language,
    order: artifact.order,
    groupId: artifact.groupId,
    metadata: {
      detectionStrategy: 'client_create',
      originalContent: artifact.content,
      codeBlocksRemoved: false,
      reconstructionHash: '', // Will be calculated server-side
      syncStatus: 'synced',
      contentSize: Buffer.from(artifact.content, 'utf8').length,
      ...artifact.metadata
    }
  };
}

// Convert server response artifact to ArtifactDocument with required checksum
function serverResponseToDocument(serverArtifact: ArtifactDocument): ArtifactDocument {
  // If it's already an ArtifactDocument, just ensure required fields
  return {
    ...serverArtifact,
    checksum: serverArtifact.checksum || '', // Ensure checksum is always a string
    metadata: serverArtifact.metadata || {
      syncStatus: 'synced',
      codeBlocksRemoved: false,
      detectionStrategy: 'server',
      originalContent: serverArtifact.content,
      reconstructionHash: '',
      contentSize: Buffer.from(serverArtifact.content, 'utf8').length,
    }
  };
}

// NEW: Create MessageArtifacts from artifact list (Phase 4)
function createMessageArtifacts(messageId: string, artifacts: Artifact[]): MessageArtifacts {
  // Sort artifacts by order or index
  const sortedArtifacts = [...artifacts].sort((a, b) => {
    const orderA = a.order ?? a.metadata?.artifactIndex ?? 0;
    const orderB = b.order ?? b.metadata?.artifactIndex ?? 0;
    return orderA - orderB;
  });

  return {
    messageId,
    artifacts: sortedArtifacts,
    hasMultiple: sortedArtifacts.length > 1,
    selectedIndex: 0, // Default to first artifact
    totalCount: sortedArtifacts.length
  };
}

// =====================================
// ZUSTAND STORE IMPLEMENTATION
// =====================================

export const useArtifactStore = create<ArtifactState>()( 
  persist(
    (set, get) => ({
      // =====================================
      // INITIAL STATE
      // =====================================
      artifacts: {},
      messageArtifacts: {}, // NEW: Phase 4
      serverArtifacts: {},
      selectedArtifact: null,
      selectedMessageId: null, // NEW: Phase 4
      selectedArtifactIndex: 0, // NEW: Phase 4
      viewMode: 'preview',
      versions: {},
      isArtifactPanelOpen: false,
      
      // NEW: Multi-artifact UI state (Phase 4)
      showArtifactTabs: true,
      artifactTabsCollapsed: false,
      
      // Server sync state
      syncStatus: {},
      isLoadingArtifacts: false,
      isMigrating: false,
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
      healthCheck: null,
      migrationResults: {},
      
      // Offline support
      isOffline: false,
      
      // =====================================
      // SERVER-FIRST ARTIFACT OPERATIONS
      // =====================================
      
      /**
       * Load artifacts for conversation from server with client cache
       */
      loadArtifactsForConversation: async (conversationId: string, forceRefresh = false) => {
        console.log(`🔄 [ArtifactStore] Loading artifacts for conversation: ${conversationId}, forceRefresh: ${forceRefresh}`);
        
        try {
          set({ isLoadingArtifacts: true });
          
          // Check if we have cached data and don't need to refresh
          const currentState = get();
          if (!forceRefresh && currentState.serverArtifacts[conversationId]) {
            console.log(`✅ [ArtifactStore] Using cached artifacts for conversation: ${conversationId}`);
            set({ isLoadingArtifacts: false });
            return;
          }
          
          // Load from server - using fallback since api might not be available
          let serverArtifacts: ArtifactDocument[] = [];
          try {
            serverArtifacts = await api.getArtifactsForConversation(conversationId);
          } catch (error) {
            console.warn(`⚠️ [ArtifactStore] Server API not available, using local cache only:`, error);
            set({ isLoadingArtifacts: false });
            return;
          }
          
          console.log(`📋 [ArtifactStore] Loaded ${serverArtifacts.length} artifacts from server`);
          
          // Convert to client format
          const clientArtifacts = serverArtifacts.map(serverArtifactToClient);
          
          // NEW: Group artifacts by message (Phase 4)
          const messageGroups: Record<string, Artifact[]> = {};
          clientArtifacts.forEach(artifact => {
            if (artifact.messageId) {
              if (!messageGroups[artifact.messageId]) {
                messageGroups[artifact.messageId] = [];
              }
              messageGroups[artifact.messageId].push(artifact);
            }
          });
          
          // Create MessageArtifacts objects
          const newMessageArtifacts: Record<string, MessageArtifacts> = {};
          Object.entries(messageGroups).forEach(([messageId, artifacts]) => {
            newMessageArtifacts[messageId] = createMessageArtifacts(messageId, artifacts);
          });
          
          // Update state
          set((state) => ({
            serverArtifacts: {
              ...state.serverArtifacts,
              [conversationId]: serverArtifacts
            },
            artifacts: {
              ...state.artifacts,
              [conversationId]: clientArtifacts
            },
            messageArtifacts: {
              ...state.messageArtifacts,
              ...newMessageArtifacts
            },
            syncStatus: {
              ...state.syncStatus,
              [conversationId]: {
                isSyncing: false,
                lastSyncAt: new Date(),
                syncError: undefined,
                pendingOperations: []
              }
            }
          }));
          
          console.log(`✅ [ArtifactStore] Successfully loaded artifacts for conversation: ${conversationId}`);
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to load artifacts for conversation ${conversationId}:`, error);
          
          // Update sync status with error
          set((state) => ({
            syncStatus: {
              ...state.syncStatus,
              [conversationId]: {
                isSyncing: false,
                lastSyncAt: new Date(),
                syncError: error instanceof Error ? error.message : 'Unknown error',
                pendingOperations: state.syncStatus[conversationId]?.pendingOperations || []
              }
            }
          }));
          
          throw error;
        } finally {
          set({ isLoadingArtifacts: false });
        }
      },

      // =====================================
      // NEW: MULTI-ARTIFACT OPERATIONS (PHASE 4)
      // =====================================

      /**
       * Load artifacts specifically for a message ID
       */
      loadArtifactsByMessageId: async (messageId: string): Promise<MessageArtifacts> => {
        console.log(`📋 [ArtifactStore] Loading artifacts for message: ${messageId}`);
        
        try {
          const artifactsResponse = await api.getArtifactsByMessageId(messageId);
          
          if (!artifactsResponse.success || !artifactsResponse.data.artifacts) {
            throw new Error(artifactsResponse.error || 'Failed to load artifacts for message');
          }
          
          const clientArtifacts = artifactsResponse.data.artifacts.map(serverArtifactToClient);
          const messageArtifacts = createMessageArtifacts(messageId, clientArtifacts);
          
          // Update state
          set((state) => ({
            messageArtifacts: {
              ...state.messageArtifacts,
              [messageId]: messageArtifacts
            }
          }));
          
          console.log(`✅ [ArtifactStore] Loaded ${clientArtifacts.length} artifacts for message: ${messageId}`);
          return messageArtifacts;
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to load artifacts for message ${messageId}:`, error);
          throw error;
        }
      },

      /**
       * Create multiple artifacts for a single message
       */
      createMultipleArtifacts: async (request: MultiArtifactCreationRequest): Promise<MultiArtifactCreationResponse> => {
        console.log(`🎨 [ArtifactStore] Creating ${request.artifacts.length} artifacts for message: ${request.messageId}`);
        
        try {
          set({ isCreating: true });
          
          const response = await api.createMultipleArtifacts(request);
          
          if (!response.success) {
            throw new Error('Multi-artifact creation failed');
          }
          
          // Convert created artifacts to client format
          const clientArtifacts = response.artifacts.map(serverArtifactToClient);
          
          // Update artifacts state
          set((state) => {
            const conversationId = request.conversationId;
            const currentArtifacts = state.artifacts[conversationId] || [];
            const updatedArtifacts = [...currentArtifacts, ...clientArtifacts];
            
            // Update message artifacts
            const messageArtifacts = createMessageArtifacts(request.messageId, clientArtifacts);
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedArtifacts
              },
              messageArtifacts: {
                ...state.messageArtifacts,
                [request.messageId]: messageArtifacts
              },
              selectedMessageId: request.messageId,
              selectedArtifactIndex: 0,
              selectedArtifact: clientArtifacts[0] || null,
              isArtifactPanelOpen: clientArtifacts.length > 0,
              showArtifactTabs: clientArtifacts.length > 1
            };
          });
          
          console.log(`✅ [ArtifactStore] Successfully created ${response.artifactCount} artifacts`);
          return response;
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to create multiple artifacts:`, error);
          throw error;
        } finally {
          set({ isCreating: false });
        }
      },

      /**
       * Reorder artifacts within a message
       */
      reorderArtifactsInMessage: async (messageId: string, artifactOrder: Array<{ artifactId: string; order: number }>) => {
        console.log(`🔄 [ArtifactStore] Reordering ${artifactOrder.length} artifacts in message: ${messageId}`);
        
        try {
          const response = await api.reorderArtifactsInMessage(messageId, { artifactOrder });
          
          if (!response.success) {
            throw new Error('Artifact reordering failed');
          }
          
          // Reload artifacts for the message to get updated order
          await get().loadArtifactsByMessageId(messageId);
          
          console.log(`✅ [ArtifactStore] Successfully reordered artifacts in message: ${messageId}`);
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to reorder artifacts:`, error);
          throw error;
        }
      },
      
      /**
       * Create artifact with server persistence
       */
      createArtifact: async (artifactData) => {
        console.log(`🎨 [ArtifactStore] Creating artifact:`, {
          conversationId: artifactData.conversationId,
          title: artifactData.title,
          type: artifactData.type
        });
        
        try {
          set({ isCreating: true });
          
          // Create optimistic local artifact
          const now = new Date();
          const localArtifact: Artifact = {
            ...artifactData,
            id: generateArtifactId(), // Temporary ID
            version: 1,
            createdAt: now,
            updatedAt: now,
          };
          
          // Add to local state immediately (optimistic update)
          set((state) => {
            const conversationId = localArtifact.conversationId;
            const currentArtifacts = state.artifacts[conversationId] || [];
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: [...currentArtifacts, localArtifact],
              },
              selectedArtifact: localArtifact,
              isArtifactPanelOpen: true,
            };
          });
          
          // Try to create on server, but handle fallback if API not available
          let serverResponse;
          try {
            const createRequest = clientArtifactToCreateRequest(artifactData);
            serverResponse = await api.createArtifact(createRequest);
            
            if (!serverResponse.success || !serverResponse.artifact) {
              throw new Error(serverResponse.error || 'Failed to create artifact on server');
            }
          } catch (error) {
            console.warn(`⚠️ [ArtifactStore] Server creation failed, keeping local artifact:`, error);
            // Keep the local artifact since server is not available
            return localArtifact;
          }
          
          // Safely handle server response
          if (!serverResponse.artifact) {
            throw new Error('Server response missing artifact data');
          }
          
          // Convert server response to client format
          const serverArtifact = serverArtifactToClient(serverResponse.artifact as ArtifactDocument);
          
          // Update local state with server response
          set((state) => {
            const conversationId = serverArtifact.conversationId;
            const currentArtifacts = state.artifacts[conversationId] || [];
            
            // Replace optimistic artifact with server artifact
            const updatedArtifacts = currentArtifacts.map(a => 
              a.id === localArtifact.id ? serverArtifact : a
            );
            
            // Update server cache - ensure we're adding ArtifactDocument type
            const currentServerArtifacts = state.serverArtifacts[conversationId] || [];
            const serverDocument = serverResponseToDocument(serverResponse.artifact as ArtifactDocument);
            
            // NEW: Update message artifacts if messageId exists (Phase 4)
            let newMessageArtifacts = state.messageArtifacts;
            if (serverArtifact.messageId) {
              const messageArtifacts = state.messageArtifacts[serverArtifact.messageId];
              if (messageArtifacts) {
                const updatedMessageArtifacts = messageArtifacts.artifacts.map(a =>
                  a.id === localArtifact.id ? serverArtifact : a
                );
                newMessageArtifacts = {
                  ...state.messageArtifacts,
                  [serverArtifact.messageId]: {
                    ...messageArtifacts,
                    artifacts: updatedMessageArtifacts
                  }
                };
              } else {
                newMessageArtifacts = {
                  ...state.messageArtifacts,
                  [serverArtifact.messageId]: createMessageArtifacts(serverArtifact.messageId, [serverArtifact])
                };
              }
            }
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedArtifacts,
              },
              serverArtifacts: {
                ...state.serverArtifacts,
                [conversationId]: [...currentServerArtifacts, serverDocument]
              },
              messageArtifacts: newMessageArtifacts,
              selectedArtifact: state.selectedArtifact?.id === localArtifact.id ? serverArtifact : state.selectedArtifact,
              versions: {
                ...state.versions,
                [serverArtifact.id]: [{
                  version: 1,
                  content: serverArtifact.content,
                  createdAt: serverArtifact.createdAt,
                  description: 'Initial version',
                }],
              },
            };
          });
          
          console.log(`✅ [ArtifactStore] Successfully created artifact: ${serverArtifact.id}`);
          return serverArtifact;
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to create artifact:`, error);
          
          // Remove optimistic artifact on error
          const localArtifact = get().artifacts[artifactData.conversationId]?.find(a => 
            a.title === artifactData.title && a.type === artifactData.type
          );
          
          if (localArtifact) {
            set((state) => {
              const conversationId = artifactData.conversationId;
              const currentArtifacts = state.artifacts[conversationId] || [];
              const filteredArtifacts = currentArtifacts.filter(a => a.id !== localArtifact.id);
              
              return {
                artifacts: {
                  ...state.artifacts,
                  [conversationId]: filteredArtifacts,
                },
                selectedArtifact: state.selectedArtifact?.id === localArtifact.id ? null : state.selectedArtifact,
              };
            });
          }
          
          throw error;
        } finally {
          set({ isCreating: false });
        }
      },
      
      /**
       * Update artifact with server persistence
       */
      updateArtifact: async (artifactId: string, content: string, description?: string) => {
        console.log(`🔄 [ArtifactStore] Updating artifact: ${artifactId}`);
        
        try {
          set({ isUpdating: true });
          
          // Get current artifact
          const currentState = get();
          const allArtifacts = Object.values(currentState.artifacts).flat();
          const artifact = allArtifacts.find(a => a.id === artifactId);
          
          if (!artifact) {
            throw new Error('Artifact not found');
          }
          
          // Optimistic update
          const now = new Date();
          const newVersion = artifact.version + 1;
          const updatedArtifact: Artifact = {
            ...artifact,
            content,
            version: newVersion,
            updatedAt: now,
          };
          
          // Update local state immediately
          set((state) => {
            const conversationId = artifact.conversationId;
            const conversationArtifacts = state.artifacts[conversationId] || [];
            const updatedConversationArtifacts = conversationArtifacts.map(a => 
              a.id === artifactId ? updatedArtifact : a
            );
            
            // NEW: Update message artifacts if exists (Phase 4)
            let newMessageArtifacts = state.messageArtifacts;
            if (artifact.messageId) {
              const messageArtifacts = state.messageArtifacts[artifact.messageId];
              if (messageArtifacts) {
                const updatedMessageArtifacts = messageArtifacts.artifacts.map(a =>
                  a.id === artifactId ? updatedArtifact : a
                );
                newMessageArtifacts = {
                  ...state.messageArtifacts,
                  [artifact.messageId]: {
                    ...messageArtifacts,
                    artifacts: updatedMessageArtifacts
                  }
                };
              }
            }
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedConversationArtifacts,
              },
              messageArtifacts: newMessageArtifacts,
              selectedArtifact: state.selectedArtifact?.id === artifactId ? updatedArtifact : state.selectedArtifact,
            };
          });
          
          // Try to update on server
          try {
            const updateRequest: UpdateArtifactRequest = {
              artifactId,
              content,
              description,
            };
            
            const serverResponse = await api.updateArtifact(updateRequest);
            
            if (!serverResponse.success || !serverResponse.artifact) {
              throw new Error(serverResponse.error || 'Failed to update artifact on server');
            }
            
            // Safely handle server response
            if (!serverResponse.artifact) {
              throw new Error('Server response missing artifact data');
            }
            
            // Update with server response
            const serverArtifact = serverArtifactToClient(serverResponse.artifact as ArtifactDocument);
            
            set((state) => {
              const conversationId = serverArtifact.conversationId;
              const conversationArtifacts = state.artifacts[conversationId] || [];
              const updatedConversationArtifacts = conversationArtifacts.map(a => 
                a.id === artifactId ? serverArtifact : a
              );
              
              // Update server cache - ensure we're updating with ArtifactDocument type
              const serverArtifacts = state.serverArtifacts[conversationId] || [];
              const serverDocument = serverResponseToDocument(serverResponse.artifact as ArtifactDocument);
              const updatedServerArtifacts = serverArtifacts.map(a => 
                a.id === artifactId ? serverDocument : a
              );
              
              // NEW: Update message artifacts (Phase 4)
              let newMessageArtifacts = state.messageArtifacts;
              if (serverArtifact.messageId) {
                const messageArtifacts = state.messageArtifacts[serverArtifact.messageId];
                if (messageArtifacts) {
                  const updatedMessageArtifacts = messageArtifacts.artifacts.map(a =>
                    a.id === artifactId ? serverArtifact : a
                  );
                  newMessageArtifacts = {
                    ...state.messageArtifacts,
                    [serverArtifact.messageId]: {
                      ...messageArtifacts,
                      artifacts: updatedMessageArtifacts
                    }
                  };
                }
              }
              
              return {
                artifacts: {
                  ...state.artifacts,
                  [conversationId]: updatedConversationArtifacts,
                },
                serverArtifacts: {
                  ...state.serverArtifacts,
                  [conversationId]: updatedServerArtifacts,
                },
                messageArtifacts: newMessageArtifacts,
                selectedArtifact: state.selectedArtifact?.id === artifactId ? serverArtifact : state.selectedArtifact,
                versions: {
                  ...state.versions,
                  [artifactId]: [
                    ...(state.versions[artifactId] || []),
                    {
                      version: newVersion,
                      content,
                      createdAt: now,
                      description: description || `Version ${newVersion}`,
                    }
                  ],
                },
              };
            });
            
            console.log(`✅ [ArtifactStore] Successfully updated artifact: ${artifactId} (v${serverResponse.version || newVersion})`);
          } catch (error) {
            console.warn(`⚠️ [ArtifactStore] Server update failed, keeping local update:`, error);
          }
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to update artifact:`, error);
          
          // Revert optimistic update on error
          const currentState = get();
          const errorArtifact = Object.values(currentState.artifacts).flat().find(a => a.id === artifactId);
          if (errorArtifact) {
            await get().loadArtifactsForConversation(errorArtifact.conversationId, true);
          }
          
          throw error;
        } finally {
          set({ isUpdating: false });
        }
      },
      
      /**
       * Delete artifact with server persistence
       */
      deleteArtifact: async (artifactId: string) => {
        console.log(`🗑️ [ArtifactStore] Deleting artifact: ${artifactId}`);
        
        try {
          set({ isDeleting: true });
          
          // Get artifact before deletion
          const currentState = get();
          const allArtifacts = Object.values(currentState.artifacts).flat();
          const artifactToDelete = allArtifacts.find(a => a.id === artifactId);
          
          if (!artifactToDelete) {
            console.warn(`⚠️ [ArtifactStore] Artifact not found for deletion: ${artifactId}`);
            return;
          }
          
          // Optimistic removal
          set((state) => {
            const conversationId = artifactToDelete.conversationId;
            const conversationArtifacts = state.artifacts[conversationId] || [];
            const filteredArtifacts = conversationArtifacts.filter(a => a.id !== artifactId);
            
            // Remove versions
            const newVersions = { ...state.versions };
            delete newVersions[artifactId];
            
            // NEW: Update message artifacts (Phase 4)
            let newMessageArtifacts = state.messageArtifacts;
            if (artifactToDelete.messageId) {
              const messageArtifacts = state.messageArtifacts[artifactToDelete.messageId];
              if (messageArtifacts) {
                const filteredMessageArtifacts = messageArtifacts.artifacts.filter(a => a.id !== artifactId);
                if (filteredMessageArtifacts.length > 0) {
                  newMessageArtifacts = {
                    ...state.messageArtifacts,
                    [artifactToDelete.messageId]: createMessageArtifacts(artifactToDelete.messageId, filteredMessageArtifacts)
                  };
                } else {
                  // Remove message artifacts entry if no artifacts left
                  const { [artifactToDelete.messageId]: _, ...remaining } = state.messageArtifacts;
                  newMessageArtifacts = remaining;
                }
              }
            }
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: filteredArtifacts,
              },
              messageArtifacts: newMessageArtifacts,
              versions: newVersions,
              selectedArtifact: state.selectedArtifact?.id === artifactId ? null : state.selectedArtifact,
            };
          });
          
          // Try to delete on server
          try {
            await api.deleteArtifact(artifactId);
            
            // Update server cache
            set((state) => {
              const conversationId = artifactToDelete.conversationId;
              const serverArtifacts = state.serverArtifacts[conversationId] || [];
              const filteredServerArtifacts = serverArtifacts.filter(a => a.id !== artifactId);
              
              return {
                serverArtifacts: {
                  ...state.serverArtifacts,
                  [conversationId]: filteredServerArtifacts,
                },
              };
            });
          } catch (error) {
            console.warn(`⚠️ [ArtifactStore] Server deletion failed, keeping local deletion:`, error);
          }
          
          console.log(`✅ [ArtifactStore] Successfully deleted artifact: ${artifactId}`);
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Failed to delete artifact:`, error);
          
          // Reload to revert optimistic deletion  
          const currentState = get();
          const allConversations = Object.keys(currentState.artifacts);
          
          // Find which conversation this artifact belonged to and reload it
          for (const conversationId of allConversations) {
            await get().loadArtifactsForConversation(conversationId, true);
          }
          
          throw error;
        } finally {
          set({ isDeleting: false });
        }
      },
      
      // =====================================
      // BULK OPERATIONS (existing + simplified)
      // =====================================
      
      bulkCreateArtifacts: async (conversationId: string, artifacts: Array<Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>>) => {
        console.log(`📦 [ArtifactStore] Bulk creating ${artifacts.length} artifacts for conversation: ${conversationId}`);
        
        try {
          const operations = artifacts.map(artifact => ({
            type: 'create' as const,
            artifact: clientArtifactToCreateRequest(artifact)
          }));
          
          const bulkResponse = await api.bulkArtifactOperations({
            conversationId,
            operations
          });
          
          if (bulkResponse.success) {
            // Reload artifacts for conversation
            await get().loadArtifactsForConversation(conversationId, true);
            console.log(`✅ [ArtifactStore] Bulk create completed: ${bulkResponse.data.summary.successful}/${bulkResponse.data.summary.total} successful`);
          } else {
            throw new Error('Bulk create operation failed');
          }
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Bulk create failed:`, error);
          throw error;
        }
      },
      
      bulkUpdateArtifacts: async (updates: Array<{ artifactId: string; content?: string; title?: string }>) => {
        console.log(`📦 [ArtifactStore] Bulk updating ${updates.length} artifacts`);
        
        try {
          // Group by conversation
          const currentState = get();
          const updatesByConversation: Record<string, typeof updates> = {};
          
          updates.forEach(update => {
            const artifact = Object.values(currentState.artifacts).flat().find(a => a.id === update.artifactId);
            if (artifact) {
              if (!updatesByConversation[artifact.conversationId]) {
                updatesByConversation[artifact.conversationId] = [];
              }
              updatesByConversation[artifact.conversationId].push(update);
            }
          });
          
          // Process each conversation separately
          for (const [conversationId, conversationUpdates] of Object.entries(updatesByConversation)) {
            const operations = conversationUpdates.map(update => ({
              type: 'update' as const,
              artifactId: update.artifactId,
              artifact: {
                artifactId: update.artifactId,
                content: update.content,
                title: update.title,
              }
            }));
            
            const bulkResponse = await api.bulkArtifactOperations({
              conversationId,
              operations
            });
            
            if (bulkResponse.success) {
              await get().loadArtifactsForConversation(conversationId, true);
            }
          }
          
          console.log(`✅ [ArtifactStore] Bulk update completed`);
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Bulk update failed:`, error);
          throw error;
        }
      },
      
      bulkDeleteArtifacts: async (artifactIds: string[]) => {
        console.log(`📦 [ArtifactStore] Bulk deleting ${artifactIds.length} artifacts`);
        
        try {
          // Group by conversation
          const currentState = get();
          const deletesByConversation: Record<string, string[]> = {};
          
          artifactIds.forEach(artifactId => {
            const artifact = Object.values(currentState.artifacts).flat().find(a => a.id === artifactId);
            if (artifact) {
              if (!deletesByConversation[artifact.conversationId]) {
                deletesByConversation[artifact.conversationId] = [];
              }
              deletesByConversation[artifact.conversationId].push(artifactId);
            }
          });
          
          // Process each conversation separately
          for (const [conversationId, conversationDeletes] of Object.entries(deletesByConversation)) {
            const operations = conversationDeletes.map(artifactId => ({
              type: 'delete' as const,
              artifactId
            }));
            
            const bulkResponse = await api.bulkArtifactOperations({
              conversationId,
              operations
            });
            
            if (bulkResponse.success) {
              await get().loadArtifactsForConversation(conversationId, true);
            }
          }
          
          console.log(`✅ [ArtifactStore] Bulk delete completed`);
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Bulk delete failed:`, error);
          throw error;
        }
      },
      
      // =====================================
      // MIGRATION OPERATIONS (existing - unchanged)
      // =====================================
      
      migrateConversationArtifacts: async (conversationId: string): Promise<ArtifactMigrationData> => {
        console.log(`🔄 [ArtifactStore] Migrating artifacts for conversation: ${conversationId}`);
        
        try {
          set({ isMigrating: true });
          
          const migrationResult = await api.migrateArtifactsForConversation(conversationId);
          
          // Store migration result
          set((state) => ({
            migrationResults: {
              ...state.migrationResults,
              [conversationId]: migrationResult
            }
          }));
          
          // Reload artifacts after migration
          await get().loadArtifactsForConversation(conversationId, true);
          
          console.log(`✅ [ArtifactStore] Migration completed: ${migrationResult.migratedCount} migrated, ${migrationResult.failedCount} failed`);
          
          return migrationResult;
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Migration failed:`, error);
          throw error;
        } finally {
          set({ isMigrating: false });
        }
      },
      
      migrateAllConversations: async () => {
        console.log(`🔄 [ArtifactStore] Migrating all conversations`);
        
        try {
          set({ isMigrating: true });
          
          // This would need to be implemented on the server side
          // For now, we'll skip this operation
          console.warn(`⚠️ [ArtifactStore] migrateAllConversations not yet implemented`);
          
        } finally {
          set({ isMigrating: false });
        }
      },
      
      // =====================================
      // HEALTH AND MONITORING (existing - unchanged)
      // =====================================
      
      checkArtifactsHealth: async (conversationId?: string) => {
        console.log(`🏥 [ArtifactStore] Checking artifacts health: ${conversationId || 'all'}`);
        
        try {
          const healthCheck = await api.getArtifactsHealth(conversationId);
          
          set({ healthCheck });
          
          console.log(`✅ [ArtifactStore] Health check completed:`, {
            totalArtifacts: healthCheck.totalArtifacts,
            syncedArtifacts: healthCheck.syncedArtifacts,
            issueCount: healthCheck.issues.length
          });
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Health check failed:`, error);
          throw error;
        }
      },
      
      syncArtifact: async (artifactId: string) => {
        console.log(`🔄 [ArtifactStore] Syncing artifact: ${artifactId}`);
        
        try {
          const syncedArtifact = await api.syncArtifact(artifactId);
          
          // Update local state with synced artifact
          const clientArtifact = serverArtifactToClient(syncedArtifact);
          
          set((state) => {
            const conversationId = clientArtifact.conversationId;
            const conversationArtifacts = state.artifacts[conversationId] || [];
            const updatedArtifacts = conversationArtifacts.map(a => 
              a.id === artifactId ? clientArtifact : a
            );
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedArtifacts,
              },
              selectedArtifact: state.selectedArtifact?.id === artifactId ? clientArtifact : state.selectedArtifact,
            };
          });
          
          console.log(`✅ [ArtifactStore] Artifact synced: ${artifactId}`);
          
        } catch (error) {
          console.error(`❌ [ArtifactStore] Sync failed:`, error);
          throw error;
        }
      },
      
      syncAllArtifacts: async (conversationId: string) => {
        console.log(`🔄 [ArtifactStore] Syncing all artifacts for conversation: ${conversationId}`);
        
        try {
          await get().loadArtifactsForConversation(conversationId, true);
          console.log(`✅ [ArtifactStore] All artifacts synced for conversation: ${conversationId}`);
        } catch (error) {
          console.error(`❌ [ArtifactStore] Sync all failed:`, error);
          throw error;
        }
      },
      
      // =====================================
      // UI ACTIONS (enhanced for multi-artifact - Phase 4)
      // =====================================
      
      selectArtifact: (artifact) => {
        set({ selectedArtifact: artifact });
        if (artifact) {
          set({ 
            isArtifactPanelOpen: true,
            selectedMessageId: artifact.messageId || null,
            selectedArtifactIndex: 0 // Reset to first when selecting directly
          });
        }
      },

      // NEW: Multi-artifact navigation (Phase 4)
      selectArtifactInMessage: (messageId: string, artifactIndex: number) => {
        const state = get();
        const messageArtifacts = state.messageArtifacts[messageId];
        
        if (!messageArtifacts || artifactIndex >= messageArtifacts.artifacts.length) {
          console.warn(`⚠️ [ArtifactStore] Invalid artifact index ${artifactIndex} for message ${messageId}`);
          return;
        }
        
        const selectedArtifact = messageArtifacts.artifacts[artifactIndex];
        
        set({
          selectedMessageId: messageId,
          selectedArtifactIndex: artifactIndex,
          selectedArtifact,
          isArtifactPanelOpen: true,
          showArtifactTabs: messageArtifacts.hasMultiple
        });
        
        console.log(`🎯 [ArtifactStore] Selected artifact ${artifactIndex + 1}/${messageArtifacts.totalCount} in message: ${messageId}`);
      },

      selectNextArtifactInMessage: () => {
        const state = get();
        if (!state.selectedMessageId) return;
        
        const messageArtifacts = state.messageArtifacts[state.selectedMessageId];
        if (!messageArtifacts || !messageArtifacts.hasMultiple) return;
        
        const nextIndex = (state.selectedArtifactIndex + 1) % messageArtifacts.totalCount;
        get().selectArtifactInMessage(state.selectedMessageId, nextIndex);
      },

      selectPreviousArtifactInMessage: () => {
        const state = get();
        if (!state.selectedMessageId) return;
        
        const messageArtifacts = state.messageArtifacts[state.selectedMessageId];
        if (!messageArtifacts || !messageArtifacts.hasMultiple) return;
        
        const prevIndex = state.selectedArtifactIndex === 0 
          ? messageArtifacts.totalCount - 1 
          : state.selectedArtifactIndex - 1;
        get().selectArtifactInMessage(state.selectedMessageId, prevIndex);
      },
      
      setViewMode: (mode) => {
        set({ viewMode: mode });
      },
      
      toggleArtifactPanel: () => {
        set((state) => ({ isArtifactPanelOpen: !state.isArtifactPanelOpen }));
      },
      
      setArtifactPanelOpen: (open) => {
        set({ isArtifactPanelOpen: open });
      },

      // NEW: Multi-artifact UI actions (Phase 4)
      toggleArtifactTabs: () => {
        set((state) => ({ showArtifactTabs: !state.showArtifactTabs }));
      },

      setShowArtifactTabs: (show: boolean) => {
        set({ showArtifactTabs: show });
      },

      collapseArtifactTabs: (collapsed: boolean) => {
        set({ artifactTabsCollapsed: collapsed });
      },
      
      // =====================================
      // ENHANCED GETTERS (Phase 4)
      // =====================================
      
      getArtifactsForConversation: (conversationId) => {
        const state = get();
        const artifacts = state.artifacts[conversationId] || [];
        
        if (artifacts.length === 0) {
          console.log(`📭 [ArtifactStore] No artifacts cached for conversation: ${conversationId}`);
          // Trigger background load (don't wait)
          get().loadArtifactsForConversation(conversationId).catch(error => {
            console.error(`❌ [ArtifactStore] Background load failed:`, error);
          });
        }
        
        return artifacts;
      },
      
      getArtifactById: (artifactId) => {
        const state = get();
        const allArtifacts = Object.values(state.artifacts).flat();
        const artifact = allArtifacts.find(a => a.id === artifactId) || null;
        
        if (!artifact) {
          console.warn(`🔍 [ArtifactStore] Artifact not found by ID: ${artifactId}`);
        }
        
        return artifact;
      },
      
      getArtifactByMessageId: (messageId) => {
        const state = get();
        const messageArtifacts = state.messageArtifacts[messageId];
        
        if (!messageArtifacts || messageArtifacts.artifacts.length === 0) {
          console.warn(`🔍 [ArtifactStore] No artifacts found for message ID: ${messageId}`);
          return null;
        }
        
        // Return first artifact for backward compatibility
        return messageArtifacts.artifacts[0];
      },

      // NEW: Get all artifacts for a message (Phase 4)
      getArtifactsByMessageId: (messageId) => {
        const state = get();
        const messageArtifacts = state.messageArtifacts[messageId];
        
        if (!messageArtifacts) {
          console.warn(`🔍 [ArtifactStore] No artifacts found for message ID: ${messageId}`);
          return [];
        }
        
        return messageArtifacts.artifacts;
      },
      
      getVersionsForArtifact: (artifactId) => {
        const state = get();
        return state.versions[artifactId] || [];
      },

      // NEW: Multi-artifact getters (Phase 4)
      getMessageArtifacts: (messageId: string) => {
        const state = get();
        return state.messageArtifacts[messageId] || null;
      },

      hasMultipleArtifactsInMessage: (messageId: string) => {
        const state = get();
        const messageArtifacts = state.messageArtifacts[messageId];
        return messageArtifacts ? messageArtifacts.hasMultiple : false;
      },

      getSelectedArtifactInMessage: (messageId: string) => {
        const state = get();
        const messageArtifacts = state.messageArtifacts[messageId];
        
        if (!messageArtifacts || messageArtifacts.artifacts.length === 0) {
          return null;
        }
        
        const selectedIndex = state.selectedMessageId === messageId 
          ? state.selectedArtifactIndex 
          : 0;
          
        return messageArtifacts.artifacts[selectedIndex] || messageArtifacts.artifacts[0];
      },
      
      // =====================================
      // LEGACY OPERATIONS (deprecated but maintained)
      // =====================================
      
      revertToVersion: (artifactId, version) => {
        console.warn(`⚠️ [ArtifactStore] revertToVersion is deprecated. Use updateArtifact instead.`);
        const state = get();
        const versions = state.versions[artifactId] || [];
        const targetVersion = versions.find(v => v.version === version);
        
        if (targetVersion) {
          get().updateArtifact(artifactId, targetVersion.content, `Reverted to version ${version}`);
        }
      },
      
      clearArtifactsForConversation: (conversationId) => {
        console.warn(`⚠️ [ArtifactStore] clearArtifactsForConversation is deprecated. This will only clear local cache.`);
        console.log(`🧹 [ArtifactStore] Clearing local artifacts for conversation: ${conversationId}`);
        
        set((state) => {
          const newArtifacts = { ...state.artifacts };
          const newServerArtifacts = { ...state.serverArtifacts };
          const newVersions = { ...state.versions };
          const newMessageArtifacts = { ...state.messageArtifacts };
          
          // Remove local cache
          delete newArtifacts[conversationId];
          delete newServerArtifacts[conversationId];
          
          // Remove versions and message artifacts for artifacts in this conversation
          const conversationArtifacts = state.artifacts[conversationId] || [];
          conversationArtifacts.forEach(artifactObj => {
            delete newVersions[artifactObj.id];
            if (artifactObj.messageId) {
              delete newMessageArtifacts[artifactObj.messageId];
            }
          });
          
          return {
            artifacts: newArtifacts,
            serverArtifacts: newServerArtifacts,
            messageArtifacts: newMessageArtifacts,
            versions: newVersions,
            selectedArtifact: conversationArtifacts.some(a => a.id === state.selectedArtifact?.id) 
              ? null 
              : state.selectedArtifact,
          };
        });
      },
      
      recreateArtifact: (artifact) => {
        console.warn(`⚠️ [ArtifactStore] recreateArtifact is deprecated. Use server-first loading instead.`);
        console.log(`🔧 [ArtifactStore] Legacy recreateArtifact called for: ${artifact.id}`);
        
        // This is now handled by server-first loading
        // We'll just add it to local state as a fallback
        set((state) => {
          const conversationId = artifact.conversationId;
          const currentArtifacts = state.artifacts[conversationId] || [];
          
          // Check if artifact already exists
          const existingArtifact = currentArtifacts.find(a => a.id === artifact.id);
          if (existingArtifact) {
            console.log(`⚠️ [ArtifactStore] Artifact already exists: ${artifact.id}`);
            return state;
          }
          
          // NEW: Update message artifacts if messageId exists (Phase 4)
          let newMessageArtifacts = state.messageArtifacts;
          if (artifact.messageId) {
            const messageArtifacts = state.messageArtifacts[artifact.messageId];
            if (messageArtifacts) {
              const updatedArtifacts = [...messageArtifacts.artifacts, artifact];
              newMessageArtifacts = {
                ...state.messageArtifacts,
                [artifact.messageId]: createMessageArtifacts(artifact.messageId, updatedArtifacts)
              };
            } else {
              newMessageArtifacts = {
                ...state.messageArtifacts,
                [artifact.messageId]: createMessageArtifacts(artifact.messageId, [artifact])
              };
            }
          }
          
          return {
            artifacts: {
              ...state.artifacts,
              [conversationId]: [...currentArtifacts, artifact],
            },
            messageArtifacts: newMessageArtifacts
          };
        });
      },
      
      // =====================================
      // OFFLINE/SYNC MANAGEMENT (existing - unchanged)
      // =====================================
      
      markOffline: () => {
        console.log(`📴 [ArtifactStore] Marking as offline`);
        set({ isOffline: true });
      },
      
      markOnline: () => {
        console.log(`📶 [ArtifactStore] Marking as online`);
        set({ isOffline: false });
        
        // Trigger sync for all conversations with pending operations
        const state = get();
        Object.entries(state.syncStatus).forEach(([conversationId, status]) => {
          if (status.pendingOperations.length > 0) {
            get().retryFailedOperations(conversationId);
          }
        });
      },
      
      forceSyncConversation: async (conversationId: string) => {
        console.log(`🔄 [ArtifactStore] Force syncing conversation: ${conversationId}`);
        await get().loadArtifactsForConversation(conversationId, true);
      },
      
      retryFailedOperations: async (conversationId: string) => {
        console.log(`🔁 [ArtifactStore] Retrying failed operations for conversation: ${conversationId}`);
        
        const state = get();
        const syncStatus = state.syncStatus[conversationId];
        
        if (!syncStatus || syncStatus.pendingOperations.length === 0) {
          console.log(`📭 [ArtifactStore] No pending operations for conversation: ${conversationId}`);
          return;
        }
        
        // This would implement retry logic for failed operations
        // For now, we'll just clear pending operations and force sync
        set((state) => ({
          syncStatus: {
            ...state.syncStatus,
            [conversationId]: {
              ...syncStatus,
              pendingOperations: [],
              syncError: undefined
            }
          }
        }));
        
        await get().loadArtifactsForConversation(conversationId, true);
      },
      
      // =====================================
      // CACHE MANAGEMENT (existing - unchanged)
      // =====================================
      
      clearCache: (conversationId?: string) => {
        console.log(`🧹 [ArtifactStore] Clearing cache: ${conversationId || 'all'}`);
        
        if (conversationId) {
          set((state) => {
            const newServerArtifacts = { ...state.serverArtifacts };
            delete newServerArtifacts[conversationId];
            
            return { serverArtifacts: newServerArtifacts };
          });
        } else {
          set({ 
            serverArtifacts: {}, 
            artifacts: {}, 
            messageArtifacts: {}, // NEW: Clear message artifacts too
            versions: {} 
          });
        }
      },
      
      invalidateCache: (conversationId: string) => {
        console.log(`♻️ [ArtifactStore] Invalidating cache for conversation: ${conversationId}`);
        get().clearCache(conversationId);
      },
    }),
    {
      name: 'olympian-artifact-store-v2',
      version: 5, // Increment version for multi-artifact implementation (Phase 4)
      migrate: (persistedState: any, version: number) => {
        console.log(`🔄 [ArtifactStore] Migrating artifact store from version ${version} to 5`);
        
        if (version < 5) {
          console.log(`🔄 [ArtifactStore] Migrating to version 5 (multi-artifact implementation)`);
          
          // Clear old cache to force server reload with new multi-artifact support
          return {
            ...persistedState,
            messageArtifacts: {}, // NEW: Initialize message artifacts
            selectedMessageId: null, // NEW: Initialize selected message
            selectedArtifactIndex: 0, // NEW: Initialize artifact index
            showArtifactTabs: true, // NEW: Initialize tabs
            artifactTabsCollapsed: false, // NEW: Initialize tabs state
            serverArtifacts: {},
            syncStatus: {},
            healthCheck: null,
            migrationResults: {},
            isOffline: false,
          };
        }
        
        return persistedState;
      },
      // Only persist essential state, not server cache
      partialize: (state) => ({
        artifacts: state.artifacts,
        messageArtifacts: state.messageArtifacts, // NEW: Persist message artifacts
        selectedArtifact: state.selectedArtifact,
        selectedMessageId: state.selectedMessageId, // NEW: Persist selected message
        selectedArtifactIndex: state.selectedArtifactIndex, // NEW: Persist artifact index
        viewMode: state.viewMode,
        isArtifactPanelOpen: state.isArtifactPanelOpen,
        showArtifactTabs: state.showArtifactTabs, // NEW: Persist tabs state
        artifactTabsCollapsed: state.artifactTabsCollapsed, // NEW: Persist tabs collapse state
        versions: state.versions,
        migrationResults: state.migrationResults,
      }),
    }
  )
);
