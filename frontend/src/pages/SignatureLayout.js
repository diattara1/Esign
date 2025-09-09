// src/pages/signature/SignatureLayout.js
// Version responsive avec sidebar mobile

import React, { useState, useEffect } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import SignatureNavbar from '../components/SignatureNavbar';

const SignatureLayout = () => {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Fermer sidebar quand la route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Fermer sidebar avec Escape
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const isMobile = useIsMobile(1024);
  const navigationItems = [
    { path: '/signature/envelopes/sent', label: 'Envoyé', badge: null },
    { path: '/signature/envelopes/completed', label: 'Complété(s)', badge: null },
    { path: '/signature/envelopes/action-required', label: 'Action requise', badge: null },
    { path: '/signature/envelopes/drafts', label: 'Brouillons', badge: null },
    { path: '/signature/envelopes/deleted', label: 'Supprimé', badge: null },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SignatureNavbar />

      {/* Header mobile avec bouton menu */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-16 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <FiMenu className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-gray-900">Signatures</h1>
        <div className="w-9"> {/* Spacer pour centrer le titre */}</div>
      </div>

      <div className="flex flex-1 relative">
        {/* Sidebar responsive */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:pt-0 pt-16
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Header sidebar mobile */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Navigation</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <div className="p-4 space-y-6 overflow-y-auto h-full">
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3 px-2">
                Environnement
              </h2>
              <nav className="space-y-1">
                {navigationItems.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) => `
                      flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-all duration-200
                      ${isActive 
                        ? 'bg-blue-50 text-blue-700 font-medium border border-blue-200' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                    onClick={() => isMobile && setSidebarOpen(false)}
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full font-medium">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </div>

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-25 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Contenu principal */}
        <div className="flex-1 min-w-0">
          <div className="p-4 lg:p-6 max-w-full">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignatureLayout;