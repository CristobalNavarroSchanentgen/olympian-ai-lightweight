import { Request, Response, NextFunction } from 'express';

// Enhanced request logger with multi-host support for Subproject 3
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const instanceId = process.env.INSTANCE_ID || 'unknown';
  const hostname = process.env.HOSTNAME || 'localhost';
  
  // Log request start
  console.log(`[${new Date().toISOString()}] [${instanceId}@${hostname}] ${req.method} ${req.path} - Started`);
  
  // Capture response data
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    const statusEmoji = statusCode >= 400 ? '❌' : statusCode >= 300 ? '⚠️' : '✅';
    
    console.log(`[${new Date().toISOString()}] [${instanceId}@${hostname}] ${req.method} ${req.path} - ${statusEmoji} ${statusCode} (${duration}ms)`);
    
    // Enhanced logging for multi-host debugging
    if (statusCode >= 400) {
      console.error(`[${instanceId}@${hostname}] Error details:`, {
        method: req.method,
        path: req.path,
        statusCode,
        duration,
        userAgent: req.get('User-Agent'),
        ip: req.ip || req.connection.remoteAddress,
        headers: {
          'content-type': req.get('Content-Type'),
          'authorization': req.get('Authorization') ? '[REDACTED]' : undefined
        }
      });
    }
    
    return originalSend.call(this, data);
  };
  
  next();
};

// Export additional logging utilities for multi-host deployment
export const logMultiHostEvent = (event: string, data: any = {}) => {
  const instanceId = process.env.INSTANCE_ID || 'unknown';
  const hostname = process.env.HOSTNAME || 'localhost';
  
  console.log(`[${new Date().toISOString()}] [MULTI-HOST] [${instanceId}@${hostname}] ${event}`, data);
};

export const logPerformanceMetric = (metric: string, value: number, unit: string = 'ms') => {
  const instanceId = process.env.INSTANCE_ID || 'unknown';
  
  console.log(`[${new Date().toISOString()}] [PERF] [${instanceId}] ${metric}: ${value}${unit}`);
};
