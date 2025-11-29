import React from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import * as LucideIcons from 'lucide-react';

interface NodeFormFieldsProps {
  node: TreeNode;
  onChange: (updates: Partial<TreeNode>) => void;
  appearance: AppearanceConfig;
}

export const NodeFormFields: React.FC<NodeFormFieldsProps> = ({ node, onChange, appearance }) => {
  const accentColor = appearance.accentColor || '#3b82f6';
  
  // Common icons for quick select
  const commonIcons = [
    'server', 'monitor', 'tv', 'clapperboard', 'smartphone', 'tablet', 'laptop',
    'hard-drive', 'database', 'wifi', 'globe', 'cloud', 'shield', 'lock', 'key',
    'users', 'user', 'settings', 'wrench', 'tool', 'cpu', 'activity', 'zap',
    'play', 'pause', 'stop', 'power', 'camera', 'video', 'mic', 'headphones',
    'printer', 'phone', 'mail', 'bell', 'clock', 'calendar', 'file', 'folder',
    'download', 'upload', 'github', 'chrome', 'firefox', 'home', 'building'
  ];

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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Subtitle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
          <input
            type="text"
            value={node.subtitle}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Internal Address */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            Internal Address
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
              Health Check
            </span>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Address used by the server to check status. Format: <code>ip:port</code> or <code>http://ip:port</code>
          </p>
        </div>

        {/* External Address */}
        <div className="col-span-1 md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            External Address
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              User Access
            </span>
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
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Public address for opening the service in browser.</p>
        </div>

        {/* Toggles */}
        <div className="col-span-1 md:col-span-2 space-y-3 bg-gray-50 p-3 rounded-md border border-gray-200">
          {/* Disable Health Check */}
          <div className="flex items-start space-x-3">
            <div className="flex items-center h-5">
              <input
                type="checkbox"
                id={`disableHealthCheck-${node.id}`}
                checked={node.disableHealthCheck || false}
                onChange={(e) => onChange({ disableHealthCheck: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </div>
            <div>
              <label htmlFor={`disableHealthCheck-${node.id}`} className="font-medium text-gray-700 text-sm">
                Disable Health Checking
              </label>
              <p className="text-xs text-gray-500">
                If checked, this node will show as blue and status monitoring will be skipped.
              </p>
            </div>
          </div>

          {/* Disable Embedded */}
          <div className="flex items-start space-x-3">
            <div className="flex items-center h-5">
              <input
                type="checkbox"
                id={`disableEmbedded-${node.id}`}
                checked={node.disableEmbedded || false}
                onChange={(e) => onChange({ disableEmbedded: e.target.checked })}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
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
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 border border-gray-300 rounded-md bg-gray-50">
                {renderIconPreview(node.icon || '', 20)}
              </div>
              <div className="flex-1">
                <input
                  type="text"
                  value={node.icon || ''}
                  onChange={(e) => onChange({ icon: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter icon name (e.g., server, monitor, wifi)"
                />
              </div>
            </div>
            
            {/* Quick Select */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 mb-1 w-full">Quick select:</span>
              {commonIcons.slice(0, 12).map((iconName) => (
                <button
                  key={iconName}
                  type="button"
                  onClick={() => onChange({ icon: iconName })}
                  className={`flex items-center space-x-1 px-2 py-1 text-xs border rounded-md hover:bg-gray-100 transition-colors ${
                    node.icon === iconName ? 'border-2' : 'border-gray-300'
                  }`}
                  style={{
                    backgroundColor: node.icon === iconName ? `${accentColor}15` : undefined,
                    borderColor: node.icon === iconName ? accentColor : undefined,
                    color: node.icon === iconName ? accentColor : undefined
                  }}
                  title={iconName}
                >
                  {renderIconPreview(iconName, 12)}
                  <span className="capitalize">{iconName}</span>
                </button>
              ))}
            </div>
            
            <div className="text-xs text-gray-500">
              Browse icons at <a href="https://lucide.dev/icons" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">lucide.dev</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
