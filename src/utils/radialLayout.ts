import type { TreeNode } from '../types/config';

export interface RadialNode {
  id: string;
  node: TreeNode | null;
  parentId: string | null;
  depth: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
  /** Only present while the viewport interpolates a transition. */
  opacity?: number;
}
export interface RadialLayout {
  nodes: RadialNode[];
  links: { from: string; to: string }[];
  rings: number[];
  bounds: { left: number; top: number; right: number; bottom: number };
}
export const HUB_ID = '__nautilus_network_hub__';

/** Stable, ordered radial sectors. Status and filters deliberately aren't inputs. */
export function radialLayout(roots: TreeNode[], collapsed: ReadonlySet<string>): RadialLayout {
  const nodes: RadialNode[] = [];
  const links: RadialLayout['links'] = [];
  const demand = (n: TreeNode): number => collapsed.has(n.id) || !n.children?.length
    ? 1 : n.children.reduce((sum, c) => sum + demand(c), 0);
  const visit = (node: TreeNode | null, parentId: string | null, depth: number, start: number, span: number) => {
    const id = node?.id ?? HUB_ID;
    const angle = start + span / 2;
    nodes.push({ id, node, parentId, depth, angle, radius: 0, x: 0, y: 0 });
    if (parentId) links.push({ from: parentId, to: id });
    const children = node ? (collapsed.has(id) ? [] : node.children ?? []) : roots;
    const total = children.reduce((sum, c) => sum + demand(c), 0);
    // Root branches cover the circle; each deeper family occupies a tighter,
    // centered fan. The unused sector edges create visible gaps between families.
    const familySpan = depth === 0 ? span : span * .8;
    let cursor = start + (span - familySpan) / 2;
    children.forEach(child => {
      const sector = familySpan * demand(child) / total;
      visit(child, id, depth + 1, cursor, sector);
      cursor += sector;
    });
  };
  // The home lab is intrinsic, never a configured service or a collapsible node.
  visit(null, null, 0, -Math.PI / 2, Math.PI * 2);
  const maxDepth = Math.max(0, ...nodes.map(n => n.depth));
  // Circumscribed footprints include two-line labels and the branch control.
  // Enforce separation within each ring; radial gaps protect adjacent rings.
  const rings: number[] = [];
  for (let depth = 1; depth <= maxDepth; depth++) {
    const ring = nodes.filter(n => n.depth === depth);
    let radius = (rings[depth - 2] ?? 60) + 240;
    for (let a = 0; a < ring.length; a++) {
      for (let b = a + 1; b < ring.length; b++) {
        const distance = Math.abs(Math.sin((ring[a].angle - ring[b].angle) / 2));
        radius = Math.max(radius, 180 / (2 * Math.max(distance, 0.0001)));
      }
    }
    rings.push(radius);
    ring.forEach(n => { n.radius = radius; n.x = Math.cos(n.angle) * radius; n.y = Math.sin(n.angle) * radius; });
  }
  return { nodes, links, rings, bounds: {
    left: Math.min(0, ...nodes.map(n => n.x)) - 95,
    right: Math.max(0, ...nodes.map(n => n.x)) + 95,
    top: Math.min(0, ...nodes.map(n => n.y)) - 65,
    bottom: Math.max(0, ...nodes.map(n => n.y)) + 110,
  } };
}

export function radialPath(from: Pick<RadialNode, 'x' | 'y' | 'radius' | 'angle'>, to: Pick<RadialNode, 'x' | 'y' | 'radius' | 'angle'>) {
  // The center has no meaningful angle: connect directly toward each child
  // instead of giving every root connection the same outgoing tangent.
  if (from.radius < .001) return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  const mid = (from.radius + to.radius) / 2;
  return `M ${from.x} ${from.y} C ${Math.cos(from.angle) * mid} ${Math.sin(from.angle) * mid}, ${Math.cos(to.angle) * mid} ${Math.sin(to.angle) * mid}, ${to.x} ${to.y}`;
}

/** Local initial overview only; never persists folds or responds to live telemetry. */
export function overviewFolds(roots: TreeNode[], saved: ReadonlySet<string>, width: number, height: number) {
  const complete = radialLayout(roots, saved);
  if (complete.nodes.length <= 40) return new Set<string>();
  const maximum = Math.max(2, ...complete.nodes.map(n => n.depth));
  let automatic = new Set<string>();
  for (let depth = maximum; depth >= 2; depth--) {
    automatic = new Set(complete.nodes.filter(n => n.depth === depth && n.node?.children?.length).map(n => n.id));
    const candidate = radialLayout(roots, new Set([...saved, ...automatic]));
    const b = candidate.bounds;
    const scale = Math.min((width - 80) / (b.right - b.left), (height - 150) / (b.bottom - b.top));
    if (candidate.nodes.length <= 60 && scale >= .5) break;
  }
  return automatic;
}
