import { useCallback } from 'react';

/**
 * Compute responsive PDF page dimensions.
 * @param {number} viewerWidth - width of the container displaying pages
 * @param {boolean} isMobile - whether the layout is mobile (<768px)
 * @param {Object} pageDims - map of pageNumber -> { width, height }
 * @returns {function(pageNumber: number): {pageWidth: number, scale: number, pageHeight: number}}
 */
export default function useResponsivePdf(viewerWidth, isMobile, pageDims) {
  return useCallback(
    (pageNumber) => {
      const containerPadding = isMobile ? 24 : 48; // p-3 / md:p-6
      const pageWidth = Math.min(
        Math.max((viewerWidth || 0) - containerPadding, 320),
        900
      );
      const dims = pageDims[pageNumber] || { width: 1, height: 1 };
      const scale = pageWidth / dims.width;
      const pageHeight = dims.height * scale;
      return { pageWidth, scale, pageHeight };
    },
    [viewerWidth, isMobile, pageDims]
  );
}
