import express from 'express';
import cors from 'cors';
import axios from 'axios';
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

// Function to check a single node's health
async function checkNodeHealth(ip) {
  try {
    // For demo purposes, randomly set some nodes as online
    const isOnline = Math.random() > 0.3; // 70% chance of being online
    
    if (isOnline) {
      nodeStatuses.set(ip, { 
        status: 'online', 
        lastChecked: new Date(),
        responseTime: Math.floor(Math.random() * 100) + 10
      });
    } else {
      throw new Error('Node unreachable');
    }
  } catch (error) {
    nodeStatuses.set(ip, { 
      status: 'offline', 
      lastChecked: new Date(),
      error: error.message || 'Network unreachable'
    });
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
  console.log(`📊 Monitoring ${nodeIPs.length} nodes`);
  console.log(`⏰ Health checks every ${appConfig.server.healthCheckInterval / 1000} seconds`);
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