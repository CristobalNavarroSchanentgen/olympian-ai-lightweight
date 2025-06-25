import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Artifact, ArtifactViewMode, ArtifactVersion } from '@olympian/shared';

interface ArtifactState {
  // Current artifacts by conversation
  artifacts: Record<string, Artifact[]>; // conversationId -> artifacts
  
  // Currently selected artifact
  selectedArtifact: Artifact | null;
  
  // Current view mode for artifacts
  viewMode: ArtifactViewMode;
  
  // Artifact versions history
  versions: Record<string, ArtifactVersion[]>; // artifactId -> versions
  
  // UI state
  isArtifactPanelOpen: boolean;
  
  // Actions
  createArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt' | 'updatedAt'>) => Artifact;
  updateArtifact: (artifactId: string, content: string, description?: string) => void;
  deleteArtifact: (artifactId: string) => void;
  selectArtifact: (artifact: Artifact | null) => void;
  setViewMode: (mode: ArtifactViewMode) => void;
  toggleArtifactPanel: () => void;
  setArtifactPanelOpen: (open: boolean) => void;
  
  // Get artifacts for a conversation
  getArtifactsForConversation: (conversationId: string) => Artifact[];
  
  // Get artifact by ID
  getArtifactById: (artifactId: string) => Artifact | null;
  
  // Get artifact by message ID
  getArtifactByMessageId: (messageId: string) => Artifact | null;
  
  // Get versions for an artifact
  getVersionsForArtifact: (artifactId: string) => ArtifactVersion[];
  
  // Revert to a specific version
  revertToVersion: (artifactId: string, version: number) => void;
  
  // Clear artifacts for a conversation
  clearArtifactsForConversation: (conversationId: string) => void;
  
  // Recreate artifact from existing data (for conversation loading)
  recreateArtifact: (artifact: Artifact) => void;
}

function generateArtifactId(): string {
  return `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export const useArtifactStore = create<ArtifactState>()(
  persist(
    (set, get) => ({
      artifacts: {},
      selectedArtifact: null,
      viewMode: 'preview',
      versions: {},
      isArtifactPanelOpen: false,
      
      createArtifact: (artifactData) => {
        const now = new Date();
        const artifact: Artifact = {
          ...artifactData,
          id: generateArtifactId(),
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        
        set((state) => {
          const conversationId = artifact.conversationId;
          const currentArtifacts = state.artifacts[conversationId] || [];
          
          // Create initial version
          const initialVersion: ArtifactVersion = {
            version: 1,
            content: artifact.content,
            createdAt: now,
            description: 'Initial version',
          };
          
          return {
            artifacts: {
              ...state.artifacts,
              [conversationId]: [...currentArtifacts, artifact],
            },
            versions: {
              ...state.versions,
              [artifact.id]: [initialVersion],
            },
            selectedArtifact: artifact,
            isArtifactPanelOpen: true,
          };
        });
        
        return artifact;
      },
      
      recreateArtifact: (artifact) => {
        console.log('🔧 [useArtifactStore] Recreating artifact:', {
          id: artifact.id,
          conversationId: artifact.conversationId,
          title: artifact.title,
          type: artifact.type
        });
        
        set((state) => {
          const conversationId = artifact.conversationId;
          const currentArtifacts = state.artifacts[conversationId] || [];
          
          // Check if artifact already exists by ID
          const existingArtifact = currentArtifacts.find(a => a.id === artifact.id);
          if (existingArtifact) {
            console.log('⚠️ [useArtifactStore] Artifact already exists, updating instead of recreating:', artifact.id);
            
            // Update the existing artifact with new data
            const updatedArtifacts = currentArtifacts.map(a => 
              a.id === artifact.id ? { ...artifact } : a
            );
            
            // Ensure version history exists
            const currentVersions = state.versions[artifact.id] || [];
            
            return {
              artifacts: {
                ...state.artifacts,
                [conversationId]: updatedArtifacts,
              },
              versions: {
                ...state.versions,
                [artifact.id]: currentVersions.length === 0 ? [{
                  version: artifact.version || 1,
                  content: artifact.content,
                  createdAt: artifact.createdAt,
                  description: 'Recreated from conversation history',
                }] : currentVersions,
              },
            };
          }
          
          // Create new artifact with the provided ID (from conversation history)
          console.log('✨ [useArtifactStore] Creating new artifact from conversation history:', artifact.id);
          
          // Create initial version for recreated artifact
          const initialVersion: ArtifactVersion = {
            version: artifact.version || 1,
            content: artifact.content,
            createdAt: artifact.createdAt,
            description: 'Recreated from conversation history',
          };
          
          return {
            artifacts: {
              ...state.artifacts,
              [conversationId]: [...currentArtifacts, artifact],
            },
            versions: {
              ...state.versions,
              [artifact.id]: [initialVersion],
            },
          };
        });
        
        console.log('✅ [useArtifactStore] Artifact recreation complete:', artifact.id);
      },
      
      updateArtifact: (artifactId, content, description) => {
        set((state) => {
          const allArtifacts = Object.values(state.artifacts).flat();
          const artifact = allArtifacts.find(a => a.id === artifactId);
          
          if (!artifact) return state;
          
          const now = new Date();
          const newVersion = artifact.version + 1;
          
          // Create new version
          const newVersionEntry: ArtifactVersion = {
            version: newVersion,
            content,
            createdAt: now,
            description: description || `Version ${newVersion}`,
          };
          
          // Update artifact
          const updatedArtifact: Artifact = {
            ...artifact,
            content,
            version: newVersion,
            updatedAt: now,
          };
          
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
            versions: {
              ...state.versions,
              [artifactId]: [...(state.versions[artifactId] || []), newVersionEntry],
            },
            selectedArtifact: state.selectedArtifact?.id === artifactId ? updatedArtifact : state.selectedArtifact,
          };
        });
      },
      
      deleteArtifact: (artifactId) => {
        set((state) => {
          const allArtifacts = Object.values(state.artifacts).flat();
          const artifact = allArtifacts.find(a => a.id === artifactId);
          
          if (!artifact) return state;
          
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
      },
      
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
      
      getArtifactsForConversation: (conversationId) => {
        const state = get();
        return state.artifacts[conversationId] || [];
      },
      
      getArtifactById: (artifactId) => {
        const state = get();
        const allArtifacts = Object.values(state.artifacts).flat();
        const artifact = allArtifacts.find(a => a.id === artifactId) || null;
        
        if (!artifact) {
          console.warn('🔍 [useArtifactStore] Artifact not found by ID:', {
            artifactId,
            availableArtifacts: allArtifacts.map(a => ({ id: a.id, conversationId: a.conversationId }))
          });
        }
        
        return artifact;
      },
      
      getArtifactByMessageId: (messageId) => {
        const state = get();
        const allArtifacts = Object.values(state.artifacts).flat();
        const artifact = allArtifacts.find(a => a.messageId === messageId) || null;
        
        if (!artifact) {
          console.warn('🔍 [useArtifactStore] Artifact not found by message ID:', {
            messageId,
            availableArtifacts: allArtifacts.map(a => ({ id: a.id, messageId: a.messageId }))
          });
        }
        
        return artifact;
      },
      
      getVersionsForArtifact: (artifactId) => {
        const state = get();
        return state.versions[artifactId] || [];
      },
      
      revertToVersion: (artifactId, version) => {
        const state = get();
        const versions = state.versions[artifactId] || [];
        const targetVersion = versions.find(v => v.version === version);
        
        if (targetVersion) {
          get().updateArtifact(artifactId, targetVersion.content, `Reverted to version ${version}`);
        }
      },
      
      clearArtifactsForConversation: (conversationId) => {
        console.log('🧹 [useArtifactStore] Clearing artifacts for conversation:', conversationId);
        set((state) => {
          const conversationArtifacts = state.artifacts[conversationId] || [];
          console.log('🧹 [useArtifactStore] Found artifacts to clear:', conversationArtifacts.map(a => a.id));
          
          // Remove versions for all artifacts in this conversation
          const newVersions = { ...state.versions };
          conversationArtifacts.forEach(artifact => {
            delete newVersions[artifact.id];
          });
          
          const newArtifacts = { ...state.artifacts };
          delete newArtifacts[conversationId];
          
          return {
            artifacts: newArtifacts,
            versions: newVersions,
            selectedArtifact: conversationArtifacts.some(a => a.id === state.selectedArtifact?.id) 
              ? null 
              : state.selectedArtifact,
          };
        });
        
        // Log final state for debugging
        const finalState = get();
        console.log('🧹 [useArtifactStore] Artifacts cleared. Final state:', {
          conversationId,
          remainingArtifacts: Object.keys(finalState.artifacts),
          totalArtifactCount: Object.values(finalState.artifacts).flat().length
        });
      },
    }),
    {
      name: 'olympian-artifact-store',
      version: 3, // Increment version for improved artifact persistence
      migrate: (persistedState: any, version: number) => {
        console.log('🔄 [useArtifactStore] Migrating artifact store from version', version, 'to 3');
        
        if (version < 2) {
          // For artifacts that don't have messageId, it's okay to leave it undefined
          console.log('🔄 [useArtifactStore] Migrating artifact store to version 2 (messageId field)');
        }
        
        if (version < 3) {
          // Enhanced artifact persistence improvements
          console.log('🔄 [useArtifactStore] Migrating artifact store to version 3 (enhanced persistence)');
          
          // Ensure all artifacts have proper structure
          if (persistedState?.artifacts) {
            Object.keys(persistedState.artifacts).forEach(conversationId => {
              const artifacts = persistedState.artifacts[conversationId];
              if (Array.isArray(artifacts)) {
                persistedState.artifacts[conversationId] = artifacts.map((artifact: any) => ({
                  ...artifact,
                  // Ensure required fields exist
                  version: artifact.version || 1,
                  createdAt: artifact.createdAt ? new Date(artifact.createdAt) : new Date(),
                  updatedAt: artifact.updatedAt ? new Date(artifact.updatedAt) : new Date(),
                }));
              }
            });
          }
        }
        
        return persistedState;
      },
    }
  )
);