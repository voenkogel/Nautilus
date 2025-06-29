import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const app = express();
const PORT = 3001;

// Get current directory (ES module equivalent of __dirname)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Enable CORS for all routes
app.use(cors());
app.use(express.json());

// Store for node statuses
const nodeStatuses = new Map();

// Function to extract all IPs from the tree config
function extractIPsFromTreeConfig() {
  try {
    const configPath = join(__dirname, '../src/config/treeConfig.ts');
    const configContent = readFileSync(configPath, 'utf8');
    
    // Extract IP addresses using regex
    const ipRegex = /ip:\s*["']([^"']+)["']/g;
    const ips = [];
    let match;
    
    while ((match = ipRegex.exec(configContent)) !== null) {
      ips.push(match[1]);
    }
    
    console.log(`Loaded ${ips.length} IPs from tree config:`, ips);
    return ips;
  } catch (error) {
    console.error('Failed to load tree config:', error.message);
    return [];
  }
}

// Load IPs from tree config
const nodeIPs = extractIPsFromTreeConfig();

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

// Start the health checking interval (every 20 seconds)
setInterval(checkAllNodes, 20000);

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
    monitoredNodes: nodeIPs.length
  });
});

app.listen(PORT, () => {
  console.log(`Status monitoring server running on http://localhost:${PORT}`);
  console.log(`Monitoring ${nodeIPs.length} nodes with 20-second intervals`);
  console.log('API endpoints:');
  console.log(`  GET /api/status - Get all node statuses`);
  console.log(`  GET /api/status/:ip - Get specific node status`);
  console.log(`  GET /health - Server health check`);
});