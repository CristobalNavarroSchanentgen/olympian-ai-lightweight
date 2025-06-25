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
        console.log('🔧 [useArtifactStore] Recreating artifact:', artifact.id);
        
        set((state) => {
          const conversationId = artifact.conversationId;
          const currentArtifacts = state.artifacts[conversationId] || [];
          
          // Check if artifact already exists
          const existingArtifact = currentArtifacts.find(a => a.id === artifact.id);
          if (existingArtifact) {
            console.log('⚠️ [useArtifactStore] Artifact already exists, skipping recreation:', artifact.id);
            return state;
          }
          
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
        return allArtifacts.find(a => a.id === artifactId) || null;
      },
      
      getArtifactByMessageId: (messageId) => {
        const state = get();
        const allArtifacts = Object.values(state.artifacts).flat();
        return allArtifacts.find(a => a.messageId === messageId) || null;
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
      },
    }),
    {
      name: 'olympian-artifact-store',
      version: 2, // Increment version to handle new messageId field
      migrate: (persistedState: any, version: number) => {
        if (version < 2) {
          // For artifacts that don't have messageId, it's okay to leave it undefined
          // The field is optional and we can't retroactively determine the messageId
          console.log('🔄 [useArtifactStore] Migrating artifact store to version 2');
        }
        return persistedState;
      },
    }
  )
);