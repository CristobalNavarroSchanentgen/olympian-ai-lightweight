/**
 * 🎯 BULLETPROOF CHAT HOOK
 * 
 * React hook following best practices from Context7 documentation
 * for managing WebSocket chat operations with the bulletproof service.
 * 
 * Key features:
 * - Proper memoization and effect dependencies
 * - Deterministic state management
 * - Comprehensive error handling
 * - Multi-host deployment optimizations
 * - Performance monitoring and debugging
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { bulletproofWebSocketChatService, ChatHandlers } from '../services/bulletproofWebSocketChat';
import { messageLifecycleManager, MessageLifecycle } from '../services/messageIdManager';
import { toast } from '@/hooks/useToast';

export interface UseBulletproofChatOptions {
  autoConnect?: boolean;
  onConnectionChange?: (connected: boolean) => void;
  onError?: (error: string) => void;
  enableDebugLogging?: boolean;
}

export interface UseBulletproofChatResult {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  
  // Message operations
  sendMessage: (params: {
    content: string;
    model: string;
    visionModel?: string;
    conversationId?: string;
    images?: string[];
  }, handlers: ChatHandlers) => Promise<string>;
  
  cancelMessage: (messageId: string) => void;
  
  // Connection management
  connect: () => Promise<void>;
  disconnect: () => void;
  
  // Monitoring and debugging
  getConnectionInfo: () => any;
  getActiveMessages: () => MessageLifecycle[];
  getConnectionStats: () => {
    totalMessages: number;
    byState: Record<string, number>;
    queuedEvents: number;
    uptime: number;
  };
}

/**
 * 🎯 Custom hook for bulletproof chat operations
 * 
 * Follows React best practices:
 * - Proper memoization with useCallback and useMemo
 * - Correct effect dependencies
 * - Cleanup on unmount
 * - Error boundaries and graceful degradation
 */
export function useBulletproofChat(options: UseBulletproofChatOptions = {}): UseBulletproofChatResult {
  const {
    autoConnect = true,
    onConnectionChange,
    onError,
    enableDebugLogging = false
  } = options;

  // Connection state with proper typing
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  // Track connection start time for uptime calculation
  const connectionStartTime = useRef<number | null>(null);
  
  // Monitoring interval ref for cleanup
  const monitoringInterval = useRef<NodeJS.Timeout | null>(null);

  /**
   * 🔌 Connection management with proper error handling
   * Memoized to prevent unnecessary re-creation
   */
  const connect = useCallback(async (): Promise<void> => {
    if (isConnecting || isConnected) {
      if (enableDebugLogging) {
        console.log('[useBulletproofChat] ⏳ Connection already in progress or established');
      }
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      await bulletproofWebSocketChatService.connect();
      
      setIsConnected(true);
      setIsConnecting(false);
      connectionStartTime.current = Date.now();
      
      if (enableDebugLogging) {
        console.log('[useBulletproofChat] ✅ Connected successfully');
      }
      
      // Notify parent component of connection change
      onConnectionChange?.(true);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown connection error';
      
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionError(errorMessage);
      
      console.error('[useBulletproofChat] ❌ Connection failed:', error);
      
      // Notify error handlers
      onError?.(errorMessage);
      onConnectionChange?.(false);
      
      // Show user-friendly error
      toast({
        title: 'Connection Error',
        description: 'Failed to establish real-time connection. Using fallback mode.',
        variant: 'destructive',
      });
    }
  }, [isConnecting, isConnected, enableDebugLogging, onConnectionChange, onError]);

  /**
   * 🔌 Disconnect with cleanup
   * Memoized to prevent unnecessary re-creation
   */
  const disconnect = useCallback((): void => {
    if (enableDebugLogging) {
      console.log('[useBulletproofChat] 🔌 Disconnecting...');
    }

    try {
      bulletproofWebSocketChatService.disconnect();
      
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionError(null);
      connectionStartTime.current = null;
      
      onConnectionChange?.(false);
      
    } catch (error) {
      console.error('[useBulletproofChat] ❌ Error during disconnect:', error);
    }
  }, [enableDebugLogging, onConnectionChange]);

  /**
   * 📤 Send message with bulletproof error handling
   * Memoized to prevent unnecessary re-creation
   */
  const sendMessage = useCallback(async (
    params: {
      content: string;
      model: string;
      visionModel?: string;
      conversationId?: string;
      images?: string[];
    },
    handlers: ChatHandlers
  ): Promise<string> => {
    if (!isConnected) {
      const error = 'Cannot send message: not connected to server';
      console.error('[useBulletproofChat] ❌', error);
      onError?.(error);
      throw new Error(error);
    }

    try {
      const messageId = await bulletproofWebSocketChatService.sendMessage(params, handlers);
      
      if (enableDebugLogging) {
        console.log('[useBulletproofChat] ✅ Message sent successfully:', messageId);
      }
      
      return messageId;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown send error';
      console.error('[useBulletproofChat] ❌ Send message failed:', error);
      
      onError?.(errorMessage);
      
      toast({
        title: 'Message Error',
        description: 'Failed to send message. Please try again.',
        variant: 'destructive',
      });
      
      throw error;
    }
  }, [isConnected, enableDebugLogging, onError]);

  /**
   * ❌ Cancel message with error handling
   * Memoized to prevent unnecessary re-creation
   */
  const cancelMessage = useCallback((messageId: string): void => {
    try {
      bulletproofWebSocketChatService.cancelMessage(messageId);
      
      if (enableDebugLogging) {
        console.log('[useBulletproofChat] ❌ Message cancelled:', messageId);
      }
      
    } catch (error) {
      console.error('[useBulletproofChat] ❌ Error cancelling message:', error);
    }
  }, [enableDebugLogging]);

  /**
   * 📊 Get connection info for debugging
   * Memoized to prevent unnecessary re-creation
   */
  const getConnectionInfo = useCallback(() => {
    return bulletproofWebSocketChatService.getConnectionInfo();
  }, []);

  /**
   * 📋 Get active messages for monitoring
   * Memoized to prevent unnecessary re-creation
   */
  const getActiveMessages = useCallback((): MessageLifecycle[] => {
    return messageLifecycleManager.getAllActiveMessages();
  }, []);

  /**
   * 📈 Get connection statistics
   * Memoized with dependencies to ensure accurate data
   */
  const getConnectionStats = useCallback(() => {
    const messageStats = messageLifecycleManager.getStats();
    const connectionInfo = bulletproofWebSocketChatService.getConnectionInfo();
    const uptime = connectionStartTime.current ? Date.now() - connectionStartTime.current : 0;
    
    return {
      totalMessages: messageStats.totalMessages,
      byState: messageStats.byState,
      queuedEvents: connectionInfo?.queuedEvents || 0,
      uptime: Math.round(uptime / 1000) // Convert to seconds
    };
  }, []);

  /**
   * 🎛️ Auto-connect effect with proper dependencies
   * Following React useEffect best practices from Context7
   */
  useEffect(() => {
    if (autoConnect && !isConnected && !isConnecting) {
      if (enableDebugLogging) {
        console.log('[useBulletproofChat] 🚀 Auto-connecting...');
      }
      
      // Use async function inside effect for proper error handling
      const performAutoConnect = async () => {
        try {
          await connect();
        } catch (error) {
          // Error already handled in connect function
          if (enableDebugLogging) {
            console.log('[useBulletproofChat] ❌ Auto-connect failed');
          }
        }
      };
      
      performAutoConnect();
    }
  }, [autoConnect, isConnected, isConnecting, connect, enableDebugLogging]);

  /**
   * 📊 Connection monitoring effect
   * Monitors connection health and provides debugging info
   */
  useEffect(() => {
    if (isConnected && enableDebugLogging) {
      monitoringInterval.current = setInterval(() => {
        const stats = getConnectionStats();
        const connectionInfo = getConnectionInfo();
        
        console.log('[useBulletproofChat] 📊 Connection health:', {
          uptime: `${stats.uptime}s`,
          activeMessages: stats.totalMessages,
          messagesByState: stats.byState,
          queuedEvents: stats.queuedEvents,
          transport: connectionInfo?.transport,
          lastHeartbeat: connectionInfo?.heartbeatAge ? `${connectionInfo.heartbeatAge}s ago` : 'unknown'
        });
      }, 30000); // Every 30 seconds
      
      return () => {
        if (monitoringInterval.current) {
          clearInterval(monitoringInterval.current);
          monitoringInterval.current = null;
        }
      };
    }
  }, [isConnected, enableDebugLogging, getConnectionStats, getConnectionInfo]);

  /**
   * 🧹 Cleanup effect on unmount
   * Following React cleanup patterns from Context7
   */
  useEffect(() => {
    // Cleanup function runs on unmount
    return () => {
      if (enableDebugLogging) {
        console.log('[useBulletproofChat] 🧹 Cleaning up on unmount...');
      }
      
      // Clear monitoring interval
      if (monitoringInterval.current) {
        clearInterval(monitoringInterval.current);
      }
      
      // Disconnect if connected
      if (isConnected) {
        disconnect();
      }
    };
  }, []); // Empty dependency array - only run on unmount

  /**
   * 🎯 Memoized return object to prevent unnecessary re-renders
   * Following React performance best practices from Context7
   */
  const result = useMemo((): UseBulletproofChatResult => ({
    // Connection state
    isConnected,
    isConnecting,
    connectionError,
    
    // Message operations
    sendMessage,
    cancelMessage,
    
    // Connection management
    connect,
    disconnect,
    
    // Monitoring and debugging
    getConnectionInfo,
    getActiveMessages,
    getConnectionStats
  }), [
    isConnected,
    isConnecting,
    connectionError,
    sendMessage,
    cancelMessage,
    connect,
    disconnect,
    getConnectionInfo,
    getActiveMessages,
    getConnectionStats
  ]);

  return result;
}

/**
 * 🔧 Hook for debugging bulletproof chat
 * Provides additional debugging utilities and real-time monitoring
 */
export function useBulletproofChatDebug() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  
  const refreshDebugInfo = useCallback(() => {
    const connectionInfo = bulletproofWebSocketChatService.getConnectionInfo();
    const messageStats = messageLifecycleManager.getStats();
    const activeMessages = messageLifecycleManager.getAllActiveMessages();
    
    setDebugInfo({
      timestamp: new Date().toISOString(),
      connection: connectionInfo,
      messageStats,
      activeMessages: activeMessages.map(msg => ({
        id: msg.id,
        state: msg.state,
        age: Date.now() - msg.createdAt,
        lastActivity: Date.now() - msg.lastActivity,
        tokenCount: msg.tokenCount
      }))
    });
  }, []);
  
  // Auto-refresh debug info every 5 seconds
  useEffect(() => {
    refreshDebugInfo();
    const interval = setInterval(refreshDebugInfo, 5000);
    return () => clearInterval(interval);
  }, [refreshDebugInfo]);
  
  return {
    debugInfo,
    refreshDebugInfo,
    exportDebugInfo: useCallback(() => {
      return JSON.stringify(debugInfo, null, 2);
    }, [debugInfo])
  };
}

/**
 * 📊 Hook for monitoring chat performance
 * Provides performance metrics and alerts
 */
export function useBulletproofChatMonitoring() {
  const [metrics, setMetrics] = useState({
    averageResponseTime: 0,
    totalMessages: 0,
    successRate: 0,
    errorCount: 0,
    lastError: null as string | null
  });
  
  const updateMetrics = useCallback(() => {
    const stats = messageLifecycleManager.getStats();
    const activeMessages = messageLifecycleManager.getAllActiveMessages();
    
    // Calculate success rate
    const completedMessages = stats.byState.complete || 0;
    const errorMessages = stats.byState.error || 0;
    const totalFinished = completedMessages + errorMessages;
    const successRate = totalFinished > 0 ? (completedMessages / totalFinished) * 100 : 0;
    
    // Calculate average response time for completed messages
    const completedMessagesData = activeMessages.filter(msg => msg.state === 'complete');
    const averageResponseTime = completedMessagesData.length > 0
      ? completedMessagesData.reduce((sum, msg) => sum + (msg.lastActivity - msg.createdAt), 0) / completedMessagesData.length
      : 0;
    
    setMetrics({
      averageResponseTime: Math.round(averageResponseTime),
      totalMessages: stats.totalMessages,
      successRate: Math.round(successRate * 100) / 100,
      errorCount: errorMessages,
      lastError: null // Would need to track this separately
    });
  }, []);
  
  useEffect(() => {
    updateMetrics();
    const interval = setInterval(updateMetrics, 10000); // Every 10 seconds
    return () => clearInterval(interval);
  }, [updateMetrics]);
  
  return metrics;
}
