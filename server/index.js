import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware to log all incoming requests for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] Received ${req.method} request for ${req.url} from ${req.ip}`);
  next();
});

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
    favicon: '',
    backgroundImage: ''
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

app.use(express.json());

// Store for node statuses
const nodeStatuses = new Map();

// Function to extract all node identifiers (IP or URL) from the tree recursively
function extractAllNodeIdentifiers(nodes = appConfig.tree.nodes) {
  const identifiers = [];
  
  function traverse(nodeList) {
    for (const node of nodeList) {
      // Use IP if available, otherwise use URL, otherwise skip
      const identifier = node.ip || node.url;
      if (identifier) {
        identifiers.push(identifier);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(nodes);
  return identifiers;
}

// Load node identifiers from centralized config
const nodeIdentifiers = extractAllNodeIdentifiers();
console.log(`Loaded ${nodeIdentifiers.length} IPs from centralized config:`, nodeIdentifiers);

// Initialize all nodes as offline
nodeIdentifiers.forEach(identifier => {
  nodeStatuses.set(identifier, { status: 'offline', lastChecked: new Date() });
});

// Create HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Accept self-signed certificates
});

// Helper function to find node data by identifier (IP or URL)
function findNodeByIdentifier(targetIdentifier) {
  function searchNodes(nodes) {
    for (const node of nodes) {
      const nodeIdentifier = node.ip || node.url;
      if (nodeIdentifier === targetIdentifier) {
        return node;
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
  
  // Get the node data to access both IP and URL
  const nodeData = findNodeByIdentifier(identifier);
  
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
  
  console.log(`Checking health of ${identifier} via ${endpoint}`);
  
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
    
    nodeStatuses.set(identifier, result);
    
    if (isOnline) {
      console.log(`✅ ${identifier}: ${response.status} via ${endpoint} (${responseTime}ms)`);
    } else {
      console.log(`❌ ${identifier}: HTTP ${response.status} via ${endpoint} (${responseTime}ms)`);
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
    
    nodeStatuses.set(identifier, result);
    console.log(`❌ ${identifier}: ${errorMessage} via ${endpoint} (${responseTime}ms)`);
  }
}

// Function to check all nodes
async function checkAllNodes() {
  console.log(`[${new Date().toISOString()}] Checking health of ${nodeIdentifiers.length} nodes...`);
  
  const promises = nodeIdentifiers.map(identifier => checkNodeHealth(identifier));
  await Promise.allSettled(promises);
  
  const onlineCount = Array.from(nodeStatuses.values()).filter(status => status.status === 'online').length;
  console.log(`Health check complete: ${onlineCount}/${nodeIdentifiers.length} nodes online`);
}

// Start the health checking interval (from centralized config)
setInterval(checkAllNodes, appConfig.server.healthCheckInterval);

// Initial health check
checkAllNodes();

// API endpoint to get all node statuses
app.get('/api/status', (req, res) => {
  const statusObject = {};
  nodeStatuses.forEach((status, identifier) => {
    statusObject[identifier] = status;
  });
  
  res.json({
    timestamp: new Date().toISOString(),
    statuses: statusObject
  });
});

// API endpoint to get centralized config
app.get('/api/config', (req, res) => {
  res.json({
    tree: appConfig.tree,
    server: {
      healthCheckInterval: appConfig.server.healthCheckInterval
    },
    client: {
      apiPollingInterval: appConfig.client?.apiPollingInterval || 5000
    }
  });
});

// API endpoint to update the configuration
app.put('/api/config', (req, res) => {
  try {
    const newConfig = req.body;
    
    // Validate the configuration structure
    if (!newConfig.server || !newConfig.client || !newConfig.tree) {
      return res.status(400).json({ error: 'Invalid configuration structure' });
    }
    
    // Write the new configuration to the file
    const configPath = join(__dirname, '../config.json');
    writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    
    console.log('✅ Configuration updated successfully');
    
    res.json({ 
      success: true, 
      message: 'Configuration updated successfully. Please restart the server to apply changes.' 
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
  console.log(`🚀 Nautilus server running on http://localhost:${appConfig.server.port}`);
  console.log(`📊 Monitoring ${nodeIdentifiers.length} nodes with REAL HTTP health checks`);
  console.log(`⏰ Health checks every ${appConfig.server.healthCheckInterval / 1000} seconds`);
  console.log(`🔍 Health check method: HTTP GET requests with 5s timeout`);
  console.log(`🎯 Using single endpoint per node (URL preferred over IP)`);
  console.log('API endpoints:');
  console.log(`  GET /api/status - Get all node statuses`);
  console.log(`  GET /api/status/:ip - Get specific node status`);
  console.log(`  GET /api/config - Get configuration`);
  console.log(`  GET /health - Server health check`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${appConfig.server.port} is already in use. Please close other applications using this port.`);
  } else {
    console.error('❌ Server failed to start:', err);
  }
  process.exit(1);
});