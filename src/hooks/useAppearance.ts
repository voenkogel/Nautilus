import { useEffect } from 'react';
import type { AppearanceConfig } from '../types/config';

export const useAppearance = (appearance: AppearanceConfig) => {
  useEffect(() => {
    if (appearance.title) {
      document.title = appearance.title;
    }
    
    // Handle favicon with fallback to Nautilus icon
    const favicon = document.getElementById('favicon') as HTMLLinkElement;
    if (favicon) {
      if (appearance.favicon) {
        favicon.href = appearance.favicon;
      } else {
        // Fallback to Nautilus icon if no favicon is provided
        favicon.href = '/nautilusIcon.png';
      }
    }
    
    if (appearance.accentColor) {
      document.documentElement.style.setProperty('--accent-color', appearance.accentColor);
    }
  }, [appearance]);

  useEffect(() => {
    // Always show the background image if set, otherwise clear it
    if (appearance.backgroundImage) {
      document.body.style.backgroundImage = `url(${appearance.backgroundImage})`;
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
  }, [appearance.backgroundImage]);
};
