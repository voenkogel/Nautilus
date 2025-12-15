import React, { useState } from 'react';
import type { TreeNode, AppearanceConfig } from '../types/config';
import * as LucideIcons from 'lucide-react';
import { IconPicker } from './IconPicker';
import Switch from './Switch';
import { useToast } from './Toast';
import { getAuthHeaders } from '../utils/auth';

interface NodeFormFieldsProps {
  node: TreeNode;
  onChange: (updates: Partial<TreeNode>) => void;
  appearance: AppearanceConfig;
}

export const NodeFormFields: React.FC<NodeFormFieldsProps> = ({ node, onChange, appearance }) => {
  const accentColor = appearance.accentColor || '#3b82f6';
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [showPlexToken, setShowPlexToken] = useState(false);
  const { addToast } = useToast();
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      const response = await fetch('/api/test-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify(node)
      });
      
      const result = await response.json();
      
      if (response.ok && result.status === 'online') {
        let details = '';
        if (result.streams !== undefined) details = `(${result.streams} active streams)`;
        else if (result.players) details = `(${result.players.online}/${result.players.max} players)`;
        
        addToast({
          type: 'success',
          message: `Connection successful! ${details}`,
          duration: 3000
        });
      } else {
        addToast({
          type: 'error',
          message: `Connection failed: ${result.error || 'Unknown error'}`,
          duration: 5000
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        message: `Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        duration: 5000
      });
    } finally {
      setIsTesting(false);
    }
  };
  
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
              const type = e.target.value as 'http' | 'minecraft' | 'plex' | 'disabled';
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
            <option value="plex">Plex Media Server</option>
            <option value="disabled">Disable Health Checking</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Select how the status of this node should be monitored.
          </p>
        </div>

        {/* Plex Token Input */}
        {node.healthCheckType === 'plex' && (
          <div className="col-span-1 md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Plex Token (X-Plex-Token)
            </label>
            <div className="relative">
              <input
                type={showPlexToken ? "text" : "password"}
                value={node.plexToken || ''}
                onChange={(e) => onChange({ plexToken: e.target.value })}
                placeholder="Enter your Plex Token"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 pr-10"
                style={{ '--tw-ring-color': accentColor } as React.CSSProperties}
              />
              <button
                type="button"
                onClick={() => setShowPlexToken(!showPlexToken)}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600 focus:outline-none"
              >
                {showPlexToken ? <LucideIcons.EyeOff size={18} /> : <LucideIcons.Eye size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Required to fetch session count. Found in Plex XML feeds or URL.
            </p>
          </div>
        )}

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

        {/* Test Connection Button */}
        <div className="col-span-1 md:col-span-2 flex justify-end">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md text-white transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              isTesting ? 'opacity-70 cursor-not-allowed' : ''
            }`}
            style={{ 
              backgroundColor: accentColor,
              '--tw-ring-color': accentColor 
            } as React.CSSProperties}
          >
            {isTesting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Testing...
              </>
            ) : (
              <>
                <LucideIcons.Activity size={16} />
                Test Connection
              </>
            )}
          </button>
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
        <div className="col-span-1 md:col-span-2 space-y-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">Interaction</label>
              <div className="flex items-center">
                <Switch
                  id={`isInteractable-${node.id}`}
                  checked={node.isInteractable !== false} // Default to true
                  onChange={(checked) => onChange({ isInteractable: checked })}
                  accentColor={accentColor}
                />
                <label htmlFor={`isInteractable-${node.id}`} className="ml-2 text-sm text-gray-600 cursor-pointer">
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
                  <div className="flex items-center h-6">
                    <Switch
                      id={`disableEmbedded-${node.id}`}
                      checked={node.disableEmbedded || false}
                      onChange={(checked) => onChange({ disableEmbedded: checked })}
                      accentColor={accentColor}
                    />
                  </div>
                  <div>
                    <label htmlFor={`disableEmbedded-${node.id}`} className="font-medium text-gray-700 text-sm cursor-pointer">
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
      </div>
    </div>
  );
};
