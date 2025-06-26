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
  ArtifactMigrationData 
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

interface ArtifactState {
  // =====================================
  // CORE STATE - Enhanced for server sync
  // =====================================
  
  // Current artifacts by conversation (server-first)
  artifacts: Record<string, Artifact[]>; // conversationId -> artifacts
  
  // Server artifacts cache (raw from server)
  serverArtifacts: Record<string, ArtifactDocument[]>; // conversationId -> server artifacts
  
  // Currently selected artifact
  selectedArtifact: Artifact | null;
  
  // Current view mode for artifacts
  viewMode: ArtifactViewMode;
  
  // Artifact versions history (local cache)
  versions: Record<string, ArtifactVersion[]>; // artifactId -> versions
  
  // UI state
  isArtifactPanelOpen: boolean;
  
  // =====================================
  // NEW: SERVER SYNCHRONIZATION STATE
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
  // ENHANCED ACTIONS - Server-first approach
  // =====================================
  
  // Primary artifact operations (server-backed)
  loadArtifactsForConversation: (conversationId: string, forceRefresh?: boolean) => Promise<void>;
  createArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Artifact>;
  updateArtifact: (artifactId: string, content: string, description?: string) => Promise<void>;
  deleteArtifact: (artifactId: string) => Promise<void>;
  
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
  
  // UI actions (unchanged)
  selectArtifact: (artifact: Artifact | null) => void;
  setViewMode: (mode: ArtifactViewMode) => void;
  toggleArtifactPanel: () => void;
  setArtifactPanelOpen: (open: boolean) => void;
  
  // Enhanced getters with server fallback
  getArtifactsForConversation: (conversationId: string) => Artifact[];
  getArtifactById: (artifactId: string) => Artifact | null;
  getArtifactByMessageId: (messageId: string) => Artifact | null;
  getVersionsForArtifact: (artifactId: string) => ArtifactVersion[];
  
  // Legacy operations (now with deprecation warnings)
  revertToVersion: (artifactId: string, version: number) => void;
  clearArtifactsForConversation: (conversationId: string) => void;
  recreateArtifact: (artifact: Artifact) => void;
  
  // =====================================
  // NEW: OFFLINE/SYNC MANAGEMENT
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
      serverArtifacts: {},
      selectedArtifact: null,
      viewMode: 'preview',
      versions: {},
      isArtifactPanelOpen: false,
      
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
          
          // Convert server response to client format
          const serverArtifact = serverArtifactToClient(serverResponse.artifact);
          
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
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedArtifacts,
              },
              serverArtifacts: {
                ...state.serverArtifacts,
                [conversationId]: [...currentServerArtifacts, serverResponse.artifact]
              },
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
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedConversationArtifacts,
              },
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
            
            // Update with server response
            const serverArtifact = serverArtifactToClient(serverResponse.artifact);
            
            set((state) => {
              const conversationId = serverArtifact.conversationId;
              const conversationArtifacts = state.artifacts[conversationId] || [];
              const updatedConversationArtifacts = conversationArtifacts.map(a => 
                a.id === artifactId ? serverArtifact : a
              );
              
              // Update server cache - ensure we're updating with ArtifactDocument type
              const serverArtifacts = state.serverArtifacts[conversationId] || [];
              const updatedServerArtifacts = serverArtifacts.map(a => 
                a.id === artifactId ? serverResponse.artifact : a
              );
              
              return {
                artifacts: {
                  ...state.artifacts,
                  [conversationId]: updatedConversationArtifacts,
                },
                serverArtifacts: {
                  ...state.serverArtifacts,
                  [conversationId]: updatedServerArtifacts,
                },
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
          const artifact = Object.values(currentState.artifacts).flat().find(a => a.id === artifactId);
          if (artifact) {
            await get().loadArtifactsForConversation(artifact.conversationId, true);
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
          const artifact = allArtifacts.find(a => a.id === artifactId);
          
          if (!artifact) {
            console.warn(`⚠️ [ArtifactStore] Artifact not found for deletion: ${artifactId}`);
            return;
          }
          
          // Optimistic removal
          set((state) => {
            const conversationId = artifact.conversationId;
            const conversationArtifacts = state.artifacts[conversationId] || [];
            const filteredArtifacts = conversationArtifacts.filter(a => a.id !== artifactId);
            
            // Remove versions
            const newVersions = { ...state.versions };
            delete newVersions[artifactId];
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: filteredArtifacts,
              },
              versions: newVersions,
              selectedArtifact: state.selectedArtifact?.id === artifactId ? null : state.selectedArtifact,
            };
          });
          
          // Try to delete on server
          try {
            await api.deleteArtifact(artifactId);
            
            // Update server cache
            set((state) => {
              const conversationId = artifact.conversationId;
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
          if (artifact) {
            await get().loadArtifactsForConversation(artifact.conversationId, true);
          }
          
          throw error;
        } finally {
          set({ isDeleting: false });
        }
      },
      
      // =====================================
      // BULK OPERATIONS
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
      // MIGRATION OPERATIONS
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
      // HEALTH AND MONITORING
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
      // UI ACTIONS (unchanged)
      // =====================================
      
      selectArtifact: (artifact) => {
        set({ selectedArtifact: artifact });
        if (artifact) {
          set({ isArtifactPanelOpen: true });
        }
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
      
      // =====================================
      // ENHANCED GETTERS
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
        const allArtifacts = Object.values(state.artifacts).flat();
        const artifact = allArtifacts.find(a => a.messageId === messageId) || null;
        
        if (!artifact) {
          console.warn(`🔍 [ArtifactStore] Artifact not found by message ID: ${messageId}`);
        }
        
        return artifact;
      },
      
      getVersionsForArtifact: (artifactId) => {
        const state = get();
        return state.versions[artifactId] || [];
      },
      
      // =====================================
      // LEGACY OPERATIONS (deprecated)
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
          
          // Remove local cache
          delete newArtifacts[conversationId];
          delete newServerArtifacts[conversationId];
          
          // Remove versions for artifacts in this conversation
          const conversationArtifacts = state.artifacts[conversationId] || [];
          conversationArtifacts.forEach(artifactObj => {
            delete newVersions[artifactObj.id];
          });
          
          return {
            artifacts: newArtifacts,
            serverArtifacts: newServerArtifacts,
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
          
          return {
            artifacts: {
              ...state.artifacts,
              [conversationId]: [...currentArtifacts, artifact],
            },
          };
        });
      },
      
      // =====================================
      // OFFLINE/SYNC MANAGEMENT
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
      // CACHE MANAGEMENT
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
          set({ serverArtifacts: {}, artifacts: {}, versions: {} });
        }
      },
      
      invalidateCache: (conversationId: string) => {
        console.log(`♻️ [ArtifactStore] Invalidating cache for conversation: ${conversationId}`);
        get().clearCache(conversationId);
      },
    }),
    {
      name: 'olympian-artifact-store-v2',
      version: 4, // Increment version for server-first implementation
      migrate: (persistedState: any, version: number) => {
        console.log(`🔄 [ArtifactStore] Migrating artifact store from version ${version} to 4`);
        
        if (version < 4) {
          console.log(`🔄 [ArtifactStore] Migrating to version 4 (server-first implementation)`);
          
          // Clear old cache to force server reload
          return {
            ...persistedState,
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
        selectedArtifact: state.selectedArtifact,
        viewMode: state.viewMode,
        isArtifactPanelOpen: state.isArtifactPanelOpen,
        versions: state.versions,
        migrationResults: state.migrationResults,
      }),
    }
  )
);
