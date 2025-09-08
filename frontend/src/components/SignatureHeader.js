import React from 'react';
import { FiMenu, FiX } from 'react-icons/fi';

const SignatureHeader = ({ title, placement, placing, isMobile, sidebarOpen, toggleSidebar }) => (
  <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 sticky top-0 z-10">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {placement && (
          <span className="hidden md:inline px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full">
            Zone p.{placement.page}
          </span>
        )}
        {placing && (
          <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs md:text-sm rounded-full animate-pulse">
            Placement actif
          </span>
        )}
        {isMobile && (
          <button
            onClick={toggleSidebar}
            aria-expanded={sidebarOpen}
            aria-controls="mobile-panel"
            className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition"
            title={sidebarOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}
          >
            {sidebarOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
          </button>
        )}
      </div>
      <h2 className="text-base md:text-lg font-semibold text-gray-900 truncate">{title}</h2>
    </div>
  </div>
);

export default SignatureHeader;
