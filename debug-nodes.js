// Quick debug test for node extraction
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load config
const configPath = join(__dirname, 'config.json');
const configContent = readFileSync(configPath, 'utf8');
const config = JSON.parse(configContent);

console.log('🔍 Debug: Config loaded');
console.log('Tree nodes length:', config.tree.nodes.length);

// Normalize function (same as server)
function normalizeNodeIdentifier(identifier) {
  if (!identifier) return '';
  let normalized = identifier.replace(/^https?:\/\//, '');
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

// Extract function (same as server)
function extractAllNodeIdentifiers(nodes = config.tree.nodes) {
  const identifiers = [];
  
  function traverse(nodeList) {
    for (const node of nodeList) {
      const identifier = node.ip || node.url;
      if (identifier) {
        const normalizedIdentifier = normalizeNodeIdentifier(identifier);
        identifiers.push(normalizedIdentifier);
        console.log(`Found node: ${node.title} -> ${identifier} -> ${normalizedIdentifier}`);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(nodes);
  return identifiers;
}

const identifiers = extractAllNodeIdentifiers();
console.log('\n📋 Summary:');
console.log('Total identifiers found:', identifiers.length);
console.log('Identifiers:', identifiers);
