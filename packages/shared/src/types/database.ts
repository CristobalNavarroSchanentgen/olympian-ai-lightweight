export interface DatabaseConfig {
  connectionString: string;
  options: {
    maxPoolSize: number;
    minPoolSize: number;
    serverSelectionTimeoutMS: number;
  };
}

export interface CollectionInfo {
  name: string;
  documentCount: number;
  sizeInBytes: number;
  indexes: IndexInfo[];
}

export interface IndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
}