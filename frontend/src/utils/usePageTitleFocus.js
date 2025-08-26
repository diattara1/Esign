import { useEffect, useRef } from 'react';

export default function usePageTitleFocus() {
  const titleRef = useRef(null);
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
    }
  }, []);
  return titleRef;
}
