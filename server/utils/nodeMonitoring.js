// Shared node-monitoring predicate (server side). Mirrors isNodeMonitored in
// src/utils/nodeUtils.ts so the client and server never disagree about which
// nodes are monitored. Previously this logic was reimplemented inconsistently
// across extractAllNodeIdentifiers, buildNodeIdToIdentifier, and sanitizeConfig
// (some checked disableHealthCheck, some didn't, only one checked the
// 'disabled' check type), which left disabled nodes being checked, recorded to
// history, and exposed via /api/status while the client treated them as
// unmonitored.

// The health-check identifier for a node: its internalAddress, or the legacy
// ip:port pair. Returns null when the node has no monitoring address.
export function getNodeIdentifier(node) {
  if (node.internalAddress) return node.internalAddress;
  if (node.healthCheckPort && node.ip) return `${node.ip}:${node.healthCheckPort}`;
  return null;
}

// Whether a node is actively health-monitored: it has a monitoring address and
// monitoring is not disabled (neither the explicit flag nor the 'disabled'
// check type).
export function isNodeMonitored(node) {
  return !!getNodeIdentifier(node)
    && !node.disableHealthCheck
    && node.healthCheckType !== 'disabled';
}
