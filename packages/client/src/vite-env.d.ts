/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_UI_DEBUG_MODE?: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_RENDER_DEBUG?: string;
  readonly VITE_ERROR_BOUNDARY_DEBUG?: string;
  readonly VITE_CONTENT_SANITIZER_DEBUG?: string;
  readonly VITE_PERFORMANCE_MONITORING?: string;
  readonly VITE_COMPONENT_TRACKING?: string;
  readonly VITE_STATE_MONITORING?: string;
  readonly VITE_EFFECT_DEBUGGING?: string;
  readonly VITE_MARKDOWN_DEBUG?: string;
  readonly VITE_TYPEWRITER_DEBUG?: string;
  readonly VITE_WEBSOCKET_DEBUG?: string;
  readonly VITE_STREAMING_DEBUG?: string;
  readonly VITE_ZUSTAND_DEBUG?: string;
  // Add other environment variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Extend Window interface for debug tools
declare global {
  interface Window {
    __REACT_DEVTOOLS_GLOBAL_HOOK__?: any;
    uiLogger?: any;
    crashAnalyzer?: any;
    debugManager?: any;
    exportUILogs?: () => any;
    printCrashSummary?: () => void;
    exportCrashData?: () => any;
  }
}

export {};
