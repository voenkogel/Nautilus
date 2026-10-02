import type { TreeNode } from '../types/config';

/** Splice children into their parent's position, retaining order and subtrees. */
export function deleteTreeNode(nodes: TreeNode[], id: string, keepChildren = false): TreeNode[] {
  return nodes.flatMap(node => node.id === id
    ? keepChildren ? node.children ?? [] : []
    : [{ ...node, ...(node.children ? { children: deleteTreeNode(node.children, id, keepChildren) } : {}) }]);
}
