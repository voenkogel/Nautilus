import React, { useState, useEffect, useCallback, useRef } from 'react';
import AuthModal from './AuthModal';
import {
  registerAuthModalOpener,
  unregisterAuthModalOpener,
  performLogin,
  performSetup,
  initAuthMode,
  isSetupRequired,
} from '../utils/auth';
import type { AppConfig } from '../types/config';

/**
 * Renders AuthModal inside the React tree (ARCH-5). On mount it registers an opener
 * with auth.ts, so the standalone authenticate() can trigger the modal without an
 * imperative createRoot. Each open resolves true (logged in) or false (cancelled).
 * On a fresh install it shows the one-time account setup form instead of the login.
 */
export const AuthModalHost: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'setup'>('login');
  const [error, setError] = useState<string | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | undefined>(undefined);
  // Queue of pending authenticate() resolvers. Multiple auth-guarded actions can
  // await the modal at once (e.g. clicking a node then the settings gear before
  // logging in); they all resolve together when the single modal session
  // finishes, so no caller is left hanging when a later open arrives.
  const resolversRef = useRef<((value: boolean) => void)[]>([]);

  useEffect(() => {
    const opener = async () => {
      setError(null);
      // Re-check: the account may have been created since the page loaded.
      await initAuthMode();
      setMode(isSetupRequired() ? 'setup' : 'login');
      // Best-effort: fetch the latest config so the modal uses the current accent color.
      try {
        const res = await fetch('api/config');
        if (res.ok) setAppConfig(await res.json());
      } catch {
        // ignore — modal falls back to default styling
      }
      setIsOpen(true);
      return new Promise<boolean>((resolve) => {
        resolversRef.current.push(resolve);
      });
    };
    registerAuthModalOpener(opener);

    return () => {
      // On unmount, resolve any awaiting callers as "not authenticated" so a
      // remount (or StrictMode double-invoke) that swaps the global opener can
      // never strand an authenticate() promise forever-pending.
      const pending = resolversRef.current;
      resolversRef.current = [];
      pending.forEach((resolve) => resolve(false));
      unregisterAuthModalOpener(opener);
    };
  }, []);

  const finish = useCallback((result: boolean) => {
    setIsOpen(false);
    const resolvers = resolversRef.current;
    resolversRef.current = [];
    resolvers.forEach((resolve) => resolve(result));
  }, []);

  const handleSubmit = useCallback(async (username: string, password: string) => {
    const { success, error: err } = mode === 'setup'
      ? await performSetup(username, password)
      : await performLogin(username, password);
    if (success) {
      finish(true);
    } else {
      setError(err || 'Authentication failed.');
      if (mode === 'setup' && !isSetupRequired()) setMode('login');
    }
  }, [finish, mode]);

  if (!isOpen) return null;

  return (
    <AuthModal
      key={mode}
      isOpen={isOpen}
      mode={mode}
      onClose={() => finish(false)}
      onSubmit={handleSubmit}
      error={error}
      appConfig={appConfig}
    />
  );
};

export default AuthModalHost;
