import React, { useState } from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import * as LucideIcons from 'lucide-react';
import { IconPicker } from './IconPicker';

interface NodeFormFieldsProps {
  node: TreeNode;
  onChange: (updates: Partial<TreeNode>) => void;
  appearance: AppearanceConfig;
}

export const NodeFormFields: React.FC<NodeFormFieldsProps> = ({ node, onChange, appearance }) => {
  const accentColor = appearance.accentColor || '#3b82f6';
  const [showIconPicker, setShowIconPicker] = useState(false);
  
  // Helper to convert kebab-case to PascalCase
  const kebabToPascal = (kebabCase: string): string => {
    return kebabCase
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  };

  const renderIconPreview = (iconName: string, size: number = 16) => {
    if (!iconName) return <LucideIcons.Server size={size} />;
    
    try {
      const pascalCaseName = kebabToPascal(iconName);
      const IconComponent = (LucideIcons as any)[pascalCaseName];
      if (IconComponent) {
        return <IconComponent size={size} />;
      }
    } catch (error) {
      // Ignore error
    }
    return <LucideIcons.HelpCircle size={size} className="text-gray-400" />;
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={node.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
          <input
            type="text"
            value={node.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
          />
        </div>

        {/* Health Check Type */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Health Check Type</label>
          <select
            value={node.healthCheckType || (node.disableHealthCheck ? 'disabled' : 'http')}
            onChange={(e) => {
              const type = e.target.value as 'http' | 'minecraft' | 'disabled';
              onChange({ 
                healthCheckType: type,
                disableHealthCheck: type === 'disabled' // Keep legacy field in sync
              });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
          >
            <option value="http">Regular Health Check (HTTP/TCP)</option>
            <option value="minecraft">Minecraft Server</option>
            <option value="disabled">Disable Health Checking</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Select how the status of this node should be monitored.
          </p>
        </div>

        {/* Internal Address */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Internal Address
          </label>
          <input
            type="text"
            value={node.internalAddress || (node.ip ? (node.healthCheckPort ? `${node.ip}:${node.healthCheckPort}` : node.ip) : '')}
            onChange={(e) => {
              const val = e.target.value;
              onChange({ 
                internalAddress: val || undefined,
                // Clear legacy fields to complete migration for this node
                ip: undefined,
                healthCheckPort: undefined
              });
            }}
            placeholder="192.168.1.100:8080 or http://internal-service:3000"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
          />
          <p className="text-xs text-gray-500 mt-1">
            Address used by the server to check status. Format: <code>ip:port</code> or <code>http://ip:port</code>
          </p>
        </div>

        {/* Shape Selection */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Shape</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'square', label: 'Square', subtitle: 'Rectangle' },
              { value: 'circular', label: 'Circular', subtitle: 'Pill shape' },
              { value: 'angular', label: 'Angular', subtitle: 'Diamond' }
            ].map((type) => (
              <div 
                key={type.value}
                className={`flex flex-col items-center p-3 rounded-lg cursor-pointer transition-all ${
                  (node.type === type.value || (!node.type && type.value === 'square'))
                    ? `border-2 shadow-sm` 
                    : 'border border-gray-300 hover:bg-gray-50'
                }`}
                style={{
                  borderColor: (node.type === type.value || (!node.type && type.value === 'square')) ? accentColor : undefined,
                  backgroundColor: (node.type === type.value || (!node.type && type.value === 'square')) ? `${accentColor}08` : undefined
                }}
                onClick={() => onChange({ type: type.value as any })}
              >
                <div className="text-sm font-medium text-gray-900">{type.label}</div>
                <div className="text-xs text-gray-500">{type.subtitle}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Icon Selection */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Icon</label>
          
          <div className="flex items-center p-3 border border-gray-300 rounded-md bg-white">
            {/* Icon Preview */}
            <div className="flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg border border-gray-200 mr-4">
              {node.icon ? renderIconPreview(node.icon, 24) : <LucideIcons.HelpCircle size={24} className="text-gray-400" />}
            </div>
            
            {/* Icon Details */}
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">
                {node.icon ? kebabToPascal(node.icon) : 'No Icon Selected'}
              </div>
              <div className="text-xs text-gray-500">
                {node.icon || 'Select an icon to display on the node'}
              </div>
            </div>
            
            {/* Change Button */}
            <button
              type="button"
              onClick={() => setShowIconPicker(true)}
              className="px-4 py-2 text-sm font-medium rounded-md transition-colors"
              style={{ 
                color: accentColor, 
                backgroundColor: `${accentColor}10` 
              }}
            >
              {node.icon ? 'Change' : 'Select'}
            </button>
          </div>
        </div>

        {/* Icon Picker Modal */}
        {showIconPicker && (
          <IconPicker
            currentIcon={node.icon || ''}
            onSelect={(iconName) => onChange({ icon: iconName })}
            onClose={() => setShowIconPicker(false)}
          />
        )}

        {/* Interaction Settings */}
        {node.healthCheckType !== 'minecraft' && (
          <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Interaction</label>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id={`isInteractable-${node.id}`}
                  checked={node.isInteractable !== false} // Default to true
                  onChange={(e) => onChange({ isInteractable: e.target.checked })}
                  className="h-4 w-4 border-gray-300 rounded focus:ring-2"
                  style={{ 
                    color: accentColor, 
                    accentColor: accentColor,
                    '--tw-ring-color': accentColor 
                  } as React.CSSProperties}
                />
                <label htmlFor={`isInteractable-${node.id}`} className="ml-2 text-sm text-gray-600">
                  Interactable
                </label>
              </div>
            </div>

            {node.isInteractable !== false && (
              <div className="space-y-4 pl-4 border-l-2 border-gray-100">
                {/* External Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access URL
                  </label>
                  <input
                    type="text"
                    value={node.externalAddress || node.url || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      onChange({ 
                        externalAddress: val || undefined,
                        // Clear legacy field
                        url: undefined
                      });
                    }}
                    placeholder="https://myapp.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                    style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
                  />
                  <p className="text-xs text-gray-500 mt-1">Public address for opening the service in browser.</p>
                </div>

                {/* Disable Embedded */}
                <div className="flex items-start space-x-3">
                  <div className="flex items-center h-5">
                    <input
                      type="checkbox"
                      id={`disableEmbedded-${node.id}`}
                      checked={node.disableEmbedded || false}
                      onChange={(e) => onChange({ disableEmbedded: e.target.checked })}
                      className="h-4 w-4 border-gray-300 rounded focus:ring-2"
                      style={{ 
                        color: accentColor, 
                        accentColor: accentColor,
                        '--tw-ring-color': accentColor 
                      } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <label htmlFor={`disableEmbedded-${node.id}`} className="font-medium text-gray-700 text-sm">
                      Disable Embedded Viewer
                    </label>
                    <p className="text-xs text-gray-500">
                      Force this node to open in a new tab instead of the embedded iframe overlay.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
