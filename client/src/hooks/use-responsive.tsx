
import { useState, useEffect } from 'react';

type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface BreakpointValues {
  xs: boolean;
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  '2xl': boolean;
}

const breakpoints = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export function useResponsive() {
  const [breakpointValues, setBreakpointValues] = useState<BreakpointValues>({
    xs: false,
    sm: false,
    md: false,
    lg: false,
    xl: false,
    '2xl': false,
  });

  const [windowSize, setWindowSize] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const updateSize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setWindowSize({ width, height });
      
      setBreakpointValues({
        xs: width >= breakpoints.xs,
        sm: width >= breakpoints.sm,
        md: width >= breakpoints.md,
        lg: width >= breakpoints.lg,
        xl: width >= breakpoints.xl,
        '2xl': width >= breakpoints['2xl'],
      });
    };

    updateSize();
    
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const { width, height } = windowSize;

  // Device categorization
  const isMobile = width < breakpoints.md;
  const isTablet = width >= breakpoints.md && width < breakpoints.lg;
  const isDesktop = width >= breakpoints.lg;
  const isLargeDesktop = width >= breakpoints.xl;
  
  // Screen size helpers
  const isExtraSmall = width < breakpoints.xs;
  const isSmall = width < breakpoints.sm;
  const isTouchDevice = typeof window !== 'undefined' && 'ontouchstart' in window;
  
  return {
    ...breakpointValues,
    windowSize,
    width,
    height,
    isMobile,
    isTablet,
    isDesktop,
    isLargeDesktop,
    isExtraSmall,
    isSmall,
    isTouchDevice,
    isAbove: (breakpoint: Breakpoint) => breakpointValues[breakpoint],
    isBelow: (breakpoint: Breakpoint) => !breakpointValues[breakpoint],
    getCurrentBreakpoint: () => {
      if (width >= breakpoints['2xl']) return '2xl';
      if (width >= breakpoints.xl) return 'xl';
      if (width >= breakpoints.lg) return 'lg';
      if (width >= breakpoints.md) return 'md';
      if (width >= breakpoints.sm) return 'sm';
      if (width >= breakpoints.xs) return 'xs';
      return 'base';
    },
  };
}

export default useResponsive;
