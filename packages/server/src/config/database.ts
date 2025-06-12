import { DatabaseConfig } from '@olympian/shared';

export const mongoConfig: DatabaseConfig = {
  connectionString: process.env.MONGODB_URI || 'mongodb://localhost:27017/olympian_ai_lite',
  options: {
    maxPoolSize: 10,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 5000,
  },
};