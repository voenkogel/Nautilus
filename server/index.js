import express from 'express';
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
  const configPath = join(__dirname, '../config.json');
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
function extractAllNodeIdentifiers(nodes = appConfig.tree.nodes) {
  const identifiers = [];
  
  function traverse(nodeList) {
    for (const node of nodeList) {
      // Use IP if available, otherwise use URL, otherwise skip
      const identifier = node.ip || node.url;
      if (identifier) {
        // Normalize the identifier to ensure consistent format
        const normalizedIdentifier = normalizeNodeIdentifier(identifier);
        identifiers.push(normalizedIdentifier);
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
        // Initialize new node as offline
        nodeStatuses.set(identifier, { 
          status: 'offline', 
          lastChecked: new Date(),
          error: 'Not yet checked'
        });
      }
    });
  } else {
    // Clear existing statuses (initial startup behavior)
    nodeStatuses.clear();
    
    // Initialize all nodes as offline with normalized keys
    nodeIdentifiers.forEach(identifier => {
      // The identifier is already normalized by extractAllNodeIdentifiers
      nodeStatuses.set(identifier, { 
        status: 'offline', 
        lastChecked: new Date(),
        error: 'Not yet checked'
      });
    });
  }
  
  return nodeIdentifiers;
}

// Load node identifiers from centralized config and initialize statuses
const nodeIdentifiers = initializeNodeStatuses();

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

// Function to check a single node's health with simple single endpoint approach
async function checkNodeHealth(identifier) {
  const startTime = Date.now();
  
  // Normalize the identifier for consistent lookup
  const normalizedIdentifier = normalizeNodeIdentifier(identifier);
  
  // Get the node data to access both IP and URL
  const nodeData = findNodeByIdentifier(normalizedIdentifier);
  
  // Determine endpoint: if identifier is IP, use URL if available for prettier URLs, otherwise use IP
  let endpoint;
  if (nodeData) {
    if (nodeData.url) {
      endpoint = nodeData.url.includes('://') ? nodeData.url : `https://${nodeData.url}`;
    } else if (nodeData.ip) {
      endpoint = nodeData.ip.includes('://') ? nodeData.ip : `https://${nodeData.ip}`;
    } else {
      endpoint = identifier.includes('://') ? identifier : `https://${identifier}`;
    }
  } else {
    endpoint = identifier.includes('://') ? identifier : `https://${identifier}`;
  }
  

  
  try {
    const attemptStart = Date.now();
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'Nautilus-Monitor/1.0'
      },
      agent: endpoint.startsWith('https://') ? httpsAgent : undefined,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const responseTime = Date.now() - attemptStart;
    
    // Consider 2xx, 3xx, and some 4xx responses as "online"
    const isOnline = response.status < 500;
    
    const result = {
      status: isOnline ? 'online' : 'offline',
      lastChecked: new Date(),
      responseTime: responseTime,
      statusCode: response.status,
      endpoint: endpoint,
      error: isOnline ? undefined : `HTTP ${response.status}`
    };
    
    // Check if the status has changed (for webhook notifications)
    const previousStatus = nodeStatuses.get(normalizedIdentifier);
    const statusChanged = !previousStatus || previousStatus.status !== result.status;
    
    // Store using normalized identifier for consistent lookups
    nodeStatuses.set(normalizedIdentifier, result);
    
    // Send webhook notification if status changed and webhooks are configured
    if (statusChanged && appConfig.webhooks?.statusNotifications) {
      // Get the node name for a more descriptive notification
      const nodeName = nodeData?.title || normalizedIdentifier;
      
      if (isOnline) {
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
    
  } catch (error) {
    const responseTime = Date.now() - attemptStart;
    
    let errorMessage = 'Unknown error';
    if (error.name === 'AbortError') {
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
    
    const result = {
      status: 'offline',
      lastChecked: new Date(),
      responseTime: responseTime,
      endpoint: endpoint,
      error: errorMessage
    };
    
    // Check if the status has changed (for webhook notifications)
    const previousStatus = nodeStatuses.get(normalizedIdentifier);
    const statusChanged = !previousStatus || previousStatus.status !== result.status;
    
    // Store using normalized identifier for consistent lookups
    nodeStatuses.set(normalizedIdentifier, result);
    
    // Send webhook notification if status changed from online to offline and webhooks are configured
    if (statusChanged && previousStatus?.status === 'online' && appConfig.webhooks?.statusNotifications) {
      // Get the node name for a more descriptive notification
      const nodeName = nodeData?.title || normalizedIdentifier;
      
      // Node went offline
      await sendStatusWebhook(
        appConfig.webhooks.statusNotifications, 
        nodeName, 
        'offline'
      );
    }

  }
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
  // Return the FULL merged config, not just partial fields
  res.json(appConfig);
});

// API endpoint to update the configuration (protected)
app.put('/api/config', authenticateRequest, (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate the configuration structure
    if (!newConfig || typeof newConfig !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid configuration', 
        message: 'Configuration must be a valid object' 
      });
    }
    
    // Validate required sections
    if (!newConfig.server || !newConfig.client || !newConfig.tree) {
      return res.status(400).json({ 
        error: 'Invalid configuration structure',
        message: 'Configuration must include server, client, and tree sections'
      });
    }
    
    // Validate tree structure
    if (!Array.isArray(newConfig.tree.nodes)) {
      return res.status(400).json({ 
        error: 'Invalid tree structure',
        message: 'tree.nodes must be an array'
      });
    }
    
    // Write the new configuration to the file
    const configPath = join(__dirname, '../config.json');
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    
    // Update the in-memory config immediately (no restart needed)
    appConfig = {
      ...appConfig,
      ...newConfig,
      // Ensure webhook settings are included
      webhooks: newConfig.webhooks
    };
    
    // Reinitialize node monitoring with new config, preserving existing statuses
    const nodeIdentifiers = initializeNodeStatuses(true);
    console.log(`🔄 Config updated - now monitoring ${nodeIdentifiers.length} nodes (preserving existing statuses)`);
    
    // Log webhook configuration status
    if (appConfig.webhooks?.statusNotifications?.endpoint) {
      console.log(`✅ Webhook notifications configured for ${appConfig.webhooks.statusNotifications.endpoint}`);
      
      const events = [];
      if (appConfig.webhooks.statusNotifications.notifyOnline) events.push('online');
      if (appConfig.webhooks.statusNotifications.notifyOffline) events.push('offline');
      
      console.log(`✅ Webhook events enabled: ${events.length ? events.join(', ') : 'none'}`);
    } else {
      console.log('ℹ️ No webhook notifications configured');
    }
    
    console.log('✅ Configuration updated and applied immediately');
    
    res.json({ 
      success: true, 
      message: 'Configuration updated and applied successfully!' 
    });
  } catch (error) {
    console.error('❌ Failed to update configuration:', error);
    res.status(500).json({ error: 'Failed to update configuration: ' + error.message });
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