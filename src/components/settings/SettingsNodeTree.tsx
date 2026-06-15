import React from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2 } from 'lucide-react';
import type { TreeNode, AppearanceConfig } from '../../types/config';
import { NodeFormFields } from '../NodeFormFields';

interface SettingsNodeTreeProps {
  node: TreeNode;
  level?: number;
  collapsedNodes: Set<string>;
  isLoggedIn: boolean;
  appearance: AppearanceConfig;
  onToggleCollapse: (nodeId: string) => void;
  onAddChild: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onUpdateNode: (nodeId: string, updates: Partial<TreeNode>) => void;
}

/** Recursive node-tree row used in the Settings "Node Settings" tab. */
export const SettingsNodeTree: React.FC<SettingsNodeTreeProps> = ({
  node,
  level = 0,
  collapsedNodes,
  isLoggedIn,
  appearance,
  onToggleCollapse,
  onAddChild,
  onDelete,
  onUpdateNode,
}) => {
  const isCollapsed = collapsedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="relative">
      <div
        className="border border-gray-200 rounded-lg bg-white shadow-sm mb-2"
        style={{
          width: level > 0 ? `calc(100% - ${level * 24}px)` : '100%',
          marginLeft: level > 0 ? `${level * 24}px` : '0'
        }}
      >
        <div className="p-3">
          <div
            className={`flex items-center justify-between cursor-pointer ${isCollapsed ? '' : 'mb-2'}`}
            onClick={() => onToggleCollapse(node.id)}
          >
            <div className="flex items-center space-x-2">
              {/* Always show expand/collapse button for better tree navigation */}
              <button
                className="p-1 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                aria-label={isCollapsed ? "Expand node details" : "Collapse node details"}
                aria-expanded={!isCollapsed}
                title={isCollapsed ? "Expand node details" : "Collapse node details"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleCollapse(node.id);
                }}
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              </button>
              <h4 className="font-medium text-gray-800">
                {node.title}
              </h4>
            </div>
            <div className="flex space-x-1" onClick={(e) => e.stopPropagation()}>
              {isLoggedIn && (
                <>
                  <button
                    onClick={() => onAddChild(node.id)}
                    className="p-1 text-green-600 hover:bg-green-100 rounded transition-colors"
                    aria-label="Add child node"
                    title="Add child node"
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(node.id)}
                    className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                    aria-label="Delete node"
                    title="Delete node"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Show detailed form only when expanded */}
          {!isCollapsed && (
            <div className="mt-4">
              <NodeFormFields
                node={node}
                onChange={(updates) => onUpdateNode(node.id, updates)}
                appearance={appearance}
              />
            </div>
          )}
        </div>
      </div>

      {/* Render children with tighter spacing */}
      {hasChildren && (
        <div className="space-y-1">
          {node.children!.map((child) => (
            <SettingsNodeTree
              key={child.id}
              node={child}
              level={level + 1}
              collapsedNodes={collapsedNodes}
              isLoggedIn={isLoggedIn}
              appearance={appearance}
              onToggleCollapse={onToggleCollapse}
              onAddChild={onAddChild}
              onDelete={onDelete}
              onUpdateNode={onUpdateNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SettingsNodeTree;
