import { useEffect, useState } from 'react';

export default function useIsMobile(maxWidth = 768) {
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
