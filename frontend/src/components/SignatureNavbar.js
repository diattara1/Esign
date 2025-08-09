import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FiUser,
  FiLogOut,
  FiMenu,
  FiX,
  FiHome,
  FiFileText,
  FiSettings,
  FiChevronDown
} from 'react-icons/fi';
import { useAuth } from '../AuthContext';

const SignatureNavbar = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileRef = useRef(null);

  const mainLinks = [
    { path: '/dashboard', label: 'Tableau de bord', icon: <FiHome className="mr-2" /> },
    { path: '/signature', label: 'Signatures', icon: <FiFileText className="mr-2" /> },
    { path: '/settings', label: 'Paramètres', icon: <FiSettings className="mr-2" /> }
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Fermer le menu profil quand on clique à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <nav className="fixed top-0 w-full z-50 bg-white border-b border-gray-200 px-4 py-3 shadow-sm h-16">

      <div className="flex justify-between items-center max-w-7xl mx-auto">
        {/* Logo */}
        <Link to="/" className="text-xl font-bold text-blue-600">
          INTELISign+
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center space-x-6">
          {mainLinks.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center px-1 py-2 text-sm font-medium ${
                location.pathname.startsWith(item.path)
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-blue-500'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-2 md:space-x-4">
          {/* Bouton nouvelle enveloppe */}
          <Link
            to="/signature/upload"
            className="hidden md:inline-block px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition"
          >
            Nouvelle signature
          </Link>

          {/* Profile dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileMenuOpen(!profileMenuOpen)}
              className="flex items-center gap-1 focus:outline-none"
            >
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <FiUser className="h-5 w-5" />
              </div>
              <FiChevronDown className="text-gray-600" />
            </button>

            {profileMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
                <Link
                  to="/profile"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Mon compte
                </Link>
                <Link
                  to="/settings"
                  className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Paramètres
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>

          {/* Hamburger menu */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-gray-500 hover:text-gray-600 focus:outline-none"
          >
            {mobileMenuOpen ? <FiX className="h-6 w-6" /> : <FiMenu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-gray-200 mt-2">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {mainLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center px-3 py-2 rounded-md text-base font-medium ${
                  location.pathname.startsWith(item.path)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
            <Link
              to="/signature/upload"
              className="block px-3 py-2 rounded-md text-base font-medium text-blue-600 hover:bg-blue-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Nouvelle signature
            </Link>
          </div>
          <div className="px-2 py-3 border-t border-gray-200">
            <Link
              to="/profile"
              className="block px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:bg-gray-50"
              onClick={() => setMobileMenuOpen(false)}
            >
              Mon compte
            </Link>
            <button
              onClick={() => {
                handleLogout();
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 hover:bg-gray-50"
            >
              Déconnexion
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default SignatureNavbar;
