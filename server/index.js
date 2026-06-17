import express from 'express';
import { NetworkScanService } from './network_scan_service.js';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

import { queryJavaServer, queryBedrockServer } from './utils/minecraft.js';
import { initHistoryDb, getNodeHistory, getAllNodesHistory, pruneOldHistory } from './utils/historyDb.js';
import { isValidHost, validateScanSubnet } from './utils/validation.js';
import { isNodeMonitored, getNodeIdentifier } from './utils/nodeMonitoring.js';
import {
  authenticateRequest,
  generateSessionToken,
  safeEqual,
  isRateLimited,
  recordFailedAuth,
  clearAuthAttempts,
  registerSession,
  destroySession,
  touchSession,
} from './middleware/auth.js';
import { publicReadLimiter } from './middleware/rateLimit.js';
import { sanitizeConfig, restoreSensitiveFields, stripMonitoredFlag } from './services/configSanitize.js';
import { deepMerge, validateConfig } from './services/configValidation.js';
import { securityHeaders } from './middleware/security.js';
import { logger } from './utils/logger.js';
import {
  setMonitoringConfig,
  initializeNodeStatuses,
  scheduleNextCheck,
  checkAllNodes,
  performNodeCheck,
  normalizeNodeIdentifier,
  nodeStatuses,
} from './services/healthCheck.js';

// Load environment variables from .env file
dotenv.config();

const app = express();
// Note: express.json() is configured later with proper limits for image uploads

// When deployed behind a reverse proxy (recommended for internet exposure), set
// NAUTILUS_TRUST_PROXY so req.ip reflects the real client via X-Forwarded-For and
// per-IP rate limiting / lockouts apply per client rather than per proxy. Value:
// "true" (trust 1 hop), a hop count, or a subnet/IP. Leave unset for direct use.
if (process.env.NAUTILUS_TRUST_PROXY) {
  const tp = process.env.NAUTILUS_TRUST_PROXY;
  app.set('trust proxy', tp === 'true' ? 1 : (/^\d+$/.test(tp) ? parseInt(tp, 10) : tp));
}

// --- Security Configuration ---

// Admin credentials from environment (required in production)
const ADMIN_USERNAME = process.env.NAUTILUS_ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.NAUTILUS_ADMIN_PASSWORD;

// Check if admin password is set and strong
if (!ADMIN_PASSWORD || ADMIN_PASSWORD === '1234') {
  logger.info('');
  logger.info('╔═══════════════════════════════════════════════════════════════════════════════╗');
  logger.info('║                                                                               ║');
  logger.info('║                    ❌ CRITICAL: SECURITY CONFIGURATION ERROR ❌                ║');
  logger.info('║                                                                               ║');
  logger.info('╠═══════════════════════════════════════════════════════════════════════════════╣');
  logger.info('║                                                                               ║');
  logger.info('║  The NAUTILUS_ADMIN_PASSWORD environment variable is NOT SET or is using      ║');
  logger.info('║  the insecure default value "1234".                                           ║');
  logger.info('║                                                                               ║');
  logger.info('║  🛑 THE SERVER CANNOT START WITHOUT A SECURE PASSWORD 🛑                      ║');
  logger.info('║                                                                               ║');
  logger.info('╠═══════════════════════════════════════════════════════════════════════════════╣');
  logger.info('║                                                                               ║');
  logger.info('║  📋 HOW TO FIX:                                                               ║');
  logger.info('║                                                                               ║');
  logger.info('║  1. Create or edit the .env file in your project root                        ║');
  logger.info('║                                                                               ║');
  logger.info('║  2. Add the following line with a STRONG password:                           ║');
  logger.info('║     NAUTILUS_ADMIN_PASSWORD=your_secure_password_here                        ║');
  logger.info('║                                                                               ║');
  logger.info('║  3. Restart the Nautilus server                                              ║');
  logger.info('║                                                                               ║');
  logger.info('║  💡 TIP: Use a password with at least 12 characters including uppercase,     ║');
  logger.info('║     lowercase, numbers, and special characters.                              ║');
  logger.info('║                                                                               ║');
  logger.info('║  📁 Your .env file location: ./.env                                          ║');
  logger.info('║                                                                               ║');
  logger.info('╚═══════════════════════════════════════════════════════════════════════════════╝');
  logger.info('');
  process.exit(1);
} else {
  logger.info('');
  logger.info('✅ Security: Admin password successfully loaded from environment variable');
  logger.info('🔒 Authentication: Password protection is ENABLED');
  logger.info('');
}


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
    healthCheckInterval: parseInt(process.env.NAUTILUS_HEALTH_CHECK_INTERVAL, 10) || 30000,
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
  let configPath;
  if (process.env.NODE_ENV === 'production') {
    configPath = '/data/config.json';
    // Check if production path exists, fallback to app directory if not
    if (!existsSync(dirname(configPath))) {
      logger.warn(`⚠️  Production config directory ${dirname(configPath)} does not exist, falling back to app config`);
      configPath = './data/config.json';
    }
  } else {
    configPath = './config.json';
  }
  
  logger.info(`🔧 NODE_ENV: ${process.env.NODE_ENV || 'undefined'}`);
  logger.info(`🔧 Config path: ${configPath}`);
  logger.info(`🔧 Working directory: ${process.cwd()}`);
  
  const configContent = readFileSync(configPath, 'utf8');
  const savedConfig = JSON.parse(configContent);
  
  logger.info(`🔧 Loaded config with ${savedConfig.tree?.nodes?.length || 0} nodes`);
  
  // Deep merge saved config over default config
  appConfig = {
    ...defaultConfig,
    ...savedConfig,
    server: { ...defaultConfig.server, ...savedConfig.server },
    client: { ...defaultConfig.client, ...savedConfig.client },
    appearance: { ...defaultConfig.appearance, ...savedConfig.appearance },
    tree: savedConfig.tree || defaultConfig.tree
  };

  logger.info('✅ Loaded and merged config from config.json and environment variables.');

  // --- MIGRATION: Convert legacy fields to new address fields ---
  function migrateNode(node) {
    let modified = false;
    
    // Migrate IP + Port -> internalAddress
    if (!node.internalAddress && node.ip && node.healthCheckPort) {
      node.internalAddress = `${node.ip}:${node.healthCheckPort}`;
      modified = true;
      logger.info(`🔄 [MIGRATION] Migrated node "${node.title}" to internalAddress: ${node.internalAddress}`);
    }
    
    // Migrate URL -> externalAddress
    if (!node.externalAddress && node.url) {
      node.externalAddress = node.url;
      modified = true;
      logger.info(`🔄 [MIGRATION] Migrated node "${node.title}" to externalAddress: ${node.externalAddress}`);
    }
    
    if (node.children && Array.isArray(node.children)) {
      node.children.forEach(child => {
        if (migrateNode(child)) modified = true;
      });
    }
    
    return modified;
  }
  
  if (appConfig.tree && appConfig.tree.nodes) {
    let treeModified = false;
    appConfig.tree.nodes.forEach(node => {
      if (migrateNode(node)) treeModified = true;
    });
    
    if (treeModified) {
      logger.info('✅ Configuration migrated to new address format (in-memory)');
    }
  }
} catch (error) {
  logger.info('No config.json found or error reading it. Using environment variables or defaults.');
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
    logger.info(`🌐 [CLIENT] ${clientIp} → ${req.method} ${req.path} (${userAgent.substring(0, 50)}...)`);
  }
  
  next();
});


// Security headers (CSP, anti-clickjacking, MIME-sniffing) — see middleware/security.js
app.use(securityHeaders);

// Increase JSON payload limit for image uploads (base64 encoded images can be large)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// ── Rate limiting ──────────────────────────────────────────────────────────────
// Implemented in middleware/rateLimit.js (publicReadLimiter imported above).


// Initialize history database, then start health checks.
// History is non-critical: never let a DB failure take down the whole server.
try {
  await initHistoryDb();
} catch (err) {
  logger.error('❌ [HISTORY] Initialization failed, continuing without history:', err.message);
}

// Configure and start the monitoring engine (services/healthCheck.js)
setMonitoringConfig(appConfig);
const monitoredNodeIds = initializeNodeStatuses();

// Start the health checking loop
scheduleNextCheck();

// Prune history on startup, then daily
pruneOldHistory(30);
setInterval(() => pruneOldHistory(30), 24 * 60 * 60 * 1000);

// ── History API ──────────────────────────────────────────────────────────────

const HISTORY_PERIODS = {
  '1h':  3_600_000,
  '24h': 86_400_000,
  '7d':  604_800_000,
  '30d': 2_592_000_000,
};

function parsePeriodMs(period) {
  return HISTORY_PERIODS[period] || HISTORY_PERIODS['7d'];
}

function mapHistoryRow(r) {
  return {
    status:       r.status,
    timestamp:    r.timestamp,
    responseTime: r.response_time,
    error:        r.error,
    playersOnline: r.players_online,
    playersMax:    r.players_max,
    streams:       r.streams,
  };
}

// Build a map of node id -> normalized health-check identifier for every
// monitored node. Lets us expose status/history keyed by the stable node id
// instead of the (sensitive) internal address. Uses the shared isNodeMonitored
// predicate so a disabled node is never surfaced here (it would otherwise leak
// stale status/history that the client considers unmonitored).
function buildNodeIdToIdentifier() {
  const map = new Map();
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (isNodeMonitored(node)) {
        map.set(node.id, normalizeNodeIdentifier(getNodeIdentifier(node)));
      }
      if (node.children) walk(node.children);
    }
  };
  walk(appConfig.tree?.nodes || []);
  return map;
}

// Cached id->identifier and identifier->ids views, rebuilt only when the config
// changes (startup and on save) instead of re-walking the tree on every
// status/history request.
let nodeIdToIdentifier = new Map();
let identifierToNodeIds = new Map();
function refreshNodeIdMaps() {
  nodeIdToIdentifier = buildNodeIdToIdentifier();
  identifierToNodeIds = new Map();
  for (const [id, identifier] of nodeIdToIdentifier.entries()) {
    if (!identifierToNodeIds.has(identifier)) identifierToNodeIds.set(identifier, []);
    identifierToNodeIds.get(identifier).push(id);
  }
}

// Initial build for the config loaded at startup (setMonitoringConfig above).
refreshNodeIdMaps();

// All nodes history
app.get('/api/history', publicReadLimiter, (req, res) => {
  const period  = req.query.period || '7d';
  const nowMs   = Date.now();
  const sinceMs = nowMs - parsePeriodMs(period);

  const rows = getAllNodesHistory(sinceMs);

  // History rows are stored keyed by health-check identifier (address); expose
  // them keyed by node id. A single address may back more than one node.
  const grouped = {};
  rows.forEach(r => {
    const ids = identifierToNodeIds.get(r.node_id);
    if (!ids) return; // orphaned history (node removed or address changed)
    const mapped = mapHistoryRow(r);
    for (const id of ids) {
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push(mapped);
    }
  });

  res.json({ records: grouped, period, sinceMs, nowMs });
});

// Single node history
app.get('/api/history/:nodeId', publicReadLimiter, (req, res) => {
  let nodeId;
  try {
    nodeId = decodeURIComponent(req.params.nodeId);
  } catch {
    return res.status(400).json({ error: 'Invalid nodeId encoding' });
  }
  const period  = req.query.period || '7d';
  const nowMs   = Date.now();
  const sinceMs = nowMs - parsePeriodMs(period);

  // nodeId is the node's id; translate to its stored health-check identifier.
  const identifier = nodeIdToIdentifier.get(nodeId);
  const rows = identifier ? getNodeHistory(identifier, sinceMs) : [];

  res.json({
    nodeId,
    records: rows.map(mapHistoryRow),
    period,
    sinceMs,
    nowMs,
  });
});

// API endpoint to get all node statuses
app.get('/api/status', publicReadLimiter, (req, res) => {
  // Expose statuses keyed by stable node id (not the internal address), so the
  // client never needs the address to correlate a node with its status.
  const statusObject = {};
  for (const [id, identifier] of nodeIdToIdentifier.entries()) {
    const status = nodeStatuses.get(identifier);
    if (status) statusObject[id] = status;
  }

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
  
  // Compute both comparisons up front (no short-circuit) so the response timing
  // is constant regardless of which credential is wrong.
  const validUsername = safeEqual(username, ADMIN_USERNAME);
  const validPassword = safeEqual(password, ADMIN_PASSWORD);
  if (!validUsername || !validPassword) {
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
  registerSession(token);
  
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
    destroySession(token);
  }
  
  res.json({ 
    success: true, 
    message: 'Logged out successfully' 
  });
});

// --- Configuration API (Protected) ---


// API endpoint to get centralized config (public - read-only, but cleaner for admins)
app.get('/api/config', publicReadLimiter, (req, res) => {
  let isAdmin = false;
  const authHeader = req.headers.authorization;
  
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Valid session token → treat as admin (and refresh its timestamp)
    if (touchSession(token)) {
      isAdmin = true;
    }
  }

  res.json(sanitizeConfig(appConfig, isAdmin));
});


// Endpoint to update the configuration
app.post('/api/config', authenticateRequest, (req, res) => {
  let newConfig = req.body; // Use let so we can modify it
  const replaceMode = req.query.replace === 'true'; // Check for replace query parameter
  
  // Validate configuration structure
  const validation = validateConfig(newConfig);
  if (!validation.valid) {
    logger.error('Configuration validation failed:', validation.error);
    return res.status(400).json({
      success: false,
      message: `Invalid configuration: ${validation.error}`
    });
  }
  
  try {
    // Restore sensitive fields (unmask) BEFORE merging
    // This looks at the incoming 'masked' values and replaces them with real values from appConfig
    newConfig = restoreSensitiveFields(newConfig, appConfig);

    // Never persist the server-derived `monitored` flag the client received.
    stripMonitoredFlag(newConfig);

    let updatedConfig;
    
    if (replaceMode) {
      // Complete replacement mode (for backup restoration). Merge over the
      // defaults so required sections (notably `server`) are always present —
      // a restored backup that omits `server` would otherwise leave
      // currentConfig.server undefined and crash the health-check loop.
      logger.info('🔄 Performing complete configuration replacement');
      updatedConfig = deepMerge(defaultConfig, newConfig);
    } else {
      // Deep merge new config with existing config (for partial updates)
      logger.info('🔄 Performing configuration merge');
      updatedConfig = deepMerge(appConfig, newConfig);
    }
    
    // Write the new configuration to the file first
    // Determine config path with fallback logic
    let configPath;
    if (process.env.NODE_ENV === 'production') {
      configPath = '/data/config.json';
      // Check if production path exists, fallback to app directory if not
      if (!existsSync(dirname(configPath))) {
        logger.warn(`⚠️  Production config directory ${dirname(configPath)} does not exist, falling back to app config`);
        configPath = './data/config.json';
        // Ensure the local data directory exists
        if (!existsSync('./data')) {
          logger.info('📁 Creating local data directory');
          mkdirSync('./data', { recursive: true });
        }
      }
    } else {
      configPath = './config.json';
    }
    
    logger.info(`🔧 NODE_ENV for config write: "${process.env.NODE_ENV}", using path: "${configPath}"`);
    writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
    // config.json holds secrets (plexToken/apiKeys) — restrict to owner-only.
    // Best-effort: no-op on platforms without POSIX permissions.
    try { chmodSync(configPath, 0o600); } catch { /* ignore */ }
    logger.info('📁 Configuration file written successfully');
    
    // Update the in-memory config only after successful file write
    appConfig = updatedConfig;
    // Push the new config into the monitoring engine so the loop reads fresh values
    setMonitoringConfig(appConfig);
    // Rebuild the cached id<->identifier maps for the status/history endpoints
    refreshNodeIdMaps();

    // Reinitialize node monitoring with new config and update nodeIdentifiers
    try {
      initializeNodeStatuses(true);
      logger.info('🔄 Node monitoring reinitialized successfully');
      
      // Force an immediate health check for all nodes to update status
      // Run in background so we don't block the response
      logger.info('⚡ Triggering immediate health check for updated configuration');
      checkAllNodes().catch(err => logger.error('❌ Error in forced health check:', err));
      
    } catch (nodeError) {
      logger.warn('⚠️  Warning: Node monitoring reinitialization failed:', nodeError.message);
      // Don't fail the entire operation if node monitoring fails
    }
    
    logger.info('✅ Configuration updated successfully');
    res.json({ 
      success: true, 
      message: 'Configuration updated successfully' 
    });
  } catch (error) {
    logger.error('❌ Error updating configuration:', error);
    logger.error('Error stack:', error.stack);
    // Generic message to the client; full details stay in the server log only.
    res.status(500).json({
      success: false,
      message: 'Failed to update configuration'
    });
  }
});

// API endpoint to get Minecraft server status
// Requires auth: this endpoint connects to an arbitrary host:port, so leaving it
// public would expose an unauthenticated SSRF / internal port-prober. It is not
// used by the frontend (Minecraft status flows through /api/status), but is kept
// for authenticated external/API callers.
app.get('/api/minecraft/status', authenticateRequest, async (req, res) => {
  const { host, port, type } = req.query;

  if (!host || !isValidHost(host)) {
    return res.status(400).json({ error: 'A valid host is required' });
  }

  const serverPort = parseInt(port) || (type === 'bedrock' ? 19132 : 25565);
  const serverType = type || 'java';

  try {
    let status;
    if (serverType === 'bedrock') {
      status = await queryBedrockServer(host, serverPort);
    } else {
      status = await queryJavaServer(host, serverPort);
    }
    res.json(status);
  } catch (error) {
    // Don't log every failed query as an error, just return 500
    res.status(500).json({ 
      error: 'Failed to query server', 
      details: error.message 
    });
  }
});

// API endpoint to get status for a specific node, keyed by node id (consistent
// with /api/status and /api/history/:nodeId — the internal address is never
// part of the public contract).
app.get('/api/status/:nodeId', publicReadLimiter, (req, res) => {
  let nodeId;
  try {
    nodeId = decodeURIComponent(req.params.nodeId);
  } catch {
    return res.status(400).json({ error: 'Invalid nodeId encoding' });
  }

  const identifier = nodeIdToIdentifier.get(nodeId);
  const status = identifier ? nodeStatuses.get(identifier) : null;

  if (!status) {
    return res.status(404).json({ error: 'Node not found' });
  }

  res.json({ nodeId, ...status });
});

// Health check endpoint for the monitoring server itself
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
    // Removed sensitive configuration details for security
  });
});

// Version endpoint — no auth required so the UI can always read it
let _versionCache = null;
function getVersionInfo() {
  if (_versionCache) return _versionCache;
  let sha = 'unknown';
  let tag = null;
  try {
    sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {}
  try {
    tag = execSync('git describe --tags --exact-match HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {}
  _versionCache = { sha, tag, version: tag || sha };
  return _versionCache;
}

app.get('/api/version', publicReadLimiter, (req, res) => {
  res.json(getVersionInfo());
});

// Start server
// --- Network Scan API (Protected) ---
const networkScanService = new NetworkScanService();

app.post('/api/network-scan/start', authenticateRequest, (req, res) => {
  try {
    const requested = req.body && req.body.subnet ? req.body.subnet : '10.20.148.0/16';
    // Validate before handing the value to nmap: enforce IPv4 CIDR, a sane size
    // cap, and RFC-1918-only ranges (prevents nmap flag injection, resource
    // exhaustion, and scanning of arbitrary external networks).
    const validated = validateScanSubnet(requested);
    if (!validated.valid) {
      logger.warn(`⚠️  [NETWORK-SCAN] Rejected subnet "${requested}": ${validated.error}`);
      return res.status(400).json({ success: false, error: validated.error });
    }
    const subnet = validated.subnet;
    logger.info(`🔍 [NETWORK-SCAN] Starting scan for subnet: ${subnet}`);

    networkScanService.start_scan({ subnet });
    
    logger.info(`✅ [NETWORK-SCAN] Scan started successfully for subnet: ${subnet}`);
    res.json({ success: true });
  } catch (err) {
    logger.error(`❌ [NETWORK-SCAN] Failed to start scan:`, err);
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/network-scan/progress', authenticateRequest, (req, res) => {
  res.json(networkScanService.get_progress());
});

// Public endpoint to check if scan is active (no auth required)
app.get('/api/network-scan/status', publicReadLimiter, (req, res) => {
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
// API endpoint to test connection for a specific node configuration (Protected)
app.post('/api/test-connection', authenticateRequest, async (req, res) => {
  try {
    const nodeConfig = req.body;
    
    // Check if node config is valid
    if (!nodeConfig || typeof nodeConfig !== 'object') {
       return res.status(400).json({ error: 'Invalid node configuration' });
    }
    
    logger.info(`🧪 [TEST-CONNECTION] Testing configuration for "${nodeConfig.title || 'Unknown'}"`);
    
    // Perform check using the provided config (not stored config)
    const result = await performNodeCheck(nodeConfig);
    
    res.json(result);
  } catch (err) {
    logger.error(`❌ [TEST-CONNECTION] Error:`, err);
    res.status(500).json({ 
      status: 'offline', 
      error: err.message,
      lastChecked: new Date().toISOString()
    });
  }
});

app.listen(appConfig.server.port, () => {
  const { version } = getVersionInfo();
  logger.info(`📌 Version: ${version}`);
  logger.info(` Monitoring ${monitoredNodeIds.length} nodes every ${appConfig.server.healthCheckInterval / 1000}s`);
  logger.info(`🔍 Using HTTP GET requests with 5s timeout (URL preferred over IP)`);
  logger.info('');
  logger.info(`🚀 Server ready at: http://localhost:${appConfig.server.port}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`❌ Port ${appConfig.server.port} is already in use. Please close other applications using this port.`);
  } else {
    logger.error('❌ Server failed to start:', err);
  }
  process.exit(1);
});