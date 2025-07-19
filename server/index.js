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

// Generate secure session token
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Middleware to authenticate requests
const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing or invalid authorization header' 
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (!authenticatedSessions.has(token)) {
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
  const configPath = '/data/config.json';
  const configContent = readFileSync(configPath, 'utf8');
  const savedConfig = JSON.parse(configContent);
  
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

// Function to extract all node identifiers (IP or URL) from the tree recursively
// Only includes nodes that have web GUIs enabled (hasWebGui !== false)
function extractAllNodeIdentifiers(nodes = appConfig.tree.nodes) {
  const identifiers = [];
  
  function traverse(nodeList) {
    for (const node of nodeList) {
      // Only monitor nodes that have web GUIs enabled (hasWebGui !== false)
      // If hasWebGui is undefined, default to true for backward compatibility
      const shouldMonitor = node.hasWebGui !== false;
      
      if (shouldMonitor) {
        // Use IP if available, otherwise use URL, otherwise skip
        const identifier = node.ip || node.url;
        if (identifier) {
          // Normalize the identifier to ensure consistent format
          const normalizedIdentifier = normalizeNodeIdentifier(identifier);
          identifiers.push(normalizedIdentifier);
        }
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
          lastChecked: new Date(),
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
        lastChecked: new Date(),
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

// Helper function to find node data by identifier (IP or URL)
function findNodeByIdentifier(targetIdentifier) {
  // Normalize the target identifier for consistent matching
  const normalizedTarget = normalizeNodeIdentifier(targetIdentifier);
  
  function searchNodes(nodes) {
    for (const node of nodes) {
      const nodeIdentifier = node.ip || node.url;
      if (nodeIdentifier) {
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
  console.log(`🔍 Checking health for: ${normalizedIdentifier}`);
  
  // Get the node data to access both IP and URL
  const nodeData = findNodeByIdentifier(normalizedIdentifier);
  
  // Determine base endpoint (without protocol if not specified)
  let baseEndpoint;
  if (nodeData) {
    if (nodeData.url) {
      baseEndpoint = nodeData.url;
    } else if (nodeData.ip) {
      baseEndpoint = nodeData.ip;
    } else {
      baseEndpoint = identifier;
    }
  } else {
    baseEndpoint = identifier;
  }
  
  // If protocol is already specified, use it directly
  if (baseEndpoint.includes('://')) {
    return await attemptHealthCheck(baseEndpoint, normalizedIdentifier, nodeData);
  }
  
  // Try HTTPS first, then HTTP as fallback
  console.log(`🌐 Testing protocols for: ${baseEndpoint}`);
  
  // Try HTTPS first
  let result = await attemptHealthCheck(`https://${baseEndpoint}`, normalizedIdentifier, nodeData);
  
  // If HTTPS failed with connection refused, try HTTP
  if (result.status === 'offline' && result.error && result.error.includes('Connection refused')) {
    console.log(`🔄 HTTPS failed, trying HTTP for: ${baseEndpoint}`);
    const httpResult = await attemptHealthCheck(`http://${baseEndpoint}`, normalizedIdentifier, nodeData);
    
    // Use HTTP result if it's successful, otherwise keep the HTTPS result
    if (httpResult.status === 'online') {
      result = httpResult;
    }
  }
  
  return result;
}

// Helper function to attempt health check for a specific endpoint
async function attemptHealthCheck(endpoint, normalizedIdentifier, nodeData) {

  
  let result;
  let timeoutId;
  const attemptStart = Date.now();
  
  try {
    console.log(`🚀 Starting fetch for ${endpoint}`);
    
    // Use a more aggressive timeout approach with explicit promise handling
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        console.log(`⏰ Timeout reached for ${endpoint}`);
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
    
    console.log(`✅ ${endpoint} responded with status ${response.status} (${responseTime}ms)`);
    
    // Consider 2xx, 3xx, and some 4xx responses as "online"
    const isOnline = response.status < 500;
    
    result = {
      status: isOnline ? 'online' : 'offline',
      lastChecked: new Date(),
      responseTime: responseTime,
      statusCode: response.status,
      endpoint: endpoint,
      error: isOnline ? undefined : `HTTP ${response.status}`
    };
    
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId);
    const responseTime = Date.now() - attemptStart;
    
    console.log(`❌ ${endpoint} failed: ${error.message} (${responseTime}ms)`);
    
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
      lastChecked: new Date(),
      responseTime: responseTime,
      endpoint: endpoint,
      error: errorMessage
    };
    
  }
  
  // Common status processing for both success and error cases
  console.log(`📊 Processing result for ${normalizedIdentifier}: ${result.status}`);
  
  // Check if the status has changed (for webhook notifications)
  const previousStatus = nodeStatuses.get(normalizedIdentifier);
  const statusChanged = !previousStatus || previousStatus.status !== result.status;
  
  // Only send notifications for transitions between 'online' and 'offline' states
  // Exclude transitions from 'checking' to prevent initial startup notifications
  const shouldNotify = statusChanged && 
                      previousStatus && 
                      previousStatus.status !== 'checking' && 
                      (result.status === 'online' || result.status === 'offline') &&
                      (previousStatus.status === 'online' || previousStatus.status === 'offline');
  
  // Store using normalized identifier for consistent lookups
  nodeStatuses.set(normalizedIdentifier, result);
  
  // Send notifications only for meaningful status transitions
  if (!initialHealthCheck && shouldNotify && appConfig.webhooks?.statusNotifications) {
    // Get the node name for a more descriptive notification
    const nodeName = nodeData?.title || normalizedIdentifier;
    if (result.status === 'online') {
      // Node came online
      await sendStatusWebhook(
        appConfig.webhooks.statusNotifications, 
        nodeName, 
        'online'
      );
    } else {
      // Node went offline
      await sendStatusWebhook(
        appConfig.webhooks.statusNotifications, 
        nodeName, 
        'offline'
      );
    }
  }
  
  // Reset the initial health check flag after the first cycle to enable notifications
  if (initialHealthCheck) {
    initialHealthCheck = false;
    console.log('🔔 Status notifications enabled for future changes');
  }
  
  return result;
}

// Function to check all nodes
async function checkAllNodes() {
  console.log(`🔍 Checking health of ${nodeIdentifiers.length} nodes...`);
  
  const promises = nodeIdentifiers.map(async (identifier) => {
    const result = await checkNodeHealth(identifier);
    const normalizedIdentifier = normalizeNodeIdentifier(identifier);
    
    // Log the result with emoji
    const emoji = result.status === 'online' ? '✅' : '❌';
    console.log(`${emoji} ${normalizedIdentifier}: ${result.status}${result.responseTime ? ` (${result.responseTime}ms)` : ''}`);
    
    return result;
  });
  
  await Promise.allSettled(promises);
  
  const statuses = Array.from(nodeStatuses.entries());
  const onlineCount = statuses.filter(([_, status]) => status.status === 'online').length;
  const offlineCount = statuses.filter(([_, status]) => status.status === 'offline').length;
  
  console.log(`✨ Health check complete: ${onlineCount}/${nodeIdentifiers.length} nodes online`);
  
  // Reset the initial health check flag after the first cycle to enable notifications
  if (initialHealthCheck) {
    initialHealthCheck = false;
    console.log('🔔 Status notifications enabled for future changes');
  }
  
  // When there are offline nodes, log them
  if (offlineCount > 0) {
    const offlineNodes = statuses
      .filter(([_, status]) => status.status === 'offline')
      .map(([id, _]) => id);
    
    console.log(`❌ ${offlineCount} offline nodes: ${offlineNodes.join(', ')}`);
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
  
  if (!username || !password) {
    return res.status(400).json({ 
      error: 'Bad Request', 
      message: 'Username and password are required' 
    });
  }
  
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    // Add a small delay to prevent brute force attacks
    setTimeout(() => {
      res.status(401).json({ 
        error: 'Unauthorized', 
        message: 'Invalid username or password' 
      });
    }, 1000);
    return;
  }
  
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

// Endpoint to update the configuration
app.post('/api/config', authenticateRequest, (req, res) => {
  const newConfig = req.body;
  
  try {
    // Deep merge new config with existing config
    appConfig = deepMerge(appConfig, newConfig);
    
    // Write the new configuration to the file
    const configPath = '/data/config.json';
    writeFileSync(configPath, JSON.stringify(appConfig, null, 2), 'utf8');
    
    // Reinitialize node monitoring with new config and update nodeIdentifiers
    nodeIdentifiers = initializeNodeStatuses(true);
    
    res.json({ 
      success: true, 
      message: 'Configuration updated successfully' 
    });
  } catch (error) {
    console.error('Error updating configuration:', error);
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
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    config: {
      server: {
        port: appConfig.server.port,
        healthCheckInterval: appConfig.server.healthCheckInterval
      },
      monitoredNodes: nodeIdentifiers.length
    }
  });
});

// Start server
// --- Network Scan API ---
const networkScanService = new NetworkScanService();

app.post('/api/network-scan/start', (req, res) => {
  try {
    const subnet = req.body && req.body.subnet ? req.body.subnet : '10.20.148.0/16';
    networkScanService.start_scan({ subnet });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/network-scan/progress', (req, res) => {
  res.json(networkScanService.get_progress());
});

app.post('/api/network-scan/cancel', (req, res) => {
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