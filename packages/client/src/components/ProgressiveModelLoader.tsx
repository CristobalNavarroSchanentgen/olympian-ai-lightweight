import React, { useState } from 'react';
import { ModelCapability } from '@olympian/shared';
import { useProgressiveModelLoading } from '../hooks/useProgressiveModelLoading';

interface ProgressiveModelLoaderProps {
  onVisionModelsLoaded?: (models: string[]) => void;
  onCapabilitiesLoaded?: (capabilities: ModelCapability[]) => void;
  className?: string;
}

/**
 * Progressive Model Loader Component
 * 
 * This component demonstrates and provides the progressive model loading functionality
 * that solves the timeout issue by streaming model capabilities as they are detected.
 * 
 * Features:
 * - Real-time progress updates
 * - Vision model detection with rolling release
 * - Error handling and retry capabilities
 * - Performance statistics
 * - Manual cache management
 */
export function ProgressiveModelLoader({ 
  onVisionModelsLoaded, 
  onCapabilitiesLoaded,
  className = ''
}: ProgressiveModelLoaderProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [autoReload, setAutoReload] = useState(false);

  const {
    capabilities,
    visionModels,
    isLoading,
    isComplete,
    progress,
    errors,
    stats,
    startLoading,
    clearCache,
    isConnected,
    connectionError
  } = useProgressiveModelLoading({
    autoStart: true, // Start loading immediately
    onVisionModelFound: (model, capability) => {
      console.log(`🎨 Vision model found: ${model}`, capability);
    },
    onModelProcessed: (model, capability) => {
      console.log(`✅ Model processed: ${model}`, capability);
    },
    onLoadingComplete: (state) => {
      console.log('🏁 Progressive loading completed!', state);
      if (onVisionModelsLoaded && visionModels.length > 0) {
        onVisionModelsLoaded(visionModels);
      }
      if (onCapabilitiesLoaded && capabilities.length > 0) {
        onCapabilitiesLoaded(capabilities);
      }
    },
    onError: (error, model) => {
      console.error(`❌ Error processing ${model || 'unknown model'}:`, error);
    }
  });

  const handleStartLoading = () => {
    startLoading(true); // Force reload
  };

  const handleClearCache = async () => {
    try {
      await clearCache();
      if (autoReload) {
        setTimeout(() => startLoading(true), 500);
      }
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  const getStatusColor = () => {
    if (connectionError) return 'text-red-500';
    if (isLoading) return 'text-blue-500';
    if (isComplete) return 'text-green-500';
    return 'text-gray-500';
  };

  const getStatusIcon = () => {
    if (connectionError) return '❌';
    if (isLoading) return '⏳';
    if (isComplete) return '✅';
    return '⚪';
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm border p-6 ${className}`}>
      {/* Header */}
      <div className=\"flex items-center justify-between mb-4\">
        <div className=\"flex items-center space-x-3\">
          <h3 className=\"text-lg font-semibold text-gray-900\">
            Model Capability Detection
          </h3>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusIcon()} {isLoading ? 'Loading...' : isComplete ? 'Complete' : 'Ready'}
          </span>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className=\"text-sm text-blue-600 hover:text-blue-800 transition-colors\"
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>

      {/* Connection Status */}
      {connectionError && (
        <div className=\"bg-red-50 border border-red-200 rounded-md p-3 mb-4\">
          <div className=\"flex items-center\">
            <span className=\"text-red-600 text-sm font-medium\">
              Connection Error: {connectionError}
            </span>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {(isLoading || progress.total > 0) && (
        <div className=\"mb-4\">
          <div className=\"flex justify-between items-center mb-2\">
            <span className=\"text-sm font-medium text-gray-700\">
              Progress: {progress.current} / {progress.total} models
            </span>
            <span className=\"text-sm text-gray-500\">
              {progress.percentage}%
            </span>
          </div>
          <div className=\"w-full bg-gray-200 rounded-full h-2\">
            <div 
              className=\"bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out\"
              style={{ width: `${progress.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className=\"grid grid-cols-2 md:grid-cols-4 gap-4 mb-4\">
        <div className=\"text-center p-3 bg-gray-50 rounded-lg\">
          <div className=\"text-2xl font-bold text-blue-600\">{capabilities.length}</div>
          <div className=\"text-sm text-gray-600\">Total Models</div>
        </div>
        <div className=\"text-center p-3 bg-gray-50 rounded-lg\">
          <div className=\"text-2xl font-bold text-green-600\">{visionModels.length}</div>
          <div className=\"text-sm text-gray-600\">Vision Models</div>
        </div>
        <div className=\"text-center p-3 bg-gray-50 rounded-lg\">
          <div className=\"text-2xl font-bold text-purple-600\">
            {capabilities.filter(c => c.tools).length}
          </div>
          <div className=\"text-sm text-gray-600\">Tool Models</div>
        </div>
        <div className=\"text-center p-3 bg-gray-50 rounded-lg\">
          <div className=\"text-2xl font-bold text-red-600\">{errors.length}</div>
          <div className=\"text-sm text-gray-600\">Errors</div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className=\"flex flex-wrap gap-2 mb-4\">
        <button
          onClick={handleStartLoading}
          disabled={isLoading}
          className=\"px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors\"
        >
          {isLoading ? 'Loading...' : 'Reload Models'}
        </button>
        <button
          onClick={handleClearCache}
          disabled={isLoading}
          className=\"px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors\"
        >
          Clear Cache
        </button>
        <label className=\"flex items-center space-x-2 px-3 py-2 bg-gray-100 rounded-md\">
          <input
            type=\"checkbox\"
            checked={autoReload}
            onChange={(e) => setAutoReload(e.target.checked)}
            className=\"rounded\"
          />
          <span className=\"text-sm text-gray-700\">Auto-reload after clear</span>
        </label>
      </div>

      {/* Detailed Information */}
      {showDetails && (
        <div className=\"space-y-4 border-t pt-4\">
          {/* Performance Stats */}
          {stats.totalTime > 0 && (
            <div className=\"bg-blue-50 rounded-lg p-4\">
              <h4 className=\"font-medium text-gray-900 mb-2\">Performance Statistics</h4>
              <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4 text-sm\">
                <div>
                  <span className=\"text-gray-600\">Total Time:</span>
                  <span className=\"ml-2 font-medium\">{Math.round(stats.totalTime / 1000)}s</span>
                </div>
                <div>
                  <span className=\"text-gray-600\">Avg per Model:</span>
                  <span className=\"ml-2 font-medium\">{Math.round(stats.averageTimePerModel / 1000)}s</span>
                </div>
                <div>
                  <span className=\"text-gray-600\">Success Rate:</span>
                  <span className=\"ml-2 font-medium\">{Math.round(stats.successRate)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Connection Status */}
          <div className=\"bg-gray-50 rounded-lg p-4\">
            <h4 className=\"font-medium text-gray-900 mb-2\">Connection Status</h4>
            <div className=\"flex items-center space-x-4 text-sm\">
              <div className={`flex items-center space-x-2 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {connectionError && (
                <span className=\"text-red-600\">{connectionError}</span>
              )}
            </div>
          </div>

          {/* Vision Models List */}
          {visionModels.length > 0 && (
            <div className=\"bg-green-50 rounded-lg p-4\">
              <h4 className=\"font-medium text-gray-900 mb-2\">
                Vision Models ({visionModels.length})
              </h4>
              <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2\">
                {visionModels.map((model) => (
                  <div key={model} className=\"text-sm bg-white px-3 py-1 rounded border\">
                    👁️ {model}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className=\"bg-red-50 rounded-lg p-4\">
              <h4 className=\"font-medium text-gray-900 mb-2\">
                Processing Errors ({errors.length})
              </h4>
              <div className=\"space-y-2\">
                {errors.map((error, index) => (
                  <div key={index} className=\"text-sm bg-white p-2 rounded border border-red-200\">
                    <span className=\"font-medium text-red-800\">{error.model}:</span>
                    <span className=\"ml-2 text-red-600\">{error.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Models */}
          {capabilities.length > 0 && (
            <div className=\"bg-gray-50 rounded-lg p-4\">
              <h4 className=\"font-medium text-gray-900 mb-2\">
                Recent Models ({capabilities.slice(-5).length} of {capabilities.length})
              </h4>
              <div className=\"space-y-2\">
                {capabilities.slice(-5).map((capability) => (
                  <div key={capability.name} className=\"text-sm bg-white p-2 rounded border flex items-center justify-between\">
                    <span className=\"font-medium\">{capability.name}</span>
                    <div className=\"flex items-center space-x-2\">
                      {capability.vision && <span className=\"text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded\">Vision</span>}
                      {capability.tools && <span className=\"text-xs bg-green-100 text-green-800 px-2 py-1 rounded\">Tools</span>}
                      {capability.reasoning && <span className=\"text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded\">Reasoning</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer Note */}
      <div className=\"text-xs text-gray-500 mt-4 p-3 bg-gray-50 rounded\">
        <strong>💡 Progressive Loading:</strong> This solves the timeout issue by loading model capabilities 
        progressively in the background. Models are released to the UI as they are processed, 
        preventing frontend timeouts while providing real-time updates.
      </div>
    </div>
  );
}

export default ProgressiveModelLoader;
