import { useMemo, useCallback } from 'react';

export default function useResponsivePdf(viewerWidth, pageDims, isMobile) {
  const containerPadding = isMobile ? 24 : 48; // p-3 / md:p-6

  const pageWidth = useMemo(() => {
    return Math.min(Math.max((viewerWidth || 0) - containerPadding, 320), 900);
  }, [viewerWidth, containerPadding]);

  const pageScale = useCallback(
    (pageNumber) => {
      const natural = pageDims[pageNumber]?.width || 1;
      return pageWidth / natural;
    },
    [pageDims, pageWidth]
  );

  return { pageWidth, pageScale };
}
