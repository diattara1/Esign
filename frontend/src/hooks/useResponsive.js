import { useState, useEffect } from 'react';

export default function useResponsive() {
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

  const toggleSidebar = () => setSidebarOpen((o) => !o);

  return { isMobile, sidebarOpen, toggleSidebar, setSidebarOpen };
}
