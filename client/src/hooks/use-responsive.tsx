
import { useState, useEffect } from 'react';

type Breakpoint = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface BreakpointValues {
  sm: boolean;
  md: boolean;
  lg: boolean;
  xl: boolean;
  '2xl': boolean;
}

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
};

export function useResponsive() {
  const [breakpointValues, setBreakpointValues] = useState<BreakpointValues>({
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

  const isMobile = !breakpointValues.md;
  const isTablet = breakpointValues.md && !breakpointValues.lg;
  const isDesktop = breakpointValues.lg;
  
  return {
    ...breakpointValues,
    windowSize,
    isMobile,
    isTablet,
    isDesktop,
    isAbove: (breakpoint: Breakpoint) => breakpointValues[breakpoint],
    isBelow: (breakpoint: Breakpoint) => !breakpointValues[breakpoint],
  };
}

export default useResponsive;
