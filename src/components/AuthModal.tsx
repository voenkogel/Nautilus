import React, { useState, useEffect, useRef } from 'react';
import { Lock, User, X } from 'lucide-react';
import type { AppConfig } from '../types/config';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (username: string, password: string) => void;
  error?: string | null;
  appConfig?: AppConfig;
}

const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  error = null,
  appConfig
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // Get accent color from config or use default
  const accentColor = appConfig?.appearance?.accentColor || '#3b82f6';
  const appTitle = appConfig?.general?.title || 'Nautilus';

  // Focus username input when modal opens (Modal traps focus; this picks the field)
  useEffect(() => {
    if (isOpen && usernameInputRef.current) {
      setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      return; // Don't submit if fields are empty
    }

    setIsSubmitting(true);

    try {
      await onSubmit(username.trim(), password.trim());
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      zIndexClassName="z-[9999]"
      ariaLabelledBy="auth-modal-title"
    >
      {/* Header */}
      <div className="relative p-5 border-b border-gray-200">
        <div className="flex items-center">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center mr-3"
            style={{ backgroundColor: `${accentColor}15` }}
          >
            <Lock style={{ color: accentColor }} size={20} />
          </div>
          <div>
            <h3 id="auth-modal-title" className="text-lg font-medium text-gray-900">Administrator Login</h3>
            <p className="text-sm text-gray-500">
              Authentication required to access {appTitle} settings
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-5 right-5 text-gray-400 hover:text-gray-500 p-1 rounded-full hover:bg-gray-100"
        >
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="p-5">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Username field */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User size={18} style={{ color: username ? accentColor : '#9ca3af' }} />
              </div>
              <input
                ref={usernameInputRef}
                id="username"
                name="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                style={{
                  boxShadow: username ? `0 0 0 2px ${accentColor}20` : 'none',
                  "--tw-ring-color": `${accentColor}40`,
                  "--tw-ring-opacity": "1",
                  "borderColor": username ? accentColor : undefined
                } as React.CSSProperties}
                placeholder="Enter username"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>

          {/* Password field */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock size={18} style={{ color: password ? accentColor : '#9ca3af' }} />
              </div>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                style={{
                  boxShadow: password ? `0 0 0 2px ${accentColor}20` : 'none',
                  "--tw-ring-color": `${accentColor}40`,
                  "--tw-ring-opacity": "1",
                  "borderColor": password ? accentColor : undefined
                } as React.CSSProperties}
                placeholder="Enter password"
                disabled={isSubmitting}
                required
              />
            </div>
          </div>
        </div>

        {/* Footer with buttons */}
        <div className="mt-6 flex justify-end space-x-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" accentColor={accentColor} disabled={isSubmitting}>
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Authenticating...</span>
              </div>
            ) : (
              'Login'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AuthModal;
