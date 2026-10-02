import { useEffect } from 'react';
import type { AppConfig } from '../types/config';
import { assetUrl } from '../utils/assetUrl';

export const useAppearance = (appConfig: AppConfig) => {
  useEffect(() => {
    if (appConfig.general?.title) {
      document.title = appConfig.general.title;
    }
    
    // Handle favicon with fallback to Nautilus icon
    const favicon = document.getElementById('favicon') as HTMLLinkElement;
    if (favicon) {
      if (appConfig.appearance?.favicon) {
        favicon.href = assetUrl(appConfig.appearance.favicon);
      } else {
        // Fallback to Nautilus icon if no favicon is provided
        favicon.href = 'nautilusIcon.png';
      }
    }
    
    document.documentElement.style.setProperty('--accent-color', '#65d7e8');
  }, [appConfig]);
};
