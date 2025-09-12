import { useEffect, useState } from 'react';

export const MOBILE_BREAKPOINT = 1024;

export default function useIsMobile(maxWidth = MOBILE_BREAKPOINT) {
  const getMatch = () =>
    typeof window !== 'undefined'
      ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches
      : false;

  const [isMobile, setIsMobile] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const handler = (e) => setIsMobile(e.matches);
    // Support old browsers
    if (media.addEventListener) {
      media.addEventListener('change', handler);
    } else {
      media.addListener(handler);
    }
    // Set initial state in case it changed before listener added
    setIsMobile(media.matches);
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', handler);
      } else {
        media.removeListener(handler);
      }
    };
  }, [maxWidth]);

  return isMobile;
}
