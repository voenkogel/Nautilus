import { deleteTreeNode } from '../src/utils/deleteTreeNode.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { radialLayout, radialPath, overviewFolds, HUB_ID } from '../src/utils/radialLayout.ts';
import { summarize, matchesNode } from '../src/utils/networkSummary.ts';
import { networkBranches } from '../src/utils/configUtils.ts';
import { restoreSensitiveFields } from '../server/services/configSanitize.js';
import type { TreeNode, NodeStatus } from '../src/types/config.ts';

const leaf = (id: string, children: TreeNode[] = []): TreeNode => ({ id, title: id, subtitle: '', monitored: true, children });
function check(nodes: TreeNode[], collapsed = new Set<string>()) {
  const result = radialLayout(nodes, collapsed);
  assert.deepEqual(result, radialLayout(nodes, collapsed));
  const byId = new Map(result.nodes.map(n => [n.id, n]));
  for (const { from, to } of result.links) {
    assert.ok(byId.get(from));
    assert.equal(byId.get(to)!.depth, byId.get(from)!.depth + 1);
    assert.ok(byId.get(to)!.radius > byId.get(from)!.radius);
  }
  result.nodes.forEach((a, i) => {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y));
    result.nodes.slice(i + 1).forEach(b => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 179.99, `${a.id} and ${b.id} overlap`));
  });
  return result;
}
test('empty, single root and multiple roots have correct centers', () => {
  assert.equal(check([]).nodes.length, 1);
  assert.equal(check([leaf('root')]).nodes[0].id, HUB_ID);
  assert.equal(check([leaf('a'), leaf('b')]).nodes[0].id, HUB_ID);
});
test('broad fans, deep chains and long labels remain ordered and separated', () => {
  check([leaf('root', Array.from({ length: 40 }, (_, i) => leaf(`A very long service title ${i}`)))]);
  let chain = leaf('end');
  for (let i = 0; i < 12; i++) chain = leaf(`depth-${i}`, [chain]);
  check([chain]);
});
test('collapse removes descendants without modifying configuration', () => {
  const roots = [leaf('root', [leaf('branch', [leaf('child')]), leaf('sibling')])];
  const original = structuredClone(roots);
  const result = check(roots, new Set(['branch']));
  assert.equal(result.nodes.length, 4);
  assert.deepEqual(roots, original);
});
test('126-node sample remains collision-free expanded and folded', () => {
  const roots = JSON.parse(readFileSync(new URL('../config.dummy.json', import.meta.url), 'utf8')).tree.nodes;
  const result = check(roots);
  assert.equal(result.nodes.length, 127);
  check(roots, new Set(result.nodes.filter(n => n.depth === 2).map(n => n.id)));
  assert.ok(check(roots, overviewFolds(roots, new Set(), 1440, 760)).nodes.length <= 60);
});
test('health summaries include hidden descendants and never count unmonitored nodes', () => {
  const children = [leaf('offline'), { ...leaf('plex'), healthCheckType: 'plex' as const }, { ...leaf('disabled'), monitored: false }, leaf('backup'), leaf('unknown')];
  const roots = [{ ...leaf('root', children), collapsed: true }];
  const statuses: Record<string, NodeStatus> = {
    root: { status: 'online', lastChecked: '' }, offline: { status: 'offline', lastChecked: '' },
    plex: { status: 'online', lastChecked: '', streams: 3 }, disabled: { status: 'offline', lastChecked: '' }, backup: { status: 'backup', lastChecked: '' },
  };
  assert.deepEqual(summarize(roots, statuses), { total: 6, monitored: 5, online: 2, offline: 1, checking: 0, backup: 1, unknown: 1, streams: 3, players: 0 });
  assert.equal(matchesNode(children[1], statuses, 'activity', 'PLEX'), true);
  assert.equal(matchesNode(children[2], statuses, 'offline', ''), false);
  assert.equal(matchesNode({ ...leaf('masked'), internalAddress: '********' }, {}, null, '********'), false);
});


test('siblings form compact fans with larger gaps between families', () => {
  const roots = [leaf('root', Array.from({ length: 4 }, (_, family) => leaf(`family-${family}`, Array.from({ length: 3 }, (_, i) => leaf(`child-${family}-${i}`)))))];
  const result = check(roots);
  const children = result.nodes.filter(n => n.depth === 3);
  const siblingGap = children[1].angle - children[0].angle;
  const familyGap = children[3].angle - children[2].angle;
  assert.ok(familyGap > siblingGap * 1.7);
  const parent = result.nodes.find(n => n.id === 'family-0')!;
  assert.ok(Math.abs(children[1].angle - parent.angle) < 0.00001);
});


test('center connections radiate directly to children in every direction', () => {
  const result = radialLayout([leaf('root', [leaf('north'), leaf('east'), leaf('south'), leaf('west')])], new Set());
  const root = result.nodes[0];
  for (const child of result.nodes.slice(1)) {
    assert.equal(radialPath(root, child), `M 0 0 L ${child.x} ${child.y}`);
  }
});

test('intrinsic root cannot collapse; legacy wrapper migration preserves branches and credentials', () => {
  const child = { ...leaf('service'), internalAddress: 'private.test', plexToken: 'test-token' };
  const legacy = { id: 'old-home', title: 'Homelab', subtitle: '', ip: 'unused', collapsed: true, children: [child] };
  const branches = networkBranches([legacy]);
  assert.deepEqual(branches, [child]);
  assert.deepEqual(networkBranches([child]), [child]);
  assert.deepEqual(networkBranches([{ ...legacy, internalAddress: 'real-service' }]), [{ ...legacy, internalAddress: 'real-service' }]);
  const layout = radialLayout(branches, new Set([HUB_ID, legacy.id]));
  assert.equal(layout.nodes.filter(n => n.depth === 0).length, 1);
  assert.equal(layout.nodes.length, 2);
  assert.equal(layout.nodes[0].node, null);
  const restored = restoreSensitiveFields({ tree: { nodes: [{ ...child, internalAddress: '********', plexToken: '********' }] } }, { tree: { nodes: [legacy] } });
  assert.equal(restored.tree.nodes[0].internalAddress, 'private.test');
  assert.equal(restored.tree.nodes[0].plexToken, 'test-token');
  assert.equal(legacy.children[0].internalAddress, 'private.test');
});

test('deleting a branch can promote children in place without changing subtrees', () => {
  const branch = leaf('branch', [leaf('a', [leaf('grandchild')]), leaf('b')]);
  const nodes = [leaf('parent', [leaf('before'), branch, leaf('after')])];
  const original = structuredClone(nodes);
  const promoted = deleteTreeNode(nodes, 'branch', true);
  assert.deepEqual(promoted[0].children?.map(n => n.id), ['before', 'a', 'b', 'after']);
  assert.equal(promoted[0].children?.[1].children?.[0].id, 'grandchild');
  assert.deepEqual(deleteTreeNode([branch], 'branch', true), branch.children);
  assert.deepEqual(deleteTreeNode(nodes, 'branch', false)[0].children?.map(n => n.id), ['before', 'after']);
  assert.deepEqual(nodes, original);
});
