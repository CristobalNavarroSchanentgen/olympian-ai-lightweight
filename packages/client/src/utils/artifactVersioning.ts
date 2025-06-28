import { Artifact } from '@olympian/shared';

/**
 * Calculates the version number for an artifact based on its title within a group of artifacts.
 * Artifacts with the same title (case-insensitive) are considered versions of each other.
 * The version number is determined by the creation date order (oldest = v1, newest = highest version).
 * 
 * @param artifact The artifact to calculate the version for
 * @param allArtifacts All artifacts in the same conversation
 * @returns The calculated version number
 */
export function calculateArtifactVersion(artifact: Artifact, allArtifacts: Artifact[]): number {
  // Normalize the title for comparison
  const normalizedTitle = artifact.title.toLowerCase().trim();
  
  // Find all artifacts with the same title
  const sameTitle = allArtifacts.filter(a => 
    a.title.toLowerCase().trim() === normalizedTitle
  );
  
  // Sort by creation date (oldest first)
  const sorted = sameTitle.sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  // Find the position of the current artifact
  const position = sorted.findIndex(a => a.id === artifact.id);
  
  // Version number is position + 1 (1-indexed)
  return position + 1;
}

/**
 * Creates a map of artifact IDs to their calculated version numbers.
 * This is useful for batch processing multiple artifacts.
 * 
 * @param artifacts All artifacts to calculate versions for
 * @returns A map of artifact ID to version number
 */
export function calculateArtifactVersionMap(artifacts: Artifact[]): Map<string, number> {
  const versionMap = new Map<string, number>();
  
  // Group artifacts by normalized title
  const titleGroups = new Map<string, Artifact[]>();
  
  artifacts.forEach(artifact => {
    const normalizedTitle = artifact.title.toLowerCase().trim();
    if (!titleGroups.has(normalizedTitle)) {
      titleGroups.set(normalizedTitle, []);
    }
    titleGroups.get(normalizedTitle)!.push(artifact);
  });
  
  // Sort each group and assign versions
  titleGroups.forEach((group) => {
    const sorted = [...group].sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    
    sorted.forEach((artifact, index) => {
      versionMap.set(artifact.id, index + 1);
    });
  });
  
  return versionMap;
}
