// Stub for legacy customModelCapabilityService - to be removed after full transition
export const customModelCapabilityService = {
  isInitialized: true,
  lastUpdated: new Date(),
  capabilities: new Map(),
  errors: [],
  detectionEnabled: false,
  
  async getCapabilities() {
    return new Map();
  },
  
  async detectCapabilities() {
    return new Map();
  },
  
  getLastError() {
    return null;
  },
  
  async initialize() {
    return;
  },
  
  getCapabilityStats() {
    return {};
  },
  
  getAvailableModelNames() {
    return [];
  },
  
  getCustomVisionModels() {
    return [];
  },
  
  getCustomToolsModels() {
    return [];
  },
  
  getCustomReasoningModels() {
    return [];
  },
  
  getModelCapability(model: string) {
    return {
      name: model,
      vision: false,
      tools: false,
      reasoning: false,
      maxTokens: 4096,
      contextWindow: 8192
    };
  },
  
  getAllCustomCapabilities() {
    return [];
  }
};
