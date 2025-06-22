import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Artifact, ArtifactType, ArtifactViewMode, ArtifactVersion } from '@olympian/shared';

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
  
  // Get versions for an artifact
  getVersionsForArtifact: (artifactId: string) => ArtifactVersion[];
  
  // Revert to a specific version
  revertToVersion: (artifactId: string, version: number) => void;
  
  // Clear artifacts for a conversation
  clearArtifactsForConversation: (conversationId: string) => void;
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
      version: 1,
    }
  )
);
