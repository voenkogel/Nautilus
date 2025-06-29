import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import https from 'https';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load centralized config
let appConfig;
try {
  const configPath = join(__dirname, '../config.json');
  const configContent = readFileSync(configPath, 'utf8');
  appConfig = JSON.parse(configContent);
  console.log('✅ Loaded centralized config from config.json');
} catch (error) {
  console.warn('Failed to load centralized config, using defaults:', error.message);
  appConfig = {
    server: {
      port: 3069,
      healthCheckInterval: 20000,
      corsOrigins: ['http://localhost:3070']
    },
    tree: {
      nodes: [
        {
          id: "root-1",
          title: "Proxmox",
          subtitle: "Primary application server",
          ip: "proxmox.lan:8006",
          url: "proxmox.koenvogel.com",
          children: [
            {
              id: "child-1-1",
              title: "Radarr",
              subtitle: "User interface application",
              ip: "pirate.lan:7878",
              url: "radarr.koenvogel.com",
              children: [
                {
                  id: "grandchild-1-1-1",
                  title: "Sonarr",
                  subtitle: "Authentication module",
                  ip: "pirate.lan:8989",
                  url: "sonarr.koenvogel.com"
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

// Configure CORS with centralized origins
app.use(cors({
  origin: appConfig.server.corsOrigins,
  credentials: true
}));

app.use(express.json());

// Store for node statuses
const nodeStatuses = new Map();

// Function to extract all IPs from the tree recursively
function extractAllIPs(nodes = appConfig.tree.nodes) {
  const ips = [];
  
  function traverse(nodeList) {
    for (const node of nodeList) {
      ips.push(node.ip);
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(nodes);
  return ips;
}

// Load IPs from centralized config
const nodeIPs = extractAllIPs();
console.log(`Loaded ${nodeIPs.length} IPs from centralized config:`, nodeIPs);

// Initialize all nodes as offline
nodeIPs.forEach(ip => {
  nodeStatuses.set(ip, { status: 'offline', lastChecked: new Date() });
});

// Create HTTPS agent that ignores self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false // Accept self-signed certificates
});

// Helper function to find node data by IP
function findNodeByIP(targetIP) {
  function searchNodes(nodes) {
    for (const node of nodes) {
      if (node.ip === targetIP) {
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
async function checkNodeHealth(ip) {
  const startTime = Date.now();
  
  // Get the node data to access URL
  const nodeData = findNodeByIP(ip);
  
  // Use URL if available, otherwise use IP with HTTPS
  let endpoint;
  if (nodeData && nodeData.url) {
    endpoint = nodeData.url.includes('://') ? nodeData.url : `https://${nodeData.url}`;
  } else {
    endpoint = ip.includes('://') ? ip : `https://${ip}`;
  }
  
  console.log(`Checking health of ${ip} via ${endpoint}`);
  
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
    
    nodeStatuses.set(ip, result);
    
    if (isOnline) {
      console.log(`✅ ${ip}: ${response.status} via ${endpoint} (${responseTime}ms)`);
    } else {
      console.log(`❌ ${ip}: HTTP ${response.status} via ${endpoint} (${responseTime}ms)`);
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
    
    nodeStatuses.set(ip, result);
    console.log(`❌ ${ip}: ${errorMessage} via ${endpoint} (${responseTime}ms)`);
  }
}

// Function to check all nodes
async function checkAllNodes() {
  console.log(`[${new Date().toISOString()}] Checking health of ${nodeIPs.length} nodes...`);
  
  const promises = nodeIPs.map(ip => checkNodeHealth(ip));
  await Promise.allSettled(promises);
  
  const onlineCount = Array.from(nodeStatuses.values()).filter(status => status.status === 'online').length;
  console.log(`Health check complete: ${onlineCount}/${nodeIPs.length} nodes online`);
}

// Start the health checking interval (from centralized config)
setInterval(checkAllNodes, appConfig.server.healthCheckInterval);

// Initial health check
checkAllNodes();

// API endpoint to get all node statuses
app.get('/api/status', (req, res) => {
  const statusObject = {};
  nodeStatuses.forEach((status, ip) => {
    statusObject[ip] = status;
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
      monitoredNodes: nodeIPs.length
    }
  });
});

// Start server
app.listen(appConfig.server.port, () => {
  console.log(`🚀 Nautilus server running on http://localhost:${appConfig.server.port}`);
  console.log(`📊 Monitoring ${nodeIPs.length} nodes with REAL HTTP health checks`);
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