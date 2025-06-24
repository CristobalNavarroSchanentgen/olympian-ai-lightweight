// Debug utility for WebSocket monitoring in multi-host deployment
// Add this to browser console: localStorage.debug = '*'; then reload
// Or use window.olympianDebug.enableVerboseLogging()

import { webSocketChatService } from '@/services/websocketChat';

interface DebugInfo {
  websocket: any;
  messages: any[];
  events: any[];
  performance: any;
}

class OlympianDebugger {
  private eventLog: any[] = [];
  private messageLog: any[] = [];
  private performanceLog: any[] = [];
  private verboseLogging = false;

  enableVerboseLogging() {
    this.verboseLogging = true;
    localStorage.setItem('olympian-debug', 'true');
    localStorage.setItem('debug', '*'); // Enable all Socket.IO debug logs
    console.log('🐛 [OlympianDebug] Verbose logging enabled. Reload page for full Socket.IO debug logs.');
    return 'Verbose logging enabled. Reload the page to see full Socket.IO debug output.';
  }

  disableVerboseLogging() {
    this.verboseLogging = false;
    localStorage.removeItem('olympian-debug');
    localStorage.removeItem('debug');
    console.log('🐛 [OlympianDebug] Verbose logging disabled.');
    return 'Verbose logging disabled. Reload the page to stop debug output.';
  }

  getConnectionInfo() {
    const wsInfo = webSocketChatService.getConnectionInfo();
    const info = {
      websocket: wsInfo,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      location: {
        href: window.location.href,
        protocol: window.location.protocol,
        hostname: window.location.hostname,
        port: window.location.port
      }
    };
    
    console.log('🐛 [OlympianDebug] Connection Info:', info);
    return info;
  }

  getMessageStates() {
    const states = webSocketChatService.getMessageStates();
    console.log('🐛 [OlympianDebug] Message States:', states);
    return states;
  }

  getEventLog() {
    console.log('🐛 [OlympianDebug] Event Log:', this.eventLog);
    return this.eventLog;
  }

  clearEventLog() {
    this.eventLog = [];
    this.messageLog = [];
    this.performanceLog = [];
    console.log('🐛 [OlympianDebug] Logs cleared.');
    return 'Logs cleared.';
  }

  logEvent(type: string, data: any) {
    const logEntry = {
      timestamp: Date.now(),
      type,
      data,
      connectionId: webSocketChatService.getConnectionInfo()?.id
    };
    
    this.eventLog.push(logEntry);
    
    if (this.verboseLogging) {
      console.log(`🐛 [OlympianDebug] Event: ${type}`, logEntry);
    }
    
    // Keep only last 100 events
    if (this.eventLog.length > 100) {
      this.eventLog = this.eventLog.slice(-100);
    }
  }

  testWebSocketConnection() {
    console.log('🐛 [OlympianDebug] Testing WebSocket connection...');
    
    const info = this.getConnectionInfo();
    const states = this.getMessageStates();
    
    const report = {
      connected: info.websocket?.connected || false,
      transport: info.websocket?.transport || 'unknown',
      socketId: info.websocket?.id || 'none',
      activeMessages: states.length,
      lastHeartbeat: info.websocket?.heartbeatAge || 'unknown',
      issues: [] as string[]
    };
    
    // Check for issues
    if (!report.connected) {
      report.issues.push('WebSocket not connected');
    }
    
    if (typeof report.lastHeartbeat === 'number' && report.lastHeartbeat > 60) {
      report.issues.push(`Heartbeat too old: ${report.lastHeartbeat}s`);
    }
    
    if (states.some(s => s.duration > 120)) {
      report.issues.push('Messages stuck for >2 minutes');
    }
    
    console.log('🐛 [OlympianDebug] Connection Test Report:', report);
    return report;
  }

  simulateStuckMessage() {
    console.log('🐛 [OlympianDebug] Simulating stuck message for testing...');
    
    // This would help test the auto-recovery mechanism
    const mockHandlers = {
      onThinking: (data: any) => console.log('Mock thinking:', data),
      onGenerating: (data: any) => console.log('Mock generating:', data),
      onToken: (data: any) => console.log('Mock token:', data),
      onComplete: (data: any) => console.log('Mock complete:', data),
      onError: (data: any) => console.log('Mock error:', data)
    };
    
    return webSocketChatService.sendMessage({
      content: 'Debug test message',
      model: 'test-model'
    }, mockHandlers);
  }

  getDebugInfo(): DebugInfo {
    return {
      websocket: this.getConnectionInfo(),
      messages: this.getMessageStates(),
      events: this.eventLog.slice(-20), // Last 20 events
      performance: this.performanceLog.slice(-10) // Last 10 performance entries
    };
  }

  exportDebugData() {
    const debugData = {
      timestamp: new Date().toISOString(),
      debugInfo: this.getDebugInfo(),
      userAgent: navigator.userAgent,
      location: window.location.href,
      localStorage: {
        debug: localStorage.getItem('debug'),
        olympianDebug: localStorage.getItem('olympian-debug')
      }
    };
    
    const blob = new Blob([JSON.stringify(debugData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `olympian-debug-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    console.log('🐛 [OlympianDebug] Debug data exported to file.');
    return 'Debug data exported to download.';
  }

  help() {
    const help = `
🐛 Olympian AI Debug Console

Available commands:
  olympianDebug.enableVerboseLogging()  - Enable detailed Socket.IO logs
  olympianDebug.disableVerboseLogging() - Disable verbose logging
  olympianDebug.getConnectionInfo()     - Get WebSocket connection status
  olympianDebug.getMessageStates()      - Get active message states
  olympianDebug.testWebSocketConnection() - Run connection diagnostics
  olympianDebug.getEventLog()           - View recent events
  olympianDebug.clearEventLog()         - Clear event logs
  olympianDebug.exportDebugData()       - Export debug data to file
  olympianDebug.simulateStuckMessage()  - Test recovery mechanisms
  olympianDebug.help()                  - Show this help

Multi-host debugging tips:
1. Check if events are being received: olympianDebug.getEventLog()
2. Monitor stuck messages: olympianDebug.getMessageStates()
3. Test connection health: olympianDebug.testWebSocketConnection()
4. Export data for support: olympianDebug.exportDebugData()

For full Socket.IO debug logs, use olympianDebug.enableVerboseLogging() and reload.
    `;
    
    console.log(help);
    return help;
  }
}

// Create global debug instance
const olympianDebug = new OlympianDebugger();

// Initialize debug mode if enabled
if (localStorage.getItem('olympian-debug') === 'true') {
  olympianDebug.enableVerboseLogging();
}

// Make it available globally for console access
(window as any).olympianDebug = olympianDebug;

// Auto-log major events if verbose logging is enabled
if (localStorage.getItem('olympian-debug') === 'true') {
  // Override console methods to capture WebSocket events
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;
  
  console.log = (...args) => {
    originalLog.apply(console, args);
    if (args[0]?.includes?.('[WebSocketChat]')) {
      olympianDebug.logEvent('websocket-log', args);
    }
  };
  
  console.error = (...args) => {
    originalError.apply(console, args);
    if (args[0]?.includes?.('[WebSocketChat]')) {
      olympianDebug.logEvent('websocket-error', args);
    }
  };
  
  console.warn = (...args) => {
    originalWarn.apply(console, args);
    if (args[0]?.includes?.('[WebSocketChat]')) {
      olympianDebug.logEvent('websocket-warn', args);
    }
  };
}

console.log(`🐛 Olympian Debug Console available as 'olympianDebug'`);
console.log(`🐛 Type 'olympianDebug.help()' for available commands`);

export { olympianDebug };