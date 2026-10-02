import React, { useState, useEffect } from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import { X, Trash, Plus, WrenchIcon } from 'lucide-react';
import { NodeFormFields } from './NodeFormFields';
import { ConfirmDialog } from './ConfirmDialog';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface NodeEditorProps {
  node: TreeNode;
  onSave: (updatedNode: TreeNode) => Promise<void>;
  onClose: () => void;
  onDelete: () => void;
  onEditChild?: (childNode: TreeNode) => void;
  appearance: AppearanceConfig;
}

export const NodeEditor: React.FC<NodeEditorProps> = ({ node, onSave, onClose, onDelete, onEditChild, appearance = { title: 'Nautilus', accentColor: '#3b82f6' } }) => {
  // Ensure we have a valid appearance object with default values
  const safeAppearance = appearance || { title: 'Nautilus', accentColor: '#3b82f6' };
  
  const [editedNode, setEditedNode] = useState<TreeNode>({ ...node });
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    childIndex: number;
    childTitle: string;
    childCount: number;
  } | null>(null);

  // Reset edited node when the node prop changes (for child editing)
  useEffect(() => {
    setEditedNode({ ...node });
  }, [node]);

  // Helper function to count all descendants of a node
  const countDescendants = (n: TreeNode): number => {
    if (!n.children || n.children.length === 0) return 0;
    return n.children.reduce((count, child) => count + 1 + countDescendants(child), 0);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedNode);
      // Parent component (Canvas) handles closing on success via setEditingNode(null)
    } catch (error) {
      console.error("Failed to save node:", error);
      // Keep modal open so user can retry or fix issues
    } finally {
      setIsSaving(false);
    }
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
    
    // Save the current node with the new child
    try {
      await onSave(updatedNode);
    } catch (error) {
      console.error("Failed to save node after adding child:", error);
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

  const performDeleteChild = (childIndex: number) => {
    setEditedNode(prev => ({
      ...prev,
      children: prev.children?.filter((_, index) => index !== childIndex) || []
    }));
  };

  const handleDeleteChild = (childIndex: number) => {
    const child = editedNode.children?.[childIndex];
    if (!child) return;

    const childCount = countDescendants(child);

    if (childCount > 0) {
      // Show confirmation dialog for children with their own children
      setDeleteConfirmation({
        isOpen: true,
        childIndex,
        childTitle: child.title,
        childCount
      });
    } else {
      // Delete directly if no nested children
      performDeleteChild(childIndex);
    }
  };



  return (
    <>
      <Modal
        isOpen
        onClose={onClose}
        closeOnBackdrop={false}
        closeOnEscape={false}
        ariaLabelledBy="node-editor-title"
        containerClassName="editor-workspace bg-surface rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[86vh] overflow-y-auto animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 id="node-editor-title" className="text-lg font-semibold text-ink">Edit node</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 hover:bg-raised rounded"
          >
            <X size={20} className="text-muted" />
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
            <h3 className="text-md font-semibold text-ink mt-6 mb-2">Child Nodes</h3>
            {editedNode.children && editedNode.children.length > 0 ? (
              <div className="space-y-2">
                {editedNode.children.map((child, index) => (
                  <div key={child.id} className="flex items-center space-x-2 p-2 bg-abyss rounded">
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
                          className="p-1 hover:bg-raised rounded text-muted hover:text-accent transition-colors cursor-pointer"
                          title="Edit child node"
                        >
                          <WrenchIcon size={14} fill="currentColor" />
                        </div>
                      )}
                      <button
                        onClick={() => handleDeleteChild(index)}
                        className="p-1 hover:bg-raised rounded text-negative transition-colors"
                        title="Delete child node"
                      >
                        <Trash size={14} fill="currentColor" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted italic">No child nodes added yet.</p>
            )}
          </div>

          {/* Add Child Button */}
          <button
            onClick={handleAddChild}
            className="w-full flex items-center justify-center space-x-2 p-2 border-2 border-dashed border-line rounded-lg hover:border-muted transition-colors"
          >
            <Plus size={16} className="text-muted" />
            <span className="text-sm text-muted">Add Child Node</span>
          </button>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t bg-abyss">
          <Button variant="ghost" className="text-negative hover:bg-negative/10" onClick={onDelete}>
            Delete Node
          </Button>
          <div className="flex space-x-2">
            <Button variant="ghost" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button variant="primary" accentColor="#65d7e8" onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save</span>
              )}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Child Confirmation Dialog */}
      {deleteConfirmation && (
        <ConfirmDialog
          isOpen={deleteConfirmation.isOpen}
          title="Delete Node with Children"
          message={`"${deleteConfirmation.childTitle}" has ${deleteConfirmation.childCount} child node${deleteConfirmation.childCount > 1 ? 's' : ''}. Deleting this node will also delete all its children. This action cannot be undone.`}
          confirmLabel="Delete All"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => {
            performDeleteChild(deleteConfirmation.childIndex);
            setDeleteConfirmation(null);
          }}
          onCancel={() => setDeleteConfirmation(null)}
        />
      )}
    </>
  );
};
