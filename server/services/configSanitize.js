// Config sanitization for client consumption (SEC-3).
//
// - sanitizeConfig: mask secrets, derive a non-sensitive `monitored` flag, and
//   (for non-admins) mask the internal monitoring address.
// - restoreSensitiveFields: re-inject masked secrets/addresses on save so a
//   sanitized config round-tripped by the client can never wipe them.
// - stripMonitoredFlag: drop the server-derived `monitored` flag before persisting.

import { isNodeMonitored } from '../utils/nodeMonitoring.js';

const SENSITIVE_MASK = '********';

// Single registry of node secret fields. Masking (sanitizeConfig) and restoring
// (restoreSensitiveFields) both iterate this list, so adding a new secret field
// is a one-line change that keeps the two sides in lockstep — previously the
// field names were hardcoded independently in each function and could drift.
// (The internal monitoring address is handled separately below: it is masked
// with a sentinel and the whole address group is restored together.)
const SECRET_NODE_FIELDS = ['plexToken', 'apiKeys'];

export function sanitizeConfig(config, isAdmin = false) {
  if (!config) return config;

  // Deep clone to avoid modifying the original in-memory config
  const sanitized = JSON.parse(JSON.stringify(config));

  // Recursive: mask secrets, add the derived `monitored` flag, and (for
  // non-admins) strip the internal monitoring address.
  function maskSensitiveFields(nodes) {
    if (!Array.isArray(nodes)) return;

    nodes.forEach(node => {
      // Mask every registered secret field for everyone
      SECRET_NODE_FIELDS.forEach(field => {
        if (node[field]) node[field] = SENSITIVE_MASK;
      });

      // Derive a non-sensitive monitoring flag so the client can correlate status
      // (keyed by node id) and show monitored state without the internal address.
      // Uses the shared predicate so it matches the client's isNodeMonitored().
      const hasAddr = !!node.internalAddress || !!(node.ip && node.healthCheckPort);
      node.monitored = isNodeMonitored(node);

      // Non-admins never receive the real internal address (network-topology
      // recon). We MASK internalAddress with a sentinel rather than delete it;
      // restoreSensitiveFields() re-injects the real address fields on save when
      // it sees the mask, so a sanitized config saved back can never wipe them.
      // (External address / URL — the user-facing launch link — is kept.)
      if (!isAdmin && hasAddr) {
        node.internalAddress = SENSITIVE_MASK;
        delete node.ip;
        delete node.healthCheckPort;
      }

      if (node.children) {
        maskSensitiveFields(node.children);
      }
    });
  }

  if (sanitized.tree && sanitized.tree.nodes) {
    maskSensitiveFields(sanitized.tree.nodes);
  }

  return sanitized;
}

// When a client sends back a config with masked fields (e.g., plexToken: '********'),
// restore the actual values from the current config before saving.
export function restoreSensitiveFields(newConfig, originalConfig) {
  if (!newConfig || !originalConfig) return newConfig;

  // Deep clone to avoid modifying the passed config
  const restored = JSON.parse(JSON.stringify(newConfig));

  // Recursive function to restore sensitive fields in nodes
  function restoreInNodes(newNodes, originalNodes) {
    if (!Array.isArray(newNodes) || !Array.isArray(originalNodes)) return;

    newNodes.forEach(newNode => {
      // Find the corresponding original node by ID
      const originalNode = originalNodes.find(n => n.id === newNode.id);

      if (originalNode) {
        // Restore any masked secret field from the original config.
        SECRET_NODE_FIELDS.forEach(field => {
          if (newNode[field] === SENSITIVE_MASK && originalNode[field]) {
            newNode[field] = originalNode[field];
          }
        });

        // Restore internal address fields if internalAddress was masked (SEC-3).
        // The masked internalAddress is the sentinel that re-injects all of them,
        // so a sanitized config saved back can never wipe a node's address.
        if (newNode.internalAddress === SENSITIVE_MASK) {
          if (originalNode.internalAddress) {
            newNode.internalAddress = originalNode.internalAddress;
          } else {
            delete newNode.internalAddress;
          }
          if (originalNode.ip) newNode.ip = originalNode.ip;
          if (originalNode.healthCheckPort) newNode.healthCheckPort = originalNode.healthCheckPort;
        }

        // Recursively restore in children
        if (newNode.children && originalNode.children) {
          restoreInNodes(newNode.children, originalNode.children);
        }
      }
    });
  }

  // Restore sensitive fields in the tree nodes
  if (restored.tree && restored.tree.nodes && originalConfig.tree && originalConfig.tree.nodes) {
    restoreInNodes(restored.tree.nodes, originalConfig.tree.nodes);
  }

  return restored;
}

// Remove the server-derived `monitored` flag from a config tree before persisting
// (it is recomputed on every read and must never be stored).
export function stripMonitoredFlag(config) {
  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      delete n.monitored;
      if (n.children) walk(n.children);
    }
  };
  if (config && config.tree && config.tree.nodes) walk(config.tree.nodes);
}
