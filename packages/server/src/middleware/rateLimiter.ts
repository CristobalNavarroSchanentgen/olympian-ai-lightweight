import rateLimit from 'express-rate-limit';

// Standard rate limiter for general API endpoints
export const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests in rate limiting calculation
  skipSuccessfulRequests: false,
  // Skip failed requests in rate limiting calculation  
  skipFailedRequests: false,
  // Custom key generator that handles both direct and proxied requests
  keyGenerator: (req) => {
    // When trust proxy is enabled, express-rate-limit will automatically
    // use the correct client IP from X-Forwarded-For headers
    return req.ip;
  },
});

// Stricter rate limiter for chat endpoints
export const chatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Limit each IP to 20 chat requests per minute
  message: 'Too many chat requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  keyGenerator: (req) => {
    return req.ip;
  },
});

// Very strict rate limiter for authentication endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful auth attempts
  skipFailedRequests: false,
  keyGenerator: (req) => {
    return req.ip;
  },
});
