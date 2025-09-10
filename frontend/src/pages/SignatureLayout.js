// src/pages/signature/SignatureLayout.js
// Version responsive avec sidebar mobile

import React, { useState, useEffect } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  FiX,
  FiSend,
  FiCheckCircle,
  FiAlertCircle,
  FiEdit3,
  FiTrash,
} from 'react-icons/fi';
import SignatureNavbar from '../components/SignatureNavbar';
import signatureService from '../services/signatureService';
import logService from '../services/logService';

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
  const [navigationItems, setNavigationItems] = useState([
    {
      path: '/signature/envelopes/sent',
      label: 'Envoyé',
      icon: FiSend,
      badge: 0,
    },
    {
      path: '/signature/envelopes/completed',
      label: 'Complété(s)',
      icon: FiCheckCircle,
      badge: 0,
    },
    {
      path: '/signature/envelopes/action-required',
      label: 'Action requise',
      icon: FiAlertCircle,
      badge: 0,
    },
    {
      path: '/signature/envelopes/drafts',
      label: 'Brouillons',
      icon: FiEdit3,
      badge: 0,
    },
    {
      path: '/signature/envelopes/deleted',
      label: 'Supprimé',
      icon: FiTrash,
      badge: 0,
    },
  ]);

  // Précharger les badges de navigation pour éviter les re-rendus
  useEffect(() => {
    const fetchBadges = async () => {
      try {
        const [sent, completed, actionReq, drafts, deleted] = await Promise.all([
          signatureService.getEnvelopes({ status: 'sent' }),
          signatureService.getCompletedEnvelopes(),
          signatureService.getReceivedEnvelopes(),
          signatureService.getEnvelopes({ status: 'draft' }),
          signatureService.getEnvelopes({ status: 'cancelled' }),
        ]);

        setNavigationItems(items =>
          items.map(item => {
            switch (item.path) {
              case '/signature/envelopes/sent':
                return { ...item, badge: sent.length };
              case '/signature/envelopes/completed':
                return { ...item, badge: completed.length };
              case '/signature/envelopes/action-required':
                return { ...item, badge: actionReq.length };
              case '/signature/envelopes/drafts':
                return { ...item, badge: drafts.length };
              case '/signature/envelopes/deleted':
                return { ...item, badge: deleted.length };
              default:
                return item;
            }
          })
        );
      } catch (err) {
        logService.error('Failed to load navigation badges:', err);
      }
    };

    fetchBadges();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <SignatureNavbar />

      <div className="flex flex-1 relative pb-14 lg:pb-0">
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
                    {item.path === '/signature/envelopes/action-required' && item.badge > 0 && (
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

      {/* Bottom nav icons */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40">
        <div className="flex justify-around">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `relative flex flex-col items-center flex-1 py-2 text-xs ${
                    isActive ? 'text-blue-600' : 'text-gray-500'
                  }`}
              >
                <Icon className="w-5 h-5" />
                {item.path === '/signature/envelopes/action-required' && item.badge > 0 && (
                  <span className="absolute -top-1 right-3 bg-red-500 text-white text-[10px] px-1 rounded-full">
                    {item.badge}
                  </span>
                )}
                <span className="mt-1">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default SignatureLayout;