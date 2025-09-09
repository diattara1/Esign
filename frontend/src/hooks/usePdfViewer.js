import { useState, useRef, useLayoutEffect } from 'react';

export default function usePdfViewer() {
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.getBoundingClientRect().width || 0);
    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);
    measure();
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});

  const onDocumentLoad = ({ numPages }) => setNumPages(numPages);
  const onPageLoadSuccess = (num, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDims((d) => (
      d[num]?.width === vp.width && d[num]?.height === vp.height
        ? d
        : { ...d, [num]: { width: vp.width, height: vp.height } }
    ));
  };

  const reset = () => {
    setNumPages(0);
    setPageDims({});
  };

  return { viewerRef, viewerWidth, numPages, pageDims, onDocumentLoad, onPageLoadSuccess, reset };
}
