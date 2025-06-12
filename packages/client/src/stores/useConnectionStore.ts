import { create } from 'zustand';
import { Connection, ScanResult } from '@olympian/shared';
import { api } from '@/services/api';
import { toast } from '@/hooks/useToast';

interface ConnectionStore {
  connections: Connection[];
  isLoading: boolean;
  isScanning: boolean;
  scanResults: ScanResult[];
  
  fetchConnections: () => Promise<void>;
  createConnection: (connection: Omit<Connection, '_id' | 'createdAt' | 'updatedAt' | 'isManual'>) => Promise<void>;
  updateConnection: (id: string, updates: Partial<Connection>) => Promise<void>;
  deleteConnection: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<void>;
  scanConnections: (types?: string[]) => Promise<void>;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connections: [],
  isLoading: false,
  isScanning: false,
  scanResults: [],

  fetchConnections: async () => {
    set({ isLoading: true });
    try {
      const connections = await api.getConnections();
      set({ connections });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to fetch connections',
        variant: 'destructive',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  createConnection: async (connection) => {
    try {
      const newConnection = await api.createConnection(connection);
      set(state => ({ connections: [...state.connections, newConnection] }));
      toast({
        title: 'Success',
        description: 'Connection created successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create connection',
        variant: 'destructive',
      });
      throw error;
    }
  },

  updateConnection: async (id, updates) => {
    try {
      const updatedConnection = await api.updateConnection(id, updates);
      set(state => ({
        connections: state.connections.map(c => c._id === id ? updatedConnection : c),
      }));
      toast({
        title: 'Success',
        description: 'Connection updated successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update connection',
        variant: 'destructive',
      });
      throw error;
    }
  },

  deleteConnection: async (id) => {
    try {
      await api.deleteConnection(id);
      set(state => ({
        connections: state.connections.filter(c => c._id !== id),
      }));
      toast({
        title: 'Success',
        description: 'Connection deleted successfully',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete connection',
        variant: 'destructive',
      });
      throw error;
    }
  },

  testConnection: async (id) => {
    try {
      const result = await api.testConnection(id);
      
      // Update connection status based on test result
      set(state => ({
        connections: state.connections.map(c => 
          c._id === id ? { ...c, status: result.success ? 'online' : 'offline' } : c
        ),
      }));
      
      toast({
        title: result.success ? 'Success' : 'Failed',
        description: result.message,
        variant: result.success ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to test connection',
        variant: 'destructive',
      });
    }
  },

  scanConnections: async (types) => {
    set({ isScanning: true, scanResults: [] });
    try {
      const results = await api.scanConnections(types);
      set({ scanResults: results });
      
      // Automatically fetch updated connections list
      await get().fetchConnections();
      
      toast({
        title: 'Scan Complete',
        description: `Found ${results.length} connections`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to scan connections',
        variant: 'destructive',
      });
    } finally {
      set({ isScanning: false });
    }
  },
}));