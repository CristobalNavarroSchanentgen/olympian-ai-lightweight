import { DatabaseService } from './DatabaseService';
import { ObjectId } from 'mongodb';

export interface ArtifactVersion {
  artifactId: string;
  version: number;
  content: string;
  createdAt: Date;
  updatedAt: Date;
  checksum: string;
}

/**
 * Service to manage artifact version history
 */
export class ArtifactVersionService {
  private static instance: ArtifactVersionService;
  private db: DatabaseService;

  private constructor() {
    this.db = DatabaseService.getInstance();
  }

  public static getInstance(): ArtifactVersionService {
    if (!ArtifactVersionService.instance) {
      ArtifactVersionService.instance = new ArtifactVersionService();
    }
    return ArtifactVersionService.instance;
  }

  /**
   * Save a version snapshot when artifact is updated
   */
  public async saveVersion(artifactId: string, version: number, content: string, checksum: string): Promise<void> {
    const now = new Date();
    await this.db.getDatabase().collection('artifact_versions').insertOne({
      artifactId,
      version,
      content,
      checksum,
      createdAt: now,
      updatedAt: now
    });
  }

  /**
   * Get all versions for an artifact
   */
  public async getVersions(artifactId: string): Promise<ArtifactVersion[]> {
    const versions = await this.db.getDatabase().collection('artifact_versions')
      .find({ artifactId })
      .sort({ version: -1 })
      .toArray();
    
    return versions as unknown as ArtifactVersion[];
  }

  /**
   * Get specific version of an artifact
   */
  public async getVersion(artifactId: string, version: number): Promise<ArtifactVersion | null> {
    const versionDoc = await this.db.getDatabase().collection('artifact_versions')
      .findOne({ artifactId, version });
    
    return versionDoc as unknown as ArtifactVersion;
  }
}
