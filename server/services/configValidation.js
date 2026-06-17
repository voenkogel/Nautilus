// Generic config helpers: deep merge (config + defaults) and structural validation.

// Deep-merge `source` over `target`. Arrays (notably tree.nodes) are REPLACED
// wholesale, never merged element-wise — index-wise array merging would splice
// fields from unrelated nodes together when the tree is reordered. The client
// always POSTs the complete node tree, so a replace is the correct contract;
// validateConfig (below) enforces unique ids so a malformed tree can't corrupt
// the id-keyed status/history/secret-restore logic.
export function deepMerge(target, source) {
  const result = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
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

export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    return { valid: false, error: 'Configuration must be an object' };
  }

  // Check for required top-level properties
  const requiredFields = ['appearance', 'tree'];
  for (const field of requiredFields) {
    if (!config[field] || typeof config[field] !== 'object') {
      return { valid: false, error: `Missing or invalid ${field} configuration` };
    }
  }

  // Validate tree structure
  if (!Array.isArray(config.tree.nodes)) {
    return { valid: false, error: 'tree.nodes must be an array' };
  }

  // Tracks every node id seen so far so duplicates (which would collide in the
  // id-keyed status/history maps and the secret-restore matcher) are rejected.
  const seenIds = new Set();

  // Recursive function to validate nodes and their children
  function validateNode(node, path = '') {
    if (!node.id || typeof node.id !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} missing valid id` };
    }
    if (seenIds.has(node.id)) {
      return { valid: false, error: `Duplicate node id "${node.id}" — node ids must be unique` };
    }
    seenIds.add(node.id);
    if (!node.title || typeof node.title !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} missing valid title` };
    }
    if (node.ip && typeof node.ip !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} ip must be a string` };
    }
    if (node.url && typeof node.url !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} url must be a string` };
    }
    if (node.subtitle && typeof node.subtitle !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} subtitle must be a string` };
    }
    if (node.icon && typeof node.icon !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} icon must be a string` };
    }
    if (node.type && typeof node.type !== 'string') {
      return { valid: false, error: `Node at ${path || 'root'} type must be a string` };
    }
    if (node.disableEmbedded && typeof node.disableEmbedded !== 'boolean') {
      return { valid: false, error: `Node at ${path || 'root'} disableEmbedded must be a boolean` };
    }

    // Length and range caps to reject oversized/abusive payloads.
    const MAX_STR = 2048;
    const stringFields = ['id', 'title', 'subtitle', 'icon', 'type', 'ip', 'url',
      'internalAddress', 'externalAddress', 'healthCheckType', 'plexToken', 'apiKeys'];
    for (const f of stringFields) {
      if (typeof node[f] === 'string' && node[f].length > MAX_STR) {
        return { valid: false, error: `Node at ${path || 'root'} ${f} exceeds ${MAX_STR} characters` };
      }
    }
    if (node.healthCheckPort != null) {
      const p = Number(node.healthCheckPort);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        return { valid: false, error: `Node at ${path || 'root'} healthCheckPort must be between 1 and 65535` };
      }
    }
    if (node.healthCheckInterval != null) {
      const iv = Number(node.healthCheckInterval);
      // 0 means "inherit the global interval"; any positive override must be at
      // least the 5s minimum loop interval (matches the client-side validation).
      if (!Number.isFinite(iv) || iv < 0 || iv > 86_400_000 || (iv > 0 && iv < 5000)) {
        return { valid: false, error: `Node at ${path || 'root'} healthCheckInterval must be 0 or between 5000 and 86400000 ms` };
      }
    }

    // Validate children if they exist
    if (node.children) {
      if (!Array.isArray(node.children)) {
        return { valid: false, error: `Node at ${path || 'root'} children must be an array` };
      }

      for (let i = 0; i < node.children.length; i++) {
        const childPath = path ? `${path}.children[${i}]` : `children[${i}]`;
        const childValidation = validateNode(node.children[i], childPath);
        if (!childValidation.valid) {
          return childValidation;
        }
      }
    }

    return { valid: true };
  }

  // Validate each top-level node
  for (let i = 0; i < config.tree.nodes.length; i++) {
    const validation = validateNode(config.tree.nodes[i], `nodes[${i}]`);
    if (!validation.valid) {
      return validation;
    }
  }

  return { valid: true };
}
