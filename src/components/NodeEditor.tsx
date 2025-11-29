import React, { useState, useEffect } from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import { X, Trash, Plus, WrenchIcon } from 'lucide-react';
import { NodeFormFields } from './NodeFormFields';

interface NodeEditorProps {
  node: TreeNode;
  onSave: (updatedNode: TreeNode) => void;
  onClose: () => void;
  onDelete: () => void;
  onEditChild?: (childNode: TreeNode) => void;
  appearance: AppearanceConfig;
}

export const NodeEditor: React.FC<NodeEditorProps> = ({ node, onSave, onClose, onDelete, onEditChild, appearance = { title: 'Nautilus', accentColor: '#3b82f6' } }) => {
  // Ensure we have a valid appearance object with default values
  const safeAppearance = appearance || { title: 'Nautilus', accentColor: '#3b82f6' };
  
  const [editedNode, setEditedNode] = useState<TreeNode>({ ...node });

  // Reset edited node when the node prop changes (for child editing)
  useEffect(() => {
    setEditedNode({ ...node });
  }, [node]);

  const handleSave = () => {
    onSave(editedNode);
    onClose();
  };

  const handleAddChild = async () => {
    const newChild: TreeNode = {
      id: `node_${Date.now()}`,
      title: 'New Node',
      subtitle: 'New subtitle',
      type: 'square',
      icon: 'server',
      children: []
    };
    
    const updatedNode = {
      ...editedNode,
      children: [...(editedNode.children || []), newChild]
    };
    
    setEditedNode(updatedNode);
    
    // Save the current node with the new child and then immediately edit the new child
    try {
      await onSave(updatedNode);
      if (onEditChild) {
        onEditChild(newChild);
      }
    } catch (error) {
      console.error("Failed to save node after adding child:", error);
      // Still try to edit the child even if save failed
      if (onEditChild && window.confirm("Failed to save changes. Continue to edit new child node?")) {
        onEditChild(newChild);
      }
    }
  };

  // const handleUpdateChild = (childIndex: number, updatedChild: TreeNode) => {
  //   setEditedNode(prev => ({
  //     ...prev,
  //     children: prev.children?.map((child, index) => 
  //       index === childIndex ? updatedChild : child
  //     ) || []
  //   }));
  // };

  const handleDeleteChild = (childIndex: number) => {
    setEditedNode(prev => ({
      ...prev,
      children: prev.children?.filter((_, index) => index !== childIndex) || []
    }));
  };



  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-96 max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Edit Node</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} className="text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <NodeFormFields 
            node={editedNode} 
            onChange={(updates) => setEditedNode(prev => ({ ...prev, ...updates }))}
            appearance={safeAppearance}
          />

          {/* Children Nodes */}
          <div>
            <h3 className="text-md font-semibold text-gray-800 mt-6 mb-2">Child Nodes</h3>
            {editedNode.children && editedNode.children.length > 0 ? (
              <div className="space-y-2">
                {editedNode.children.map((child, index) => (
                  <div key={child.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                    <span className="flex-1 text-sm">{child.title}</span>
                    <div className="flex items-center space-x-1">
                      {onEditChild && (
                        <div
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              // Save current node first
                              await onSave(editedNode);
                              // Then edit the child
                              onEditChild(child);
                            } catch (error) {
                              console.error("Failed to save node before editing child:", error);
                              // Ask if user wants to continue anyway
                              if (window.confirm("Failed to save changes. Continue to edit child node? (Current changes will be lost)")) {
                                onEditChild(child);
                              }
                            }
                          }}
                          className="p-1 hover:bg-gray-200 rounded text-gray-600 hover:text-blue-600 transition-colors cursor-pointer"
                          title="Edit child node"
                        >
                          <WrenchIcon size={14} fill="currentColor" />
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteChild(index)}
                        className="p-1 hover:bg-gray-200 rounded text-red-500 transition-colors"
                        title="Delete child node"
                      >
                        <Trash size={14} fill="currentColor" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No child nodes added yet.</p>
            )}
          </div>

          {/* Add Child Button */}
          <button
            onClick={handleAddChild}
            className="w-full flex items-center justify-center space-x-2 p-2 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
          >
            <Plus size={16} className="text-gray-500" />
            <span className="text-sm text-gray-500">Add Child Node</span>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-gray-50">
          <button
            onClick={onDelete}
            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            Delete Node
          </button>
          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-white rounded-md transition-colors"
              style={{ backgroundColor: safeAppearance.accentColor }}
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
