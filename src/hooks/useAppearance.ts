import { useEffect } from 'react';
import type { AppConfig } from '../types/config';

/** Keeps the browser tab title in sync with the configured app title. The look itself is fixed. */
export const useAppearance = (appConfig: AppConfig) => {
  useEffect(() => {
    if (appConfig.general?.title) document.title = appConfig.general.title;
  }, [appConfig]);
};
