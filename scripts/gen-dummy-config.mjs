// One-off generator: builds a big dummy tree to stress-test leaf-fan wrapping.
// Reads the backed-up docker config, replaces only tree.nodes, writes config.dummy.json.
// Run: node scripts/gen-dummy-config.mjs
import { readFileSync, writeFileSync } from 'fs';

const base = JSON.parse(readFileSync('config.docker.backup.json', 'utf8'));

let seq = 0;
const id = () => `dummy_${(seq++).toString().padStart(4, '0')}`;
const TYPES = ['square', 'circular', 'angular'];
const type = (i) => TYPES[i % TYPES.length];

// A leaf node — no children, no address (so the monitor excludes it).
const leaf = (title, i = 0) => ({
  id: id(),
  title,
  subtitle: 'dummy leaf',
  type: type(i),
  icon: 'server',
  disableHealthCheck: true,
  children: [],
});

// A parent whose children are all leaves (a "fan" — wraps when count >= 6).
const fan = (title, count) => ({
  id: id(),
  title: `${title} (${count})`,
  subtitle: `${count} leaf children`,
  type: 'square',
  icon: 'server',
  disableHealthCheck: true,
  children: Array.from({ length: count }, (_, i) => leaf(`${title}·${i + 1}`, i)),
});

// A parent with `count` children where ONE child itself has a child — NOT an
// all-leaf fan, so it must stay a single row even above the threshold.
const mixedFan = (title, count) => {
  const node = fan(title, count);
  node.title = `${title}-MIXED (${count}, no-wrap)`;
  node.subtitle = 'mixed: one child has a child';
  node.children[2].children = [leaf(`${title}·grandchild`, 0)];
  return node;
};

// A tall subtree (single-child chain `depth` deep) to sit beside a wrapped block.
const chain = (title, depth) => {
  const root = leaf(`${title} L1`, 0);
  let cur = root;
  for (let d = 2; d <= depth; d++) {
    const next = leaf(`${title} L${d}`, d);
    cur.children = [next];
    cur = next;
  }
  return root;
};

const tree = [
  {
    id: id(),
    title: 'Fans Root',
    subtitle: 'each child is an all-leaf fan',
    type: 'circular',
    icon: 'server',
    disableHealthCheck: true,
    children: [
      fan('Fan-5-narrow', 5),   // below threshold (6) -> single row
      fan('Fan-6', 6),          // 3 cols x 2 rows
      fan('Fan-8', 8),          // 3 cols x 3 rows
      fan('Fan-12', 12),        // 4 cols x 3 rows
      fan('Fan-16', 16),        // 4 cols x 4 rows
      fan('Fan-20', 20),        // 4 cols (capped) x 5 rows
      mixedFan('Group', 7),     // NOT all leaves -> stays single row
    ],
  },
  {
    id: id(),
    title: 'Collision Root',
    subtitle: 'wrapped block beside a tall chain',
    type: 'circular',
    icon: 'server',
    disableHealthCheck: true,
    children: [
      fan('NeighborFan', 9),    // wrapped 3x3 block...
      {
        id: id(),
        title: 'Tall Branch',
        subtitle: 'deep single-child chain',
        type: 'square',
        icon: 'server',
        disableHealthCheck: true,
        children: [chain('Chain', 5)],
      },
      fan('SecondFan', 10),     // ...another wrapped block on the other side
    ],
  },
  {
    id: id(),
    title: 'Nested Root',
    subtitle: 'fan nested under a normal subtree',
    type: 'circular',
    icon: 'server',
    disableHealthCheck: true,
    children: [
      {
        id: id(),
        title: 'Intermediate',
        subtitle: 'has two children',
        type: 'square',
        icon: 'server',
        disableHealthCheck: true,
        children: [
          fan('DeepFan', 11),
          leaf('lonely sibling', 1),
        ],
      },
    ],
  },
];

base.tree = { nodes: tree };
writeFileSync('config.dummy.json', JSON.stringify(base, null, 2), 'utf8');
console.log(`Wrote config.dummy.json with ${seq} generated nodes across ${tree.length} roots.`);
