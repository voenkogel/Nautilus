import { useEffect } from 'react';
import type { AppearanceConfig } from '../types/config';

export const useAppearance = (appearance: AppearanceConfig) => {
  useEffect(() => {
    if (appearance.title) {
      document.title = appearance.title;
    }
    if (appearance.favicon) {
      const favicon = document.getElementById('favicon') as HTMLLinkElement;
      if (favicon) {
        favicon.href = appearance.favicon;
      }
    }
    if (appearance.accentColor) {
      document.documentElement.style.setProperty('--accent-color', appearance.accentColor);
    }
  }, [appearance]);

  useEffect(() => {
    if (appearance.disableBackground) {
      document.body.style.backgroundImage = 'none';
      document.body.style.backgroundColor = 'transparent';
      document.documentElement.style.backgroundColor = 'transparent';
    } else {
      document.documentElement.style.backgroundColor = ''; // Revert to default
      // Update background image
      if (appearance.backgroundImage) {
        document.body.style.backgroundImage = `url(${appearance.backgroundImage})`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundAttachment = 'fixed';
        document.body.style.backgroundColor = ''; // Clear background color if image is present
      } else {
        document.body.style.backgroundImage = '';
        document.body.style.backgroundSize = '';
        document.body.style.backgroundPosition = '';
        document.body.style.backgroundRepeat = '';
        document.body.style.backgroundAttachment = '';
        document.body.style.backgroundColor = ''; // Revert to default
      }
    }
  }, [appearance.backgroundImage, appearance.disableBackground]);
};
