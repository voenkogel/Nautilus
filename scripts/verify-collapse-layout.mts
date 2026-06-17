// Verification for the "collapsed pill overlaps siblings" fix.
// Reproduces the screenshot scenario (Fan-5-narrow expanded beside a collapsed
// Fan-6) and asserts no rendered rectangle overlaps another. Also re-runs the
// layout with the fix neutralized to confirm the bug was real.
//
// Run: node scripts/verify-collapse-layout.mts
import { calculateTreeLayout, NODE_WIDTH, NODE_HEIGHT, VERTICAL_SPACING } from '../src/utils/layoutUtils.ts';
import { getVisibleTree } from '../src/utils/nodeUtils.ts';
import type { TreeNode } from '../src/types/config.ts';

const PILL_HEIGHT = 48; // matches the expand-pill height in Canvas.tsx

let seq = 0;
const id = () => `n_${(seq++).toString().padStart(3, '0')}`;
const leaf = (title: string): TreeNode => ({ id: id(), title, subtitle: 'dummy leaf', children: [] });
const fan = (title: string, count: number): TreeNode => ({
  id: id(),
  title: `${title} (${count})`,
  subtitle: `${count} leaf children`,
  children: Array.from({ length: count }, (_, i) => leaf(`${title}·${i + 1}`)),
});

// Root with the two sibling fans from the screenshot.
const fan5 = fan('Fan-5-narrow', 5);
const fan6 = fan('Fan-6', 6);
const root: TreeNode = { id: id(), title: 'Fans Root', subtitle: '', children: [fan5, fan6] };

interface Rect { x: number; y: number; w: number; h: number; label: string; }

// IDs that render a pill = collapsed nodes that actually have children.
// This mirrors Canvas (collapse state + original children), independent of the
// layout's internal hasHiddenChildren flag, so it holds for the pre-fix case too.
const pillBearers = (tree: TreeNode[], collapsedIds: Set<string>): Set<string> => {
  const ids = new Set<string>();
  const walk = (ns: TreeNode[]) => ns.forEach(n => {
    if (collapsedIds.has(n.id) && n.children && n.children.length > 0) ids.add(n.id);
    if (n.children) walk(n.children);
  });
  walk(tree);
  return ids;
};

const rectsFor = (tree: TreeNode[], collapsedIds: Set<string>, simulateOld: boolean): Rect[] => {
  const bearers = pillBearers(tree, collapsedIds);
  const visible = getVisibleTree(tree, collapsedIds);
  // Simulate pre-fix behavior: drop the flag the layout uses to reserve pill space.
  if (simulateOld) {
    const strip = (ns: TreeNode[]) => ns.forEach(n => { delete n.hasHiddenChildren; if (n.children) strip(n.children); });
    strip(visible);
  }
  const { nodes } = calculateTreeLayout(visible);
  const rects: Rect[] = [];
  for (const n of nodes) {
    rects.push({ x: n.x, y: n.y, w: n.width, h: n.height, label: n.title });
    if (bearers.has(n.id)) {
      // Pill: NODE_WIDTH wide, centered on the node, one row (VERTICAL_SPACING) below it.
      rects.push({ x: n.x, y: n.y + NODE_HEIGHT + VERTICAL_SPACING, w: NODE_WIDTH, h: PILL_HEIGHT, label: `[pill] ${n.title}` });
    }
  }
  return rects;
};

const overlaps = (a: Rect, b: Rect): boolean => {
  const EPS = 0.5; // touching edges are fine; require real overlap
  return a.x < b.x + b.w - EPS && a.x + a.w > b.x + EPS &&
         a.y < b.y + b.h - EPS && a.y + a.h > b.y + EPS;
};

const findOverlaps = (rects: Rect[]): [Rect, Rect][] => {
  const hits: [Rect, Rect][] = [];
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++)
      if (overlaps(rects[i], rects[j])) hits.push([rects[i], rects[j]]);
  return hits;
};

const collapsed = new Set<string>([fan6.id]); // Fan-6 collapsed, as in the screenshot

let failed = false;
const report = (title: string, hits: [Rect, Rect][], expectOverlap: boolean) => {
  const ok = expectOverlap ? hits.length > 0 : hits.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${title}  (${hits.length} overlapping pair(s))`);
  for (const [a, b] of hits.slice(0, 5)) {
    console.log(`        "${a.label}" @(${a.x.toFixed(0)},${a.y.toFixed(0)})  ×  "${b.label}" @(${b.x.toFixed(0)},${b.y.toFixed(0)})`);
  }
  if (!ok) failed = true;
};

// 1) Old behavior (fix neutralized) should reproduce the overlap bug.
report('pre-fix (expect overlap)', findOverlaps(rectsFor([root], collapsed, true)), true);
// 2) Fixed behavior: no overlaps anywhere.
report('fixed: Fan-6 collapsed', findOverlaps(rectsFor([root], collapsed, false)), false);
// 3) Both fans collapsed: still no overlaps.
report('fixed: both collapsed', findOverlaps(rectsFor([root], new Set([fan5.id, fan6.id]), false)), false);
// 4) Nothing collapsed: full tree, no overlaps (sanity).
report('fixed: none collapsed', findOverlaps(rectsFor([root], new Set(), false)), false);

console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
