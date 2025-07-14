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

  useEffect(() => {
    // Always show the background image if set, otherwise clear it
    if (appConfig.appearance?.backgroundImage) {
      document.body.style.backgroundImage = `url(${appConfig.appearance.backgroundImage})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
      document.body.style.backgroundColor = '';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
      document.body.style.backgroundColor = '';
    }
  }, [appConfig.appearance?.backgroundImage]);
};
