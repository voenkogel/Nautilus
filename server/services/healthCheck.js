// Health-check engine (ARCH-1). Extracted from index.js. The current config is
// injected via setMonitoringConfig() whenever index.js loads/saves config, so the
// loop always reads fresh values (port, intervals, webhook settings, node tree).
import { fetch, Agent } from 'undici';
import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { sendStatusWebhook } from '../utils/webhooks.js';
import { queryJavaServer, queryBedrockServer } from '../utils/minecraft.js';
import { queryPlexServer } from '../utils/plex.js';
import { recordStatusHistory } from '../utils/historyDb.js';
import { isValidHost } from '../utils/validation.js';
import { isNodeMonitored, getNodeIdentifier } from '../utils/nodeMonitoring.js';
import { effectiveBackupWindow, isWithinBackupWindow, setBackupDetectionConfig } from '../utils/backupWindow.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

let currentConfig = null;
// Cached maps of normalized identifier -> node(s), rebuilt only when the config
// changes (here) rather than re-walking the whole tree on every lookup. The
// health-check loop calls findNodeByIdentifier several times per node per
// cycle, so this turns those tree searches into O(1) map gets.
let identifierToNode = new Map();   // first node at an address (drives the check itself)
let identifierToNodes = new Map();  // every node at an address (backup-window aggregation)

export function setMonitoringConfig(config) {
  currentConfig = config;
  const built = buildIdentifierToNodeMap(config);
  identifierToNode = built.first;
  identifierToNodes = built.all;
  // Keep backup-window detection settings (enabled flag, timezone) in sync with
  // the freshest config so isWithinBackupWindow/effectiveBackupWindow read them.
  setBackupDetectionConfig(config?.backupDetection);
}

// Build normalized-identifier -> node. `first` keeps first-match-wins (matching
// the previous depth-first searchNodes behaviour when two nodes share an
// address); `all` keeps every node at the address so backup-window suppression
// can honour an opt-out/manual window set on ANY card, not just the first.
function buildIdentifierToNodeMap(config) {
  const first = new Map();
  const all = new Map();
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      const identifier = getNodeIdentifier(node);
      if (identifier) {
        const normalized = normalizeNodeIdentifier(identifier);
        if (!first.has(normalized)) first.set(normalized, node);
        if (!all.has(normalized)) all.set(normalized, []);
        all.get(normalized).push(node);
      }
      if (node.children) walk(node.children);
    }
  };
  walk(config?.tree?.nodes);
  return { first, all };
}

// Resolve the effective backup window for an address, honouring EVERY node that
// shares it: a manual window on any card applies, and if any card opts out then
// autodetection is off for the address. Health checks run once per address, so
// the suppression decision must not depend on which card happens to be first.
function backupWindowForIdentifier(normalizedIdentifier) {
  const nodes = identifierToNodes.get(normalizedIdentifier) || [];
  const manual = nodes.map((n) => n.backupWindow).find((w) => w && w.source !== 'auto');
  const disableBackupDetection = nodes.some((n) => n.disableBackupDetection);
  return effectiveBackupWindow({ backupWindow: manual, disableBackupDetection }, normalizedIdentifier);
}

// Store for node statuses
export const nodeStatuses = new Map();

// Track consecutive failures per node to suppress transient offline flips
const consecutiveFailures = new Map();
const OFFLINE_THRESHOLD = 2; // require this many consecutive failures before marking offline

// Offline notification cooldown tracking (feature: notifyAfterSeconds)
const offlineSince = new Map();    // identifier -> timestamp when first confirmed offline
const offlineNotified = new Set(); // identifiers where offline webhook has already been sent this outage

// Per-node check interval tracking
const nodeLastChecked = new Map(); // identifier -> timestamp of last check
const MIN_LOOP_INTERVAL = 5000;    // Base scheduling loop runs every 5 s minimum

// Function to normalize a node identifier (IP or URL)
export function normalizeNodeIdentifier(identifier) {
  if (!identifier) return '';
  
  // Remove protocols (http://, https://)
  let normalized = identifier.replace(/^https?:\/\//, '');
  // Remove trailing slashes
  normalized = normalized.replace(/\/+$/, '');
  
  return normalized;
}

// Function to extract all node identifiers for health check monitoring
// NEW ARCHITECTURE: Only includes nodes with healthCheckPort specified
function extractAllNodeIdentifiers(nodes = currentConfig.tree?.nodes) {
  const identifiers = [];
  
  // Check if currentConfig and tree structure exist
  if (!currentConfig || !currentConfig.tree || !currentConfig.tree.nodes) {
    logger.warn('⚠️  Warning: currentConfig.tree.nodes is not available, using empty node list');
    return identifiers;
  }
  
  function traverse(nodeList) {
    if (!Array.isArray(nodeList)) {
      logger.warn('⚠️  Warning: nodeList is not an array, skipping');
      return;
    }
    
    for (const node of nodeList) {
      try {
        // Monitor a node only when the shared predicate says so (has an address
        // and isn't disabled by flag or 'disabled' check type) — keeps the
        // server's monitored set identical to the client's isNodeMonitored().
        if (isNodeMonitored(node)) {
          const identifier = getNodeIdentifier(node);
          logger.info(`📍 [MONITOR] Node "${node.title || node.id}": monitoring "${identifier}"`);

          // Normalize the identifier to ensure consistent format
          const normalizedIdentifier = normalizeNodeIdentifier(identifier);
          identifiers.push(normalizedIdentifier);
        } else {
          const reason = node.disableHealthCheck ? 'explicitly disabled'
            : node.healthCheckType === 'disabled' ? "health check type 'disabled'"
            : 'missing internalAddress (or ip+port)';
          logger.info(`⏭️  [SKIP] Node "${node.title || node.id}": ${reason}, excluded from monitoring`);
        }
        
        if (node.children && Array.isArray(node.children)) {
          traverse(node.children);
        }
      } catch (nodeError) {
        logger.warn(`⚠️  Warning: Error processing node ${node.id || 'unknown'}:`, nodeError.message);
        continue;
      }
    }
  }
  
  try {
    traverse(nodes || currentConfig.tree.nodes);
  } catch (error) {
    logger.error('❌ Error in extractAllNodeIdentifiers:', error);
    throw error;
  }
  
  return identifiers;
}

// Initialize statuses code (moved before health check)
export function initializeNodeStatuses(preserveExisting = false) {
  try {
    // Get fresh list of node identifiers (assigns the module-level nodeIdentifiers)
    nodeIdentifiers = extractAllNodeIdentifiers();
    
    if (preserveExisting) {
      // Preserve existing statuses and only add new nodes or remove deleted ones
      const existingStatuses = new Map(nodeStatuses);
      nodeStatuses.clear();
      consecutiveFailures.clear();

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
      consecutiveFailures.clear();
      
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
    
    logger.info(`🔄 Initialized monitoring for ${nodeIdentifiers.length} nodes`);
    return nodeIdentifiers;
  } catch (error) {
    logger.error('❌ Error in initializeNodeStatuses:', error);
    throw error;
  }
}

// Monitored identifiers — populated by initializeNodeStatuses() (called from index.js
// after setMonitoringConfig). Not initialized at import (config isn't injected yet).
let nodeIdentifiers = [];
let initialHealthCheck = true;

// undici dispatcher that ignores self-signed certificates. We deliberately import
// undici's OWN `fetch` (above) rather than Node's global fetch: on Node < 22 the
// global fetch does NOT reliably honour a per-request `dispatcher` from a
// separately-installed undici, so the rejectUnauthorized override was silently
// dropped and every HTTPS/self-signed check failed. Pairing undici's fetch with
// undici's Agent keeps them in the same module instance so the dispatcher applies.
const insecureDispatcher = new Agent({
  connect: { rejectUnauthorized: false } // Accept self-signed certificates
});

// Helper function to find node data by identifier (IP:port format).
// O(1) lookup against the map cached by setMonitoringConfig().
function findNodeByIdentifier(targetIdentifier) {
  return identifierToNode.get(normalizeNodeIdentifier(targetIdentifier)) || null;
}

// Function to check a single node's status (Pure logic, no side effects)
export async function performNodeCheck(nodeData) {
  if (!nodeData) {
    return {
      status: 'offline',
      lastChecked: new Date().toISOString(),
      responseTime: 0,
      error: 'Node data not provided'
    };
  }

  // Only nodes with healthCheckPort or internalAddress should be checked
  let baseEndpoint;
  let host, port;
  let protocol = 'http';
  
  if (nodeData.internalAddress) {
    baseEndpoint = nodeData.internalAddress;
    
    // Parse protocol, host, and port
    let cleanAddress = baseEndpoint;
    if (baseEndpoint.startsWith('https://')) {
      protocol = 'https';
      cleanAddress = baseEndpoint.substring(8);
    } else if (baseEndpoint.startsWith('http://')) {
      protocol = 'http';
      cleanAddress = baseEndpoint.substring(7);
    }
    
    const parts = cleanAddress.split(':');
    host = parts[0];
    port = parts[1] ? parseInt(parts[1]) : undefined;
    
  } else if (nodeData.healthCheckPort && nodeData.ip) {
    baseEndpoint = `${nodeData.ip}:${nodeData.healthCheckPort}`;
    host = nodeData.ip;
    port = nodeData.healthCheckPort;
  }
  
  // If Plex, we don't strictly need internalAddress if we have host/port via other means, 
  // but the current architecture assumes internalAddress or ip+port is the source of truth.
  // We'll proceed if we have a baseEndpoint OR if it's a type that might handle itself (though strictly we need a host).

  if (!baseEndpoint) {
     return {
      status: 'offline',
      lastChecked: new Date().toISOString(),
      responseTime: 0,
      error: 'Invalid node configuration - missing internalAddress'
    };
  }
  
  let finalResult;

  // Check based on type
  if (nodeData.healthCheckType === 'minecraft') {
    try {
      const startTime = Date.now();
      // Default ports if not specified
      const mcPort = port || 25565;
      const result = await queryJavaServer(host, mcPort);
      
      finalResult = {
        status: 'online',
        lastChecked: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        players: result.players,
        version: result.version,
        motd: result.motd,
        favicon: result.favicon
      };
    } catch (err) {
      finalResult = {
        status: 'offline',
        lastChecked: new Date().toISOString(),
        responseTime: 0,
        error: err.message
      };
    }
  } else if (nodeData.healthCheckType === 'plex') {
    try {
      const startTime = Date.now();
      const plexPort = port || 32400;
      
      const result = await queryPlexServer(host, plexPort, nodeData.plexToken, protocol);
      
      finalResult = {
        status: 'online',
        lastChecked: new Date().toISOString(),
        responseTime: Date.now() - startTime,
        streams: result.streams
      };
    } catch (err) {
      finalResult = {
        status: 'offline',
        lastChecked: new Date().toISOString(),
        responseTime: 0,
        error: err.message,
        streams: 0 // Ensure streams is defined even on error so UI can show it if needed (or at least not crash)
      };
    }
  } else if (nodeData.healthCheckType === 'ping') {
    // ICMP ping check. The host is validated and ping is invoked via execFile
    // (no shell), so a host value can never be reinterpreted as a shell command
    // or a command-line flag.
    if (!isValidHost(host)) {
      finalResult = {
        status: 'offline',
        lastChecked: new Date().toISOString(),
        responseTime: 0,
        error: 'Invalid host',
      };
    } else {
      try {
        const startTime = Date.now();
        const isWindows = os.platform() === 'win32';
        const pingArgs = isWindows
          ? ['-n', '1', '-w', '2000', host]
          : ['-c', '1', '-W', '2', host];
        const { stdout } = await execFileAsync('ping', pingArgs, { timeout: 5000 });
        const elapsed = Date.now() - startTime;
        // Extract RTT from output: "time=1.23 ms" (Linux) or "time=1ms" (Windows)
        const match = stdout.match(/time[<=](\d+\.?\d*)\s*ms/i);
        const pingTime = match ? parseFloat(match[1]) : elapsed;
        finalResult = {
          status: 'online',
          lastChecked: new Date().toISOString(),
          responseTime: Math.round(pingTime),
        };
      } catch {
        finalResult = {
          status: 'offline',
          lastChecked: new Date().toISOString(),
          responseTime: 0,
          error: 'Host unreachable',
        };
      }
    }
  } else if (nodeData.healthCheckType === 'disabled' || nodeData.disableHealthCheck) {
     finalResult = {
       status: 'offline',
       lastChecked: new Date().toISOString(),
       responseTime: 0,
       error: 'Monitoring disabled'
     };
  } else {
    // HTTP/TCP Check
    // If protocol is already specified, use it directly
    if (baseEndpoint.includes('://')) {
      // Use the identifier from nodeData if available, otherwise just use endpoint as ID for logging
      const id = nodeData.internalAddress || 'unknown';
      finalResult = await attemptHealthCheck(baseEndpoint, id, nodeData);
    } else {
      // Always try HTTPS first, then HTTP fallback
      const id = normalizeNodeIdentifier(baseEndpoint);
      
      // Try HTTPS first
      let result = await attemptHealthCheck(`https://${baseEndpoint}`, id, nodeData);
      
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
        const httpResult = await attemptHealthCheck(`http://${baseEndpoint}`, id, nodeData);
        
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
  }
  
  return finalResult;
}

// Function to check a single node's health with automatic HTTP/HTTPS fallback
async function checkNodeHealth(identifier) {
  const normalizedIdentifier = normalizeNodeIdentifier(identifier);
  
  logger.info(`🔍 [HEALTH_CHECK] Checking "${identifier}" → normalized: "${normalizedIdentifier}"`);
  
  // Get the node data to access IP, URL, and healthCheckPort
  const nodeData = findNodeByIdentifier(normalizedIdentifier);
  
  if (!nodeData) {
     logger.info(`⚠️  [ENDPOINT] Node not found for "${normalizedIdentifier}"`);
     return {
      status: 'offline',
      lastChecked: new Date().toISOString(),
      responseTime: 0,
      error: 'Node not found'
    };
  }

  // Use the new pure function
  const finalResult = await performNodeCheck(nodeData);
  const now = Date.now();

  // realStatus = genuine reachability from this check ('online' | 'offline').
  const realStatus = finalResult.status;

  const previousStatus = nodeStatuses.get(normalizedIdentifier);
  const prevRaw = previousStatus?.status;
  // Previous *real* status: unwrap a 'backup' display back to 'offline'.
  const prevReal = previousStatus
    ? (previousStatus.realStatus ?? (prevRaw === 'backup' ? 'offline' : prevRaw))
    : undefined;

  // Is the node currently inside a backup window? Only relabel a genuine offline,
  // and never repaint an outage we've already alerted on (keep it red, still recover).
  const win = realStatus === 'offline' ? backupWindowForIdentifier(normalizedIdentifier) : null;
  const inBackup = !!win && isWithinBackupWindow(win, now) && !offlineNotified.has(normalizedIdentifier);

  // Record every check to history (before suppression, to capture true state).
  // Inside a backup window, record 'backup' so uptime math excludes it and
  // autodetection treats it as known/expected downtime.
  recordStatusHistory(normalizedIdentifier, { ...finalResult, status: inBackup ? 'backup' : realStatus });

  // Suppress transient offline flips: require OFFLINE_THRESHOLD consecutive failures
  // before flipping a previously-up node offline. Skipped inside a backup window so
  // 'backup' shows promptly (it never notifies).
  if (realStatus === 'offline') {
    const failures = (consecutiveFailures.get(normalizedIdentifier) || 0) + 1;
    consecutiveFailures.set(normalizedIdentifier, failures);

    const wasUp = prevReal === 'online' || prevRaw === 'backup';
    if (!inBackup && wasUp && failures < OFFLINE_THRESHOLD) {
      logger.info(`⚠️  [HEALTH_CHECK] Transient failure ${failures}/${OFFLINE_THRESHOLD} for "${normalizedIdentifier}", suppressing offline`);
      const suppressedResult = { ...previousStatus, lastChecked: finalResult.lastChecked };
      nodeStatuses.set(normalizedIdentifier, suppressedResult);
      return { ...suppressedResult, notification: null };
    }
  } else if (realStatus === 'online') {
    consecutiveFailures.set(normalizedIdentifier, 0);
  }

  // Compute the display status (may be 'backup') and stamp it onto the result.
  finalResult.realStatus = realStatus;
  if (inBackup) finalResult.status = 'backup';

  // statusChangedAt tracks the *display* status transitions (for "backing up for 5m").
  const statusChanged = !previousStatus || prevRaw !== finalResult.status;
  finalResult.statusChangedAt = (previousStatus && !statusChanged)
    ? previousStatus.statusChangedAt
    : new Date().toISOString();

  // Store using normalized identifier for consistent lookups
  nodeStatuses.set(normalizedIdentifier, finalResult);

  // Notifications are driven by the *real* online<->offline transition, never by
  // the backup mask. Transitions out of 'checking'/startup never notify.
  const realTransition = (prevReal === 'online' || prevReal === 'offline') && prevReal !== realStatus;
  const nodeName = nodeData?.title || nodeData?.id || normalizedIdentifier;
  const notifyDetails = {
    error: finalResult.error,
    responseTime: finalResult.responseTime,
    endpoint: finalResult.endpoint,
    statusCode: finalResult.statusCode,
  };
  const buildNotif = (event) => ({
    identifier: normalizedIdentifier,
    nodeName,
    event,
    timestamp: new Date().toISOString(),
    details: notifyDetails,
  });

  let notification = null;

  if (realStatus === 'online') {
    // Recovery: notify only if we actually alerted this outage (so a pure nightly
    // backup — never alerted — recovers silently).
    const wasNotified = offlineNotified.has(normalizedIdentifier);
    offlineSince.delete(normalizedIdentifier);
    offlineNotified.delete(normalizedIdentifier);
    if (realTransition && wasNotified && currentConfig?.webhooks?.statusNotifications) {
      logger.info(`📢 [NOTIFICATION] "${nodeName}" recovered: offline → online`);
      notification = buildNotif('online');
    }
  } else if (realStatus === 'offline') {
    // Mark the outage start only on a genuine online → offline transition, so a
    // node that was already offline at startup never triggers a deferred alert.
    // Gate on notifications being configured: otherwise offlineSince accumulates
    // silently and, the moment webhooks are later enabled, the deferred checker
    // fires a retroactive alert storm for outages that began before then.
    if (prevReal === 'online' && currentConfig?.webhooks?.statusNotifications) {
      offlineSince.set(normalizedIdentifier, now);
    }
    if (inBackup) {
      // Suppressed: no notification. offlineSince (if set) lets the deferred
      // checker alert once the window ends should the outage persist past it.
      if (realTransition) {
        logger.info(`🟣 [BACKUP] "${nodeName}" offline within backup window — notification suppressed`);
      }
    } else if (realTransition && currentConfig?.webhooks?.statusNotifications) {
      const notifyAfterMs = (currentConfig.webhooks.statusNotifications.notifyAfterSeconds || 0) * 1000;
      if (notifyAfterMs === 0) {
        offlineNotified.add(normalizedIdentifier);
        logger.info(`📢 [NOTIFICATION] "${nodeName}" went offline`);
        notification = buildNotif('offline');
      } else {
        logger.info(`⏳ [NOTIFY] "${nodeName}" offline — notification deferred ${notifyAfterMs / 1000}s`);
      }
    }
  }

  // Return both result and notification
  return { ...finalResult, notification };
}

// Helper function to attempt health check for a specific endpoint
async function attemptHealthCheck(endpoint, normalizedIdentifier, nodeData) {
  const nodeName = nodeData?.title || nodeData?.id || normalizedIdentifier;
  logger.info(`🚀 [ATTEMPT] Trying ${endpoint} for node "${nodeName}"`);
  
  let result;
  let timeoutId;
  const attemptStart = Date.now();
  
  try {
    // Use AbortController for proper timeout handling and resource cleanup
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'User-Agent': 'Nautilus-Monitor/1.0'
      },
      dispatcher: endpoint.startsWith('https://') ? insecureDispatcher : undefined,
      signal: controller.signal
    });
    
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

    // undici/native fetch surfaces low-level failures as `TypeError: fetch failed`
    // with the real socket/TLS error on `error.cause`. node-fetch used to put the
    // code/message directly on the error, so classify against the cause here —
    // otherwise every failure collapses to the useless "fetch failed" string and
    // the HTTPS→HTTP fallback in performNodeCheck (which matches on this text)
    // never fires, leaving HTTP-only nodes stuck offline.
    const cause = error.cause || error;
    const code = cause.code || error.code;
    const rawMessage = cause.message || error.message;

    let errorMessage = 'Unknown error';

    if (error.name === 'AbortError' || rawMessage === 'Request timeout (5s)') {
      errorMessage = 'Request timeout (5s)';
    } else if (code === 'ENOTFOUND') {
      errorMessage = 'Host not found (DNS failed)';
    } else if (code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused (service down)';
    } else if (code === 'ECONNRESET') {
      errorMessage = 'Connection reset (network issue)';
    } else if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT') {
      errorMessage = 'Connection timeout';
    } else if (rawMessage) {
      errorMessage = rawMessage;
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

// Helper to find monitored children for a given node
function getMonitoredChildren(node) {
  if (!node.children || !Array.isArray(node.children)) return [];
  // Use the shared predicate so internalAddress-only children (the migrated
  // default) are recognized as monitored, not just legacy ip+healthCheckPort.
  return node.children.filter(child => isNodeMonitored(child));
}

// Process notifications with bundling logic
async function processNotifications(notifications) {
  if (!notifications || notifications.length === 0) return;
  
  const notificationMap = new Map(notifications.map(n => [n.identifier, n]));
  const consumedIds = new Set();
  const bundles = [];
  
  // Recursive function to find bundles
  function findBundles(nodes) {
    if (!nodes || !Array.isArray(nodes)) return;

    for (const node of nodes) {
      // Construct the normalized identifier for this node using the same
      // resolver the health check / notifications use (internalAddress, or the
      // legacy ip:port pair). Keying on ip:port alone meant nodes configured
      // with internalAddress — the migrated default — never matched, so their
      // parent/children outages were never bundled.
      const rawIdentifier = getNodeIdentifier(node);
      const nodeIdentifier = rawIdentifier ? normalizeNodeIdentifier(rawIdentifier) : null;
      
      const nodeNotification = nodeIdentifier ? notificationMap.get(nodeIdentifier) : null;
      
      // Check if this node is a candidate for being a parent of a bundle
      if (nodeNotification && !consumedIds.has(nodeIdentifier)) {
        const monitoredChildren = getMonitoredChildren(node);
        
        if (monitoredChildren.length > 0) {
          // Check if ALL monitored children have the SAME status change
          const childrenNotifications = [];
          let allChildrenMatch = true;
          
          for (const child of monitoredChildren) {
            const childId = normalizeNodeIdentifier(getNodeIdentifier(child));
            const childNotif = notificationMap.get(childId);
            
            if (!childNotif || childNotif.event !== nodeNotification.event || consumedIds.has(childId)) {
              allChildrenMatch = false;
              break;
            }
            childrenNotifications.push({ id: childId, name: child.title || child.id });
          }
          
          if (allChildrenMatch) {
            // Create Bundle
            consumedIds.add(nodeIdentifier);
            childrenNotifications.forEach(c => consumedIds.add(c.id));
            
            bundles.push({
              type: 'bundle',
              parentName: node.title || node.id,
              childrenCount: childrenNotifications.length,
              event: nodeNotification.event,
              timestamp: nodeNotification.timestamp,
              baseNotification: nodeNotification
            });
          }
        }
      }
      
      // Recurse into children
      if (node.children) {
        findBundles(node.children);
      }
    }
  }
  
  // Start traversal from root
  if (currentConfig.tree && currentConfig.tree.nodes) {
    findBundles(currentConfig.tree.nodes);
  }
  
  // Send Bundles
  for (const bundle of bundles) {
    const emoji = bundle.event === 'online' ? '✅' : '❌';
    const message = `${emoji} ${bundle.parentName} and its ${bundle.childrenCount} children have gone ${bundle.event}`;
    
    logger.info(`📦 [BUNDLE] Sending bundled notification: "${message}"`);

    if (currentConfig.webhooks?.statusNotifications) {
       sendStatusWebhook(
         currentConfig.webhooks.statusNotifications,
         bundle.parentName, 
         bundle.event,
         {
           messageOverride: message,
           isBundle: true,
           childrenCount: bundle.childrenCount,
           ...bundle.baseNotification.details
         }
       ).catch(e => logger.error(`❌ [WEBHOOK] Bundle send failed: ${e.message}`));
    }
  }
  
  // Send Remaining Individual Notifications
  for (const notif of notifications) {
    if (!consumedIds.has(notif.identifier)) {
       if (currentConfig.webhooks?.statusNotifications) {
         sendStatusWebhook(
           currentConfig.webhooks.statusNotifications,
           notif.nodeName,
           notif.event,
           notif.details
         ).catch(e => logger.error(`❌ [WEBHOOK] Send failed: ${e.message}`));
       }
    }
  }
}

// Build deferred offline notifications whose cooldown has now elapsed
function checkDeferredOfflineNotifications() {
  if (!currentConfig?.webhooks?.statusNotifications) return [];
  const notifyAfterMs = (currentConfig.webhooks.statusNotifications.notifyAfterSeconds || 0) * 1000;
  // Note: we no longer early-return when notifyAfterMs === 0. A backup-window
  // suppression sets offlineSince without notifying; once the window ends and the
  // node is genuinely offline this checker fires the (possibly zero-cooldown) alert.

  const now = Date.now();
  const deferred = [];

  for (const [identifier, since] of offlineSince.entries()) {
    if (offlineNotified.has(identifier)) continue;       // Already sent
    if (now - since < notifyAfterMs) continue;           // Cooldown not elapsed
    const currentStatus = nodeStatuses.get(identifier);
    // Skip nodes that recovered OR are still masked as 'backup' (in-window). Once
    // a backup window ends and the node is genuinely offline, we alert here.
    if (currentStatus?.status !== 'offline') continue;

    offlineNotified.add(identifier);
    const nodeData = findNodeByIdentifier(identifier);
    const nodeName = nodeData?.title || nodeData?.id || identifier;
    logger.info(`📢 [NOTIFY] Deferred offline: "${nodeName}" (offline ${Math.round((now - since) / 1000)}s)`);

    deferred.push({
      identifier,
      nodeName,
      event: 'offline',
      timestamp: new Date().toISOString(),
      details: {
        error: currentStatus?.error,
        responseTime: currentStatus?.responseTime,
      },
    });
  }

  return deferred;
}

// Function to check all nodes
export async function checkAllNodes() {
  const now = Date.now();
  const BATCH_SIZE = 10;

  // Only check nodes whose individual (or global) interval has elapsed
  const dueIdentifiers = nodeIdentifiers.filter(id => {
    const node = findNodeByIdentifier(normalizeNodeIdentifier(id));
    const interval = (node?.healthCheckInterval != null && node.healthCheckInterval > 0)
      ? node.healthCheckInterval
      : currentConfig.server.healthCheckInterval;
    return now - (nodeLastChecked.get(id) || 0) >= interval;
  });

  // Mark all due nodes as checked now
  dueIdentifiers.forEach(id => nodeLastChecked.set(id, now));

  const cycleNotifications = [];
  const queue = [...dueIdentifiers];

  while (queue.length > 0) {
    const batch = queue.splice(0, BATCH_SIZE);

    const promises = batch.map(async (identifier) => {
      const { notification, ...result } = await checkNodeHealth(identifier);

      if (notification) {
        cycleNotifications.push(notification);
      }

      const normalizedIdentifier = normalizeNodeIdentifier(identifier);

      // Only log offline nodes with details
      if (result.status === 'offline') {
        const nodeData = findNodeByIdentifier(normalizedIdentifier);
        const displayName = nodeData?.title || normalizedIdentifier;
        const errorDetail = result.error ? ` (${result.error})` : '';
        logger.info(`❌ ${displayName} (${normalizedIdentifier}): offline${errorDetail}`);
      }

      return result;
    });

    await Promise.allSettled(promises);
  }

  // Merge deferred offline notifications whose cooldown has now elapsed
  const deferred = checkDeferredOfflineNotifications();
  const allNotifications = [...cycleNotifications, ...deferred];

  if (allNotifications.length > 0) {
    await processNotifications(allNotifications);
  }

  if (dueIdentifiers.length > 0) {
    const statuses = Array.from(nodeStatuses.entries());
    const onlineCount = statuses.filter(([_, s]) => s.status === 'online').length;
    logger.info(`✨ Health check complete: ${onlineCount}/${nodeIdentifiers.length} nodes online (${dueIdentifiers.length} checked this cycle)`);
  }

  // Reset the initial health check flag after the first complete cycle to enable notifications
  if (initialHealthCheck) {
    initialHealthCheck = false;
    logger.info('🔔 Initial health check complete - status notifications enabled for future changes');
  }
}

// Recursive scheduling function to prevent overlapping checks.
// Runs at MIN_LOOP_INTERVAL so nodes with custom shorter intervals are serviced promptly.
// Each node is only actually checked when its own interval has elapsed.
export async function scheduleNextCheck() {
  try {
    await checkAllNodes();
  } catch (error) {
    logger.error('❌ Critical error in health check loop:', error);
  } finally {
    const loopInterval = Math.min(currentConfig.server.healthCheckInterval, MIN_LOOP_INTERVAL);
    setTimeout(scheduleNextCheck, loopInterval);
  }
}
