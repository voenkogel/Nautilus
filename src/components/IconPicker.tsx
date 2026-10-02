import React, { useState, useMemo, useEffect, useRef, type ComponentType } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { createPortal } from 'react-dom';
import * as LucideIcons from 'lucide-react';
import { Search, X, type LucideProps } from 'lucide-react';
import { iconRegistry } from '../utils/iconUtils';

interface IconPickerProps {
  currentIcon: string;
  onSelect: (iconName: string) => void;
  onClose: () => void;
}

export const IconPicker: React.FC<IconPickerProps> = ({ currentIcon, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref);
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(100);

  // Get all available icons from Lucide
  const allIcons = useMemo(() => {
    const iconList: { name: string; pascalName: string; component: ComponentType<LucideProps> }[] = [];
    
    Object.keys(LucideIcons).forEach(key => {
      // Skip internal/utility exports
      if (key === 'createLucideIcon' || key === 'default') return;
      
      const component = iconRegistry[key];
      
      // Ensure it's a valid component (function or object with render)
      // Lucide icons are functional components
      if (typeof component !== 'function' && typeof component !== 'object') return;
      
      // Convert PascalCase to kebab-case
      const name = key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      
      iconList.push({
        name,
        pascalName: key,
        component
      });
    });
    
    return iconList;
  }, []);

  // Filter icons based on search
  const filteredIcons = useMemo(() => {
    if (!searchQuery) return allIcons;
    const lowerQuery = searchQuery.toLowerCase();
    return allIcons.filter(icon => icon.name.includes(lowerQuery));
  }, [allIcons, searchQuery]);

  // Reset limit when search changes
  useEffect(() => {
    setDisplayLimit(100);
  }, [searchQuery]);

  return createPortal(
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-black bg-opacity-50 p-4 font-roboto">
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Select icon" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} className="bg-surface rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-4 border-b border-line flex items-center justify-between">
          <h3 className="text-lg font-medium text-ink">Select Icon</h3>
          <button 
            onClick={onClose}
            className="text-muted hover:text-muted transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-line bg-abyss">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search size={18} className="text-muted" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-3 py-2 border border-line rounded-md leading-5 bg-surface placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              placeholder="Search icons (e.g. server, wifi, database)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="mt-2 text-xs text-muted flex justify-between">
            <span>{filteredIcons.length} icons found</span>
            <span>Showing top {Math.min(displayLimit, filteredIcons.length)}</span>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-4 min-h-[300px]">
          {filteredIcons.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <Search size={48} className="mb-4 opacity-20" />
              <p>No icons found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
              {filteredIcons.slice(0, displayLimit).map((icon) => {
                const IconComponent = icon.component;
                const isSelected = currentIcon === icon.name;
                
                return (
                  <button
                    key={icon.name}
                    onClick={() => {
                      onSelect(icon.name);
                      onClose();
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all hover:bg-accent/10 hover:border-accent/40 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      isSelected 
                        ? 'bg-accent/10 border-blue-500 ring-1 ring-blue-500'
                        : 'border-line bg-surface'
                    }`}
                    title={icon.name}
                  >
                    <IconComponent size={24} className={isSelected ? 'text-accent' : 'text-ink'} />
                    <span className="mt-2 text-[10px] text-muted truncate w-full text-center">
                      {icon.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          
          {/* Load More Trigger */}
          {filteredIcons.length > displayLimit && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setDisplayLimit(prev => prev + 100)}
                className="px-4 py-2 text-sm text-accent hover:text-accent font-medium"
              >
                Load more icons...
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
