// Server-side session-based authentication utility
const AUTH_TOKEN_KEY = 'nautilus_auth_token';

export interface AuthSession {
  authenticated: boolean;
  token: string;
  timestamp: number;
}

// In-tree auth modal opener, registered by <AuthModalHost> on mount (ARCH-5).
// Lets the standalone authenticate() trigger the modal without an imperative root.
let authModalOpener: (() => Promise<boolean>) | null = null;

export function registerAuthModalOpener(opener: () => Promise<boolean>): void {
  authModalOpener = opener;
}

// Clears the registered opener, but only if it still points at `opener` — so a
// re-mounting host (React StrictMode double-invoke, or an App remount) that has
// already registered a newer opener is not clobbered by the old one's cleanup.
export function unregisterAuthModalOpener(opener: () => Promise<boolean>): void {
  if (authModalOpener === opener) authModalOpener = null;
}

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


// Perform a login request. Returns success + an optional error message for the modal.
export async function performLogin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await response.json();
    if (response.ok && data.success && data.token) {
      storeToken(data.token);
      return { success: true };
    }
    return { success: false, error: data.message || 'Authentication failed. Please check your credentials.' };
  } catch (error) {
    console.error('Authentication error:', error);
    return { success: false, error: 'Authentication failed due to a network error. Please try again.' };
  }
}

// Authenticate user — resolves true if already authed, or after a successful in-tree modal login.
export const authenticate = async (): Promise<boolean> => {
  if (await isAuthenticated()) {
    return true;
  }
  if (authModalOpener) {
    return authModalOpener();
  }
  console.warn('Auth modal not mounted; cannot prompt for login.');
  return false;
};

/**
 * Wraps an action so it runs only after a successful authenticate().
 * Centralizes the `const ok = await authenticate(); if (!ok) return;` guard
 * duplicated across the edit/settings handlers. authenticate() short-circuits
 * when a valid session already exists, so this never prompts unnecessarily.
 */
export function withAuthGuard<A extends unknown[]>(
  action: (...args: A) => void | Promise<void>
): (...args: A) => Promise<void> {
  return async (...args: A) => {
    if (await authenticate()) {
      await action(...args);
    }
  };
}

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
