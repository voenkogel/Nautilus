import { useEffect } from 'react';
import type { AppConfig } from '../types/config';

export const useAppearance = (appConfig: AppConfig) => {
  useEffect(() => {
    if (appConfig.general?.title) {
      document.title = appConfig.general.title;
    }
    
    // Handle favicon with fallback to Nautilus icon
    const favicon = document.getElementById('favicon') as HTMLLinkElement;
    if (favicon) {
      if (appConfig.appearance?.favicon) {
        favicon.href = appConfig.appearance.favicon;
      } else {
        // Fallback to Nautilus icon if no favicon is provided
        favicon.href = '/nautilusIcon.png';
      }
    }
    
    if (appConfig.appearance?.accentColor) {
      document.documentElement.style.setProperty('--accent-color', appConfig.appearance.accentColor);
    }
  }, [appConfig]);
};
