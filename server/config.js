/**
 * OpenBare Server Configuration
 * 
 * All configuration is loaded from environment variables with sensible defaults.
 * This allows easy deployment across different environments.
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

// Generate a unique node ID if not provided
const generateNodeId = () => {
  const host = hostname().slice(0, 8);
  const random = randomUUID().slice(0, 8);
  return `${host}-${random}`;
};

/**
 * Server configuration object
 * All values can be overridden via environment variables
 */
export const config = {
  // Server settings
  port: parseInt(process.env.PORT, 10) || 8080,
  host: process.env.HOST || '0.0.0.0',
  
  // Node identification
  nodeId: process.env.NODE_ID || generateNodeId(),
  region: process.env.REGION || 'unknown',
  ownerContact: process.env.OWNER_CONTACT || '',
  nodeUrl: process.env.NODE_URL || '', // Public URL of this node
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100, // 100 requests per window
    message: {
      error: 'Too many requests',
      retryAfter: 60
    }
  },
  
  // Registry settings (optional)
  registry: {
    url: process.env.REGISTRY_URL || '', // Empty = don't register
    heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL, 10) || 30000, // 30 seconds
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.LOG_PRETTY === 'true' || process.env.NODE_ENV !== 'production'
  },
  
  // CORS settings
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD', 'PATCH'],
    allowedHeaders: ['*'],
    exposedHeaders: ['*'],
    credentials: true
  },
  
  // Bare server settings
  bare: {
    path: '/bare/',
    maintainer: {
      email: process.env.MAINTAINER_EMAIL || 'admin@openbare.dev',
      website: process.env.MAINTAINER_WEBSITE || 'https://github.com/nirholas/openbare'
    }
  },
  
  // Version info
  version: '1.0.0',
  
  // Environment
  isDev: process.env.NODE_ENV !== 'production',
  isProd: process.env.NODE_ENV === 'production'
};

/**
 * Validate configuration and warn about potential issues
 */
export function validateConfig(logger) {
  const warnings = [];
  
  if (!config.region || config.region === 'unknown') {
    warnings.push('REGION not set - node discovery may not work optimally');
  }
  
  if (!config.nodeUrl) {
    warnings.push('NODE_URL not set - cannot register with registry');
  }
  
  if (config.registry.url && !config.nodeUrl) {
    warnings.push('REGISTRY_URL set but NODE_URL missing - registration will fail');
  }
  
  if (config.rateLimit.max > 1000) {
    warnings.push('Rate limit is very high (>1000/min) - consider lowering for production');
  }
  
  warnings.forEach(w => logger.warn(w));
  
  return warnings.length === 0;
}

export default config;
