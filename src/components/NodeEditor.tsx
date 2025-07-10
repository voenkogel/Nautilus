import React, { useState, useEffect } from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import { X, Trash, Plus, WrenchIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

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
  const [iconPreview, setIconPreview] = useState<string | null>(null);

  // Update icon preview when icon changes
  useEffect(() => {
    if (editedNode.icon) {
      setIconPreview(editedNode.icon);
    } else {
      setIconPreview(null);
    }
  }, [editedNode.icon]);

  // Reset edited node when the node prop changes (for child editing)
  useEffect(() => {
    setEditedNode({ ...node });
  }, [node]);

  const handleSave = () => {
    onSave(editedNode);
    onClose();
  };

  const handleAddChild = () => {
    const newChild: TreeNode = {
      id: `node_${Date.now()}`,
      title: 'New Node',
      subtitle: 'New subtitle',
      type: 'square',
      icon: 'server',
      children: []
    };
    
    setEditedNode(prev => ({
      ...prev,
      children: [...(prev.children || []), newChild]
    }));
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

  const renderIconPreview = () => {
    if (!iconPreview) return null;
    
    try {
      // Get the icon component dynamically
      const IconComponent = (LucideIcons as any)[iconPreview];
      if (IconComponent) {
        return (
          <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded border">
            <IconComponent size={20} style={{ color: safeAppearance.accentColor }} />
          </div>
        );
      }
    } catch (error) {
      // Icon doesn't exist
    }
    
    return (
      <div className="flex items-center justify-center w-8 h-8 bg-gray-100 rounded border text-xs text-gray-400">
        ?
      </div>
    );
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
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={editedNode.title}
              onChange={(e) => setEditedNode(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
            <input
              type="text"
              value={editedNode.subtitle}
              onChange={(e) => setEditedNode(prev => ({ ...prev, subtitle: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Shape Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shape</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'square', label: 'Square', subtitle: 'Rectangle' },
                { value: 'circular', label: 'Circular', subtitle: 'Pill shape' },
                { value: 'angular', label: 'Angular', subtitle: 'Diamond' }
              ].map((type) => (
                <label key={type.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="nodeType"
                    value={type.value}
                    checked={
                      editedNode.type === type.value || 
                      // Handle legacy/invalid types by defaulting to square
                      (!editedNode.type && type.value === 'square') ||
                      ((editedNode.type as any) === 'hardware' && type.value === 'square') ||
                      ((editedNode.type as any) === 'software' && type.value === 'circular')
                    }
                    onChange={(e) => setEditedNode(prev => ({ ...prev, type: e.target.value as any }))}
                    className="sr-only"
                  />
                  <div className={`
                    p-3 border-2 rounded-lg text-center transition-colors
                    ${(editedNode.type === type.value || 
                       (!editedNode.type && type.value === 'square') ||
                       ((editedNode.type as any) === 'hardware' && type.value === 'square') ||
                       ((editedNode.type as any) === 'software' && type.value === 'circular'))
                      ? `border-2 bg-opacity-10 text-opacity-90` 
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }
                  `}
                  style={{
                    borderColor: (editedNode.type === type.value || 
                       (!editedNode.type && type.value === 'square') ||
                       ((editedNode.type as any) === 'hardware' && type.value === 'square') ||
                       ((editedNode.type as any) === 'software' && type.value === 'circular'))
                      ? (safeAppearance.accentColor || '#3b82f6') : undefined,
                    backgroundColor: (editedNode.type === type.value || 
                       (!editedNode.type && type.value === 'square') ||
                       ((editedNode.type as any) === 'hardware' && type.value === 'square') ||
                       ((editedNode.type as any) === 'software' && type.value === 'circular'))
                      ? `${safeAppearance.accentColor || '#3b82f6'}15` : undefined,
                    color: (editedNode.type === type.value || 
                       (!editedNode.type && type.value === 'square') ||
                       ((editedNode.type as any) === 'hardware' && type.value === 'square') ||
                       ((editedNode.type as any) === 'software' && type.value === 'circular'))
                      ? (safeAppearance.accentColor || '#3b82f6') : undefined
                  }}>
                    <div className="font-medium text-sm">{type.label}</div>
                    <div className="text-xs mt-1 opacity-75">{type.subtitle}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Icon */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Icon</label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={editedNode.icon || ''}
                onChange={(e) => setEditedNode(prev => ({ ...prev, icon: e.target.value || undefined }))}
                placeholder="Enter Lucide icon name"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {renderIconPreview()}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Browse icons at <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">lucide.dev</a>
            </p>
          </div>

          {/* IP Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IP Address (optional)</label>
            <input
              type="text"
              value={editedNode.ip || ''}
              onChange={(e) => setEditedNode(prev => ({ ...prev, ip: e.target.value || undefined }))}
              placeholder="192.168.1.100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL (optional)</label>
            <input
              type="text"
              value={editedNode.url || ''}
              onChange={(e) => setEditedNode(prev => ({ ...prev, url: e.target.value || undefined }))}
              placeholder="example.com or https://example.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Has Web GUI Toggle */}
          <div className="flex items-center justify-between">
            <label htmlFor="hasWebGui" className="text-sm font-medium text-gray-700">Has web GUI</label>
            <button
              id="hasWebGui"
              onClick={() => setEditedNode(prev => ({ ...prev, hasWebGui: !(prev.hasWebGui === false) ? false : true }))}
              className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${(editedNode.hasWebGui === false) ? 'bg-gray-200' : 'bg-blue-600'}`}>
              <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${(editedNode.hasWebGui === false) ? 'translate-x-1' : 'translate-x-6'}`} />
            </button>
          </div>

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
