import { useState, useEffect } from 'react';

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
}

export const useDeviceDetection = (): DeviceInfo => {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const updateDeviceInfo = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      // Detect device type based on screen width
      // Mobile: < 768px
      // Tablet: 768px - 1024px
      // Desktop: > 1024px
      const isMobile = width < 768;
      const isTablet = width >= 768 && width <= 1024;
      const isDesktop = width > 1024;
      
      setDeviceInfo({
        isMobile,
        isTablet,
        isDesktop,
        width,
        height,
      });
    };

    // Initial check
    updateDeviceInfo();

    // Listen for window resize events
    window.addEventListener('resize', updateDeviceInfo);
    
    return () => {
      window.removeEventListener('resize', updateDeviceInfo);
    };
  }, []);

  return deviceInfo;
};
