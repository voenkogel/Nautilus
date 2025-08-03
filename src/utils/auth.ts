// Server-side session-based authentication utility
import React from 'react';
import { createRoot } from 'react-dom/client';
import AuthModal from '../components/AuthModal';
import type { AppConfig } from '../types/config';

const AUTH_TOKEN_KEY = 'nautilus_auth_token';

export interface AuthSession {
  authenticated: boolean;
  token: string;
  timestamp: number;
}

// Global state for auth modal
let authModalRoot: HTMLDivElement | null = null;
let currentAppConfig: AppConfig | null = null;

// Get stored auth token
const getStoredToken = (): string | null => {
  try {
    return sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('Error accessing sessionStorage:', error);
    return null;
  }
};

// Store auth token
const storeToken = (token: string): void => {
  try {
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch (error) {
    console.error('Error storing token:', error);
  }
};

// Remove auth token
const removeToken = (): void => {
  try {
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (error) {
    console.warn('Error removing token:', error);
  }
};

// Set the app config for the auth modal (optional - auth modal will auto-fetch if not set)
export const setAuthModalAppConfig = (config: AppConfig): void => {
  currentAppConfig = config;
};

// Check if user is currently authenticated
export const isAuthenticated = async (): Promise<boolean> => {
  const token = getStoredToken();
  if (!token) return false;
  
  try {
    const response = await fetch('/api/auth/validate', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      return true;
    } else {
      // Token is invalid, remove it
      removeToken();
      return false;
    }
  } catch (error) {
    console.warn('Error validating authentication:', error);
    removeToken();
    return false;
  }
};

// Show auth modal and return a promise that resolves when authenticated
const showAuthModal = (): Promise<boolean> => {
  return new Promise(async (resolve) => {
    // Fetch current config before showing modal to ensure we have the latest accent color
    try {
      const configResponse = await fetch('/api/config');
      if (configResponse.ok) {
        const config = await configResponse.json();
        currentAppConfig = config;
        console.log('🎨 Auth modal: Fetched current config for accent color');
      } else {
        console.warn('⚠️ Auth modal: Failed to fetch config, using existing config');
      }
    } catch (error) {
      console.warn('⚠️ Auth modal: Error fetching config:', error);
    }

    // Create modal container if it doesn't exist
    if (!authModalRoot) {
      authModalRoot = document.createElement('div');
      authModalRoot.id = 'auth-modal-root';
      document.body.appendChild(authModalRoot);
    }

    // Create React root
    const root = createRoot(authModalRoot);
    
    // Track error state
    let errorMessage: string | null = null;

    // Handle form submission
    const handleSubmit = async (username: string, password: string) => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success && data.token) {
          // Store the token and close modal
          storeToken(data.token);
          closeModal(true);
        } else {
          // Authentication failed - show error and re-render
          errorMessage = data.message || 'Authentication failed. Please check your credentials.';
          renderModal();
        }
      } catch (error) {
        console.error('Authentication error:', error);
        errorMessage = 'Authentication failed due to a network error. Please try again.';
        renderModal();
      }
    };

    // Close modal and resolve promise
    const closeModal = (success: boolean = false) => {
      if (authModalRoot) {
        root.unmount();
        if (authModalRoot.parentNode) {
          authModalRoot.parentNode.removeChild(authModalRoot);
        }
        authModalRoot = null;
      }
      resolve(success);
    };

    // Render modal
    const renderModal = () => {
      root.render(
        React.createElement(AuthModal, {
          isOpen: true,
          onClose: () => closeModal(false),
          onSubmit: handleSubmit,
          error: errorMessage,
          appConfig: currentAppConfig || undefined
        })
      );
    };

    renderModal();
  });
};

// Authenticate user with modal
export const authenticate = async (): Promise<boolean> => {
  // Check if already authenticated
  if (await isAuthenticated()) {
    return true;
  }
  
  // Show authentication modal
  return showAuthModal();
};

// Clear authentication (logout)
export const clearAuthentication = async (): Promise<void> => {
  const token = getStoredToken();
  
  if (token) {
    try {
      // Notify server about logout
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
    } catch (error) {
      console.warn('Error during logout:', error);
    }
  }
  
  // Remove token locally
  removeToken();
};

// Get authentication token for API requests
export const getAuthToken = (): string | null => {
  return getStoredToken();
};

// Check if user has a stored authentication token
export const hasAuthToken = (): boolean => {
  const token = getStoredToken();
  return !!token;
};

// Get authentication headers for API requests
export const getAuthHeaders = (): Record<string, string> => {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};
