import express from 'express';
import { NetworkScanService } from './network_scan_service.js';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import crypto from 'crypto';

// Import the webhook utility
import { sendStatusWebhook } from './utils/webhooks.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(express.json());

// --- Security Configuration ---

// Admin credentials from environment or defaults (should be changed in production)
const ADMIN_USERNAME = process.env.NAUTILUS_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.NAUTILUS_ADMIN_PASSWORD || '1234';

// Session storage for authenticated sessions (in production, use Redis or database)
const authenticatedSessions = new Map();

// Rate limiting for authentication attempts
const authAttempts = new Map();
const MAX_AUTH_ATTEMPTS = 5;
const AUTH_LOCKOUT_TIME = 15 * 60 * 1000; // 15 minutes

// Generate secure session token
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Check if IP is rate limited
const isRateLimited = (ip) => {
  const attempts = authAttempts.get(ip);
  if (!attempts) return false;
  
  if (attempts.count >= MAX_AUTH_ATTEMPTS) {
    const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
    if (timeSinceLastAttempt < AUTH_LOCKOUT_TIME) {
      return true;
    } else {
      // Reset attempts after lockout period
      authAttempts.delete(ip);
      return false;
    }
  }
  
  return false;
};

// Record failed authentication attempt
const recordFailedAuth = (ip) => {
  const attempts = authAttempts.get(ip) || { count: 0, lastAttempt: 0 };
  attempts.count++;
  attempts.lastAttempt = Date.now();
  authAttempts.set(ip, attempts);
};

// Clear successful authentication attempts
const clearAuthAttempts = (ip) => {
  authAttempts.delete(ip);
};

// Middleware to authenticate requests
const authenticateRequest = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`❌ [AUTH] Unauthenticated request from ${clientIp} to ${req.method} ${req.path} (missing/invalid auth header)`);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing or invalid authorization header' 
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!authenticatedSessions.has(token)) {
    console.log(`❌ [AUTH] Invalid session token from ${clientIp} to ${req.method} ${req.path} (token: ${token.substring(0, 8)}...)`);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or expired session token' 
    });
  }
  
  // Update session timestamp
  authenticatedSessions.set(token, Date.now());
  next();
};

// Clean up expired sessions (older than 24 hours)
const cleanupExpiredSessions = () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [token, timestamp] of authenticatedSessions.entries()) {
    if (now - timestamp > maxAge) {
      authenticatedSessions.delete(token);
    }
  }
};

// Clean up expired sessions every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from the React build output
app.use(express.static(join(__dirname, 'public')));

// --- Configuration Loading --- 

// 1. Default configuration from environment variables
const defaultConfig = {
  server: {
    port: parseInt(process.env.NAUTILUS_SERVER_PORT, 10) || 3069,
    healthCheckInterval: parseInt(process.env.NAUTILUS_HEALTH_CHECK_INTERVAL, 10) || 20000,
    corsOrigins: [`http://${process.env.NAUTILUS_HOST || 'localhost'}:${parseInt(process.env.NAUTILUS_CLIENT_PORT, 10) || 3070}`]
  },
  client: {
    port: parseInt(process.env.NAUTILUS_CLIENT_PORT, 10) || 3070,
    host: process.env.NAUTILUS_HOST || 'localhost',
    apiPollingInterval: parseInt(process.env.NAUTILUS_API_POLLING_INTERVAL, 10) || 5000,
  },
  appearance: {
    title: process.env.NAUTILUS_PAGE_TITLE || 'Nautilus',
    accentColor: '#3b82f6',
    favicon: '/nautilusIcon.png',
    backgroundImage: '/background.png'
  },
  tree: {
    nodes: [] // Default to no nodes
  }
};

// 2. Load configuration from config.json, if it exists
let appConfig;
try {
  // Use different config paths for Docker vs local development
  const configPath = process.env.NODE_ENV === 'production' ? '/data/config.json' : './config.json';
  console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  console.log(`🔧 Config path: ${configPath}`);
  console.log(`🔧 Working directory: ${process.cwd()}`);
  
  const configContent = readFileSync(configPath, 'utf8');
  const savedConfig = JSON.parse(configContent);
  
  console.log(`🔧 Loaded config with ${savedConfig.tree?.nodes?.length || 0} nodes`);
  
  // Deep merge saved config over default config
  appConfig = {
    ...defaultConfig,
    ...savedConfig,
    server: { ...defaultConfig.server, ...savedConfig.server },
    client: { ...defaultConfig.client, ...savedConfig.client },
    appearance: { ...defaultConfig.appearance, ...savedConfig.appearance },
    tree: savedConfig.tree || defaultConfig.tree
  };

  console.log('✅ Loaded and merged config from config.json and environment variables.');
} catch (error) {
  console.log('No config.json found or error reading it. Using environment variables or defaults.');
  appConfig = defaultConfig;
}

// Configure CORS with centralized origins
app.use(cors({
  origin: appConfig.server.corsOrigins,
  credentials: true
}));

// Log client connections (non-static requests only)
app.use((req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'] || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  // Only log API requests, not static file requests
  if (req.path.startsWith('/api/')) {
    console.log(`🌐 [CLIENT] ${clientIp} → ${req.method} ${req.path} (${userAgent.substring(0, 50)}...)`);
  }
  
  next();
});

// Security headers
app.use((req, res, next) => {
  // Prevent XSS attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self'; " +
    "font-src 'self'; " +
    "object-src 'none'; " +
    "media-src 'self'; " +
    "frame-src 'none';"
  );
  
  // Remove server info
  res.removeHeader('X-Powered-By');
  
  next();
});

// Increase JSON payload limit for image uploads (base64 encoded images can be large)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Store for node statuses
const nodeStatuses = new Map();

// Function to normalize a node identifier (IP or URL)
function normalizeNodeIdentifier(identifier) {
  if (!identifier) return '';
  
  // Remove protocols (http://, https://)
  let normalized = identifier.replace(/^https?:\/\//, '');
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  return normalized;
}

// Function to extract all node identifiers for health check monitoring
// NEW ARCHITECTURE: Only includes nodes with healthCheckPort specified
function extractAllNodeIdentifiers(nodes = appConfig.tree.nodes) {
  const identifiers = [];
  
  function traverse(nodeList) {
    for (const node of nodeList) {
      // Only monitor nodes with healthCheckPort and ip specified
      if (node.healthCheckPort && node.ip) {
        const identifier = `${node.ip}:${node.healthCheckPort}`;
        console.log(`📍 [MONITOR] Node "${node.title || node.id}": ip="${node.ip}", healthCheckPort="${node.healthCheckPort}" → monitoring "${identifier}"`);
        
        // Normalize the identifier to ensure consistent format
        const normalizedIdentifier = normalizeNodeIdentifier(identifier);
        identifiers.push(normalizedIdentifier);
      } else {
        console.log(`⏭️  [SKIP] Node "${node.title || node.id}": missing healthCheckPort or ip, excluded from monitoring`);
      }
      
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(nodes);
  return identifiers;
}

// Initialize statuses code (moved before health check)
function initializeNodeStatuses(preserveExisting = false) {
  // Get fresh list of node identifiers
  const nodeIdentifiers = extractAllNodeIdentifiers();
  
  if (preserveExisting) {
    // Preserve existing statuses and only add new nodes or remove deleted ones
    const existingStatuses = new Map(nodeStatuses);
    nodeStatuses.clear();
    
    // Add back statuses for nodes that still exist, or initialize new ones
    nodeIdentifiers.forEach(identifier => {
      if (existingStatuses.has(identifier)) {
        // Preserve existing status
        nodeStatuses.set(identifier, existingStatuses.get(identifier));
      } else {
        // Initialize new node as checking (loading state)
        nodeStatuses.set(identifier, { 
          status: 'checking', 
          lastChecked: new Date().toISOString(),
          statusChangedAt: new Date().toISOString(),
          error: 'Initial check pending'
        });
      }
    });
  } else {
    // Clear existing statuses (initial startup behavior)
    nodeStatuses.clear();
    
    // Initialize all nodes as checking with normalized keys
    nodeIdentifiers.forEach(identifier => {
      // The identifier is already normalized by extractAllNodeIdentifiers
      nodeStatuses.set(identifier, { 
        status: 'checking', 
        lastChecked: new Date().toISOString(),
        statusChangedAt: new Date().toISOString(),
        error: 'Initial check pending'
      });
    });
  }
  
  return nodeIdentifiers;
}

// Load node identifiers from centralized config and initialize statuses
let nodeIdentifiers = initializeNodeStatuses();
let initialHealthCheck = true;

// Create HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Accept self-signed certificates
});

// Helper function to find node data by identifier (IP:port format)
function findNodeByIdentifier(targetIdentifier) {
  // Normalize the target identifier for consistent matching
  const normalizedTarget = normalizeNodeIdentifier(targetIdentifier);
  
  function searchNodes(nodes) {
    for (const node of nodes) {
      // NEW ARCHITECTURE: Generate identifier from ip:healthCheckPort
      if (node.healthCheckPort && node.ip) {
        const nodeIdentifier = `${node.ip}:${node.healthCheckPort}`;
        const normalizedNodeId = normalizeNodeIdentifier(nodeIdentifier);
        if (normalizedNodeId === normalizedTarget) {
          return node;
        }
      }
      if (node.children) {
        const found = searchNodes(node.children);
        if (found) return found;
      }
    }
    return null;
  }
  
  return searchNodes(appConfig.tree.nodes);
}

// Function to check a single node's health with automatic HTTP/HTTPS fallback
async function checkNodeHealth(identifier) {
  const normalizedIdentifier = normalizeNodeIdentifier(identifier);
  
  console.log(`🔍 [HEALTH_CHECK] Checking "${identifier}" → normalized: "${normalizedIdentifier}"`);
  
  // Get the node data to access IP, URL, and healthCheckPort
  const nodeData = findNodeByIdentifier(normalizedIdentifier);
  
  // Only nodes with healthCheckPort should reach this function
  let baseEndpoint;
  
  if (nodeData && nodeData.healthCheckPort && nodeData.ip) {
    baseEndpoint = `${nodeData.ip}:${nodeData.healthCheckPort}`;
    console.log(`🎯 [ENDPOINT] Node "${nodeData.title || nodeData.id}": healthCheck="${baseEndpoint}"`);
  } else {
    console.log(`⚠️  [ENDPOINT] Invalid node data for "${normalizedIdentifier}" - missing healthCheckPort or ip`);
    // Return offline for invalid nodes
    return {
      status: 'offline',
      lastChecked: new Date().toISOString(),
      responseTime: 0,
      error: 'Invalid node configuration - missing healthCheckPort or ip'
    };
  }
  
  let finalResult;
  
  // If protocol is already specified, use it directly
  if (baseEndpoint.includes('://')) {
    finalResult = await attemptHealthCheck(baseEndpoint, normalizedIdentifier, nodeData);
  } else {
    // Always try HTTPS first, then HTTP fallback
    
    // Try HTTPS first
    let result = await attemptHealthCheck(`https://${baseEndpoint}`, normalizedIdentifier, nodeData);
    
    // If HTTPS failed with connection errors, try HTTP
    if (result.status === 'offline' && result.error && 
        (result.error.includes('Connection refused') || 
         result.error.includes('Connection timeout') ||
         result.error.includes('ECONNREFUSED') ||
         result.error.includes('ETIMEDOUT') ||
         result.error.includes('EPROTO') ||
         result.error.includes('SSL routines') ||
         result.error.includes('wrong version number') ||
         result.error.includes('certificate'))) {
      const httpResult = await attemptHealthCheck(`http://${baseEndpoint}`, normalizedIdentifier, nodeData);
      
      // Use HTTP result if it's successful
      if (httpResult.status === 'online') {
        finalResult = httpResult;
      } else {
        finalResult = result; // Keep original HTTPS error if HTTP also failed
      }
    } else {
      finalResult = result;
    }
  }
  
  // NOW handle status change notifications AFTER all attempts are complete
  const previousStatus = nodeStatuses.get(normalizedIdentifier);
  const statusChanged = !previousStatus || previousStatus.status !== finalResult.status;
  
  // Preserve statusChangedAt timestamp if status hasn't changed, otherwise set to now
  if (previousStatus && !statusChanged) {
    // Status hasn't changed, preserve the original statusChangedAt timestamp
    finalResult.statusChangedAt = previousStatus.statusChangedAt;
  } else {
    // Status has changed (or this is first check), set statusChangedAt to now
    finalResult.statusChangedAt = new Date().toISOString();
  }
  
  // Only send notifications for transitions between 'online' and 'offline' states
  // Exclude transitions from 'checking' to prevent initial startup notifications
  const shouldNotify = statusChanged && 
                      previousStatus && 
                      previousStatus.status !== 'checking' && 
                      (finalResult.status === 'online' || finalResult.status === 'offline') &&
                      (previousStatus.status === 'online' || previousStatus.status === 'offline');
  
  // Store using normalized identifier for consistent lookups
  nodeStatuses.set(normalizedIdentifier, finalResult);
  
  if (shouldNotify) {
    const nodeName = nodeData?.title || nodeData?.id || normalizedIdentifier;
    console.log(`📢 [NOTIFICATION] Status change detected for "${nodeName}": ${previousStatus.status} → ${finalResult.status}`);
    
    // Send webhook notification if configured
    if (appConfig.webhooks?.statusNotifications) {
      const event = finalResult.status === 'online' ? 'online' : 'offline';
      
      try {
        await sendStatusWebhook(
          appConfig.webhooks.statusNotifications,
          nodeName,
          event
        );
      } catch (error) {
        console.error(`❌ [WEBHOOK] Failed to send notification for ${nodeName}:`, error.message);
      }
    }
  }
  
  return finalResult;
}

// Helper function to attempt health check for a specific endpoint
async function attemptHealthCheck(endpoint, normalizedIdentifier, nodeData) {
  const nodeName = nodeData?.title || nodeData?.id || normalizedIdentifier;
  console.log(`🚀 [ATTEMPT] Trying ${endpoint} for node "${nodeName}"`);
  
  let result;
  let timeoutId;
  const attemptStart = Date.now();
  
  try {
    // Use a more aggressive timeout approach with explicit promise handling
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Request timeout (5s)'));
      }, 5000);
    });
    
    const fetchPromise = fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'Nautilus-Monitor/1.0'
      },
      agent: endpoint.startsWith('https://') ? httpsAgent : undefined
    });
    
    const response = await Promise.race([fetchPromise, timeoutPromise]);
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - attemptStart;
    
    // Consider 2xx, 3xx, and some 4xx responses as "online"
    const isOnline = response.status < 500;
    
    result = {
      status: isOnline ? 'online' : 'offline',
      lastChecked: new Date().toISOString(),
      responseTime: responseTime,
      statusCode: response.status,
      endpoint: endpoint,
      error: isOnline ? undefined : `HTTP ${response.status}`
    };
    
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const responseTime = Date.now() - attemptStart;
    
    let errorMessage = 'Unknown error';
    if (error.message === 'Request timeout (5s)') {
      errorMessage = 'Request timeout (5s)';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Host not found (DNS failed)';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused (service down)';
    } else if (error.code === 'ECONNRESET') {
      errorMessage = 'Connection reset (network issue)';
    } else if (error.code === 'ETIMEDOUT') {
      errorMessage = 'Connection timeout';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    result = {
      status: 'offline',
      lastChecked: new Date().toISOString(),
      responseTime: responseTime,
      endpoint: endpoint,
      error: errorMessage
    };
  }
  
  // Just return the result without updating status or sending notifications
  return result;
}

// Function to check all nodes
async function checkAllNodes() {
  const promises = nodeIdentifiers.map(async (identifier) => {
    const result = await checkNodeHealth(identifier);
    const normalizedIdentifier = normalizeNodeIdentifier(identifier);
    
    // Only log offline nodes with details
    if (result.status === 'offline') {
      const nodeData = findNodeByIdentifier(normalizedIdentifier);
      const displayName = nodeData?.title || normalizedIdentifier;
      const errorDetail = result.error ? ` (${result.error})` : '';
      console.log(`❌ ${displayName} (${normalizedIdentifier}): offline${errorDetail}`);
    }
    
    return result;
  });
  
  await Promise.allSettled(promises);
  
  const statuses = Array.from(nodeStatuses.entries());
  const onlineCount = statuses.filter(([_, status]) => status.status === 'online').length;
  const offlineCount = statuses.filter(([_, status]) => status.status === 'offline').length;
  
  console.log(`✨ Health check complete: ${onlineCount}/${nodeIdentifiers.length} nodes online`);
  
  // Reset the initial health check flag after the first complete cycle to enable notifications
  if (initialHealthCheck) {
    initialHealthCheck = false;
    console.log('🔔 Initial health check complete - status notifications enabled for future changes');
  }
}

// Start the health checking interval (from centralized config)
setInterval(checkAllNodes, appConfig.server.healthCheckInterval);

// Initial health check
checkAllNodes();

// API endpoint to get all node statuses
app.get('/api/status', (req, res) => {
  const statusObject = {};
  
  // The server stores statuses with normalized keys, but the client may expect 
  // the original format from the config. To ensure consistency, we'll convert 
  // back to the original format if needed
  
  nodeStatuses.forEach((status, identifier) => {
    // Just use the normalized identifier as stored in the map
    statusObject[identifier] = status;
  });
  
  res.json({
    timestamp: new Date().toISOString(),
    statuses: statusObject
  });
});

// --- Authentication API ---

// API endpoint for authentication
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  // Check rate limiting
  if (isRateLimited(clientIP)) {
    return res.status(429).json({
      error: 'Too Many Requests',
      message: 'Too many failed authentication attempts. Please try again later.'
    });
  }
  
  if (!username || !password) {
    recordFailedAuth(clientIP);
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Username and password are required' 
    });
  }
  
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    recordFailedAuth(clientIP);
    // Add a small delay to prevent brute force attacks
    setTimeout(() => {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid username or password' 
      });
    }, 1000);
    return;
  }
  
  // Successful authentication
  clearAuthAttempts(clientIP);
  
  // Generate session token
  const token = generateSessionToken();
  authenticatedSessions.set(token, Date.now());
  
  res.json({ 
    success: true, 
    token,
    message: 'Authentication successful' 
  });
});

// API endpoint to validate current session
app.get('/api/auth/validate', authenticateRequest, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Session is valid' 
  });
});

// API endpoint to logout (invalidate session)
app.post('/api/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    authenticatedSessions.delete(token);
  }
  
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

// --- Configuration API (Protected) ---

// API endpoint to get centralized config (public - read-only)
app.get('/api/config', (req, res) => {
  res.json(appConfig);
});

// Helper function to deep merge objects
function deepMerge(target, source) {
  const result = { ...target };
  
  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        // If both target and source have this key as objects, merge them recursively
        result[key] = result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])
          ? deepMerge(result[key], source[key])
          : source[key];
      } else {
        // For arrays and primitive values, replace completely
        result[key] = source[key];
      }
    }
  }
  
  return result;
}

// Helper function to validate configuration structure
function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Configuration must be an object' };
  }
  
  // Check for required top-level properties
  const requiredFields = ['appearance', 'tree'];
  for (const field of requiredFields) {
    if (!config[field] || typeof config[field] !== 'object') {
      return { valid: false, error: `Missing or invalid ${field} configuration` };
    }
  }
  
  // Validate tree structure
  if (!Array.isArray(config.tree.nodes)) {
    return { valid: false, error: 'tree.nodes must be an array' };
  }
  
  // Recursive function to validate nodes and their children
  function validateNode(node, path = '') {
    if (!node.id || typeof node.id !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} missing valid id` };
    }
    if (!node.title || typeof node.title !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} missing valid title` };
    }
    if (node.ip && typeof node.ip !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} ip must be a string` };
    }
    if (node.url && typeof node.url !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} url must be a string` };
    }
    if (node.subtitle && typeof node.subtitle !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} subtitle must be a string` };
    }
    if (node.icon && typeof node.icon !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} icon must be a string` };
    }
    if (node.type && typeof node.type !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} type must be a string` };
    }
    
    // Validate children if they exist
    if (node.children) {
      if (!Array.isArray(node.children)) {
        return { valid: false, error: `Node at ${path || 'root'} children must be an array` };
      }
      
      for (let i = 0; i < node.children.length; i++) {
        const childPath = path ? `${path}.children[${i}]` : `children[${i}]`;
        const childValidation = validateNode(node.children[i], childPath);
        if (!childValidation.valid) {
          return childValidation;
        }
      }
    }
    
    return { valid: true };
  }
  
  // Validate each top-level node
  for (let i = 0; i < config.tree.nodes.length; i++) {
    const validation = validateNode(config.tree.nodes[i], `nodes[${i}]`);
    if (!validation.valid) {
      return validation;
    }
  }
  
  return { valid: true };
}

// Endpoint to update the configuration
app.post('/api/config', authenticateRequest, (req, res) => {
  const newConfig = req.body;
  const replaceMode = req.query.replace === 'true'; // Check for replace query parameter
  
  // Validate configuration structure
  const validation = validateConfig(newConfig);
  if (!validation.valid) {
    console.error('Configuration validation failed:', validation.error);
    return res.status(400).json({
      success: false,
      message: `Invalid configuration: ${validation.error}`
    });
  }
  
  try {
    if (replaceMode) {
      // Complete replacement mode (for backup restoration)
      console.log('🔄 Performing complete configuration replacement');
      appConfig = newConfig;
    } else {
      // Deep merge new config with existing config (for partial updates)
      console.log('🔄 Performing configuration merge');
      appConfig = deepMerge(appConfig, newConfig);
    }
    
    // Write the new configuration to the file
    const configPath = process.env.NODE_ENV === 'production' ? '/data/config.json' : './config.json';
    writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
    
    // Reinitialize node monitoring with new config and update nodeIdentifiers
    nodeIdentifiers = initializeNodeStatuses(true);
    
    console.log('✅ Configuration updated successfully');
    res.json({ 
      success: true, 
      message: 'Configuration updated successfully' 
    });
  } catch (error) {
    console.error('❌ Error updating configuration:', error);
    console.error('Error stack:', error.stack);
    console.error('Config data preview:', JSON.stringify(newConfig, null, 2).substring(0, 500) + '...');
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update configuration' 
    });
  }
});

// API endpoint to get status for a specific node
app.get('/api/status/:ip', (req, res) => {
  const ip = req.params.ip;
  const status = nodeStatuses.get(ip);
  
  if (!status) {
    return res.status(404).json({ error: 'Node not found' });
  }
  
  res.json({
    ip,
    ...status
  });
});

// Health check endpoint for the monitoring server itself
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString()
    // Removed sensitive configuration details for security
  });
});

// Start server
// --- Network Scan API (Protected) ---
const networkScanService = new NetworkScanService();

app.post('/api/network-scan/start', authenticateRequest, (req, res) => {
  try {
    const subnet = req.body && req.body.subnet ? req.body.subnet : '10.20.148.0/16';
    console.log(`🔍 [NETWORK-SCAN] Starting scan for subnet: ${subnet}`);
    
    networkScanService.start_scan({ subnet });
    
    console.log(`✅ [NETWORK-SCAN] Scan started successfully for subnet: ${subnet}`);
    res.json({ success: true });
  } catch (err) {
    console.error(`❌ [NETWORK-SCAN] Failed to start scan:`, err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/network-scan/progress', authenticateRequest, (req, res) => {
  res.json(networkScanService.get_progress());
});

// Public endpoint to check if scan is active (no auth required)
app.get('/api/network-scan/status', (req, res) => {
  const progress = networkScanService.get_progress();
  const isActive = progress.status === 'starting' || progress.status === 'scanning';
  const hasRecentResults = networkScanService.has_recent_results();
  res.json({ 
    active: isActive,
    status: progress.status,
    hasRecentResults: hasRecentResults,
    timestamp: progress.timestamp 
  });
});

app.post('/api/network-scan/cancel', authenticateRequest, (req, res) => {
  networkScanService.cancel_scan();
  res.json({ success: true });
});
app.listen(appConfig.server.port, () => {
  console.log(` Monitoring ${nodeIdentifiers.length} nodes every ${appConfig.server.healthCheckInterval / 1000}s`);
  console.log(`🔍 Using HTTP GET requests with 5s timeout (URL preferred over IP)`);
  console.log('');
  console.log(`🚀 Server ready at: http://localhost:${appConfig.server.port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${appConfig.server.port} is already in use. Please close other applications using this port.`);
  } else {
    console.error('❌ Server failed to start:', err);
  }
  process.exit(1);
});