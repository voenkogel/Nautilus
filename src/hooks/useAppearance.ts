import { useEffect } from 'react';
import type { AppearanceConfig } from '../types/config';

export const useAppearance = (appearance: AppearanceConfig) => {
  useEffect(() => {
    // Update document title
    if (appearance.title) {
      document.title = appearance.title;
    }
  }, [appearance.title]);

  useEffect(() => {
    // Update favicon
    if (appearance.favicon) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = appearance.favicon;
    }
  }, [appearance.favicon]);

  useEffect(() => {
    // Update CSS custom properties for accent color
    if (appearance.accentColor) {
      document.documentElement.style.setProperty('--accent-color', appearance.accentColor);
    }
  }, [appearance.accentColor]);

  useEffect(() => {
    // Update background image
    if (appearance.backgroundImage) {
      document.body.style.backgroundImage = `url(${appearance.backgroundImage})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundRepeat = 'no-repeat';
      document.body.style.backgroundAttachment = 'fixed';
    } else {
      document.body.style.backgroundImage = '';
      document.body.style.backgroundSize = '';
      document.body.style.backgroundPosition = '';
      document.body.style.backgroundRepeat = '';
      document.body.style.backgroundAttachment = '';
    }
  }, [appearance.backgroundImage]);
};
