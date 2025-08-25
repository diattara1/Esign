
// src/pages/signature/SignatureLayout.js
import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import SignatureNavbar from '../components/SignatureNavbar';
const SignatureLayout = () => {
  const location = useLocation();

  // Détermine si un lien est actif
  const isActive = (path) => {
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <SignatureNavbar />

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-64 bg-gray-50 p-4 space-y-8">

          {/* Section Environnement avec vos liens exacts */}
          <div>
            <h2 className="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">Environnement</h2>
            <nav className="space-y-1">
              
              
              <NavLink 
                to="/signature/envelopes/sent" 
                className={({ isActive }) => 
                  `block px-3 py-2 text-sm rounded-md ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                Envoyé
              </NavLink>
              
              <NavLink 
                to="/signature/envelopes/completed" 
                className={({ isActive }) => 
                  `block px-3 py-2 text-sm rounded-md ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                Complété(s)
              </NavLink>
              
              <NavLink 
                to="/signature/envelopes/action-required" 
                className={({ isActive }) => 
                  `block px-3 py-2 text-sm rounded-md ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                Action requise
              </NavLink>
              
              <NavLink 
                to="/signature/envelopes/drafts" 
                className={({ isActive }) => 
                  `block px-3 py-2 text-sm rounded-md ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                Brouillons
              </NavLink>
              
              <NavLink 
                to="/signature/envelopes/deleted" 
                className={({ isActive }) => 
                  `block px-3 py-2 text-sm rounded-md ${isActive 
                    ? 'bg-blue-50 text-blue-700 font-medium' 
                    : 'text-gray-700 hover:bg-gray-100'}`
                }
              >
                Supprimé
              </NavLink>
            </nav>
          </div>

         
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6 bg-white">
            
            
            <Outlet />
          
        </div>
      </div>
    </div>
  );
};



export default SignatureLayout;