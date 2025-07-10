// Server-side session-based authentication utility
const AUTH_TOKEN_KEY = 'nautilus_auth_token';

export interface AuthSession {
  authenticated: boolean;
  token: string;
  timestamp: number;
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

// Authenticate user with password prompt
export const authenticate = async (): Promise<boolean> => {
  // Check if already authenticated
  if (await isAuthenticated()) {
    return true;
  }
  
  // Show password prompt
  const password = window.prompt('Enter admin password to access settings and edit nodes:');
  
  if (password === null) {
    // User cancelled
    return false;
  }
  
  if (password.trim() === '') {
    window.alert('Password cannot be empty.');
    return false;
  }
  
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password })
    });
    
    const data = await response.json();
    
    if (response.ok && data.success && data.token) {
      // Store the token
      storeToken(data.token);
      return true;
    } else {
      // Authentication failed
      window.alert(data.message || 'Authentication failed. Please check your password.');
      return false;
    }
  } catch (error) {
    console.error('Authentication error:', error);
    window.alert('Authentication failed due to a network error. Please try again.');
    return false;
  }
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
