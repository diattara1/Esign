import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  FiUser,
  FiLogOut,
  FiMenu,
  FiX,
  FiHome,
  FiFileText,
  FiSettings,
  FiChevronDown,
  FiEdit3,
  FiLayers,
  FiZap
} from 'react-icons/fi';
import { useAuth } from '../AuthContext';

const SignatureNavbar = () => {
  const { logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [signMenuOpen, setSignMenuOpen] = useState(false);
  const profileRef = useRef(null);
  const signRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const profileButtonRef = useRef(null);
  const signButtonRef = useRef(null);

  const mainLinks = [
    { path: '/dashboard', label: 'Tableau de bord', icon: <FiHome className="w-4 h-4" /> },
    { path: '/signature', label: 'Signatures', icon: <FiFileText className="w-4 h-4" /> },
    { path: '/settings', label: 'Paramètres', icon: <FiSettings className="w-4 h-4" /> }
  ];

  const signatureOptions = [
    {
      path: '/signature/self-sign',
      label: 'Auto-signature',
      icon: <FiEdit3 className="w-4 h-4" />,
      description: 'Signer un document instantanément',
      color: 'emerald'
    },
    {
      path: '/signature/bulk-same',
      label: 'Signature masse',
      icon: <FiLayers className="w-4 h-4" />,
      description: 'Plusieurs docs, même position',
      color: 'blue'
    },
    {
      path: '/signature/saved-signatures',
      label: 'Mes signatures',
      icon: <FiZap className="w-4 h-4" />,
      description: 'Gérer vos signatures sauvegardées',
      color: 'purple'
    }
  ];

  const handleLogout = async () => {
    await logout();
  };

  // Fermer les menus quand on clique à l'extérieur
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileMenuOpen(false);
      }
      if (signRef.current && !signRef.current.contains(event.target)) {
        setSignMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          mobileButtonRef.current?.focus();
        }
        if (profileMenuOpen) {
          setProfileMenuOpen(false);
          profileButtonRef.current?.focus();
        }
        if (signMenuOpen) {
          setSignMenuOpen(false);
          signButtonRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, profileMenuOpen, signMenuOpen]);

  const getColorClasses = (color) => {
    const colors = {
      emerald: 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50',
      blue: 'text-blue-600 hover:text-blue-700 hover:bg-blue-50',
      purple: 'text-purple-600 hover:text-purple-700 hover:bg-purple-50'
    };
    return colors[color] || colors.blue;
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <FiFileText className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              INTELISign+
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {mainLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location.pathname.startsWith(item.path)
                    ? 'text-blue-600 bg-blue-50 border border-blue-200'
                    : 'text-gray-600 hover:text-blue-600 hover:bg-gray-50'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-3">
            {/* Request Signature Button */}
            <Link
              to="/signature/upload"
              className="hidden md:inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-medium rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 transform hover:scale-105 shadow-md"
            >
              <FiFileText className="w-4 h-4" />
              <span>Demander signature</span>
            </Link>

            {/* Sign Now Dropdown */}
            <div className="relative" ref={signRef}>
              <button
                ref={signButtonRef}
                onClick={() => setSignMenuOpen(!signMenuOpen)}
                className="hidden md:inline-flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white text-sm font-medium rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 transform hover:scale-105 shadow-md"
              >
                <FiEdit3 className="w-4 h-4" />
                <span>Signer maintenant</span>
                <FiChevronDown className="w-3 h-3" />
              </button>

              {signMenuOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 transform opacity-100 scale-100 transition-all duration-200">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <h3 className="text-sm font-semibold text-gray-800">Types de signature</h3>
                  </div>
                  {signatureOptions.map((option) => (
                    <Link
                      key={option.path}
                      to={option.path}
                      className={`flex items-start space-x-3 px-4 py-3 transition-colors duration-200 ${getColorClasses(option.color)}`}
                      onClick={() => setSignMenuOpen(false)}
                    >
                      <div className={`flex-shrink-0 p-2 rounded-lg bg-${option.color}-50`}>
                        {option.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{option.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                ref={profileButtonRef}
                onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                className="flex items-center space-x-2 p-1 rounded-lg hover:bg-gray-100 transition-colors duration-200"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                  <FiUser className="w-4 h-4 text-white" />
                </div>
                <FiChevronDown className="w-3 h-3 text-gray-500" />
              </button>

              {profileMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                  <Link
                    to="/profile"
                    className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <FiUser className="w-4 h-4" />
                    <span>Mon compte</span>
                  </Link>
                  <Link
                    to="/settings"
                    className="flex items-center space-x-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <FiSettings className="w-4 h-4" />
                    <span>Paramètres</span>
                  </Link>
                  <div className="border-t border-gray-100 my-1" />
                  <button
                    onClick={() => {
                      handleLogout();
                      setProfileMenuOpen(false);
                    }}
                    className="flex items-center space-x-3 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors duration-200"
                  >
                    <FiLogOut className="w-4 h-4" />
                    <span>Déconnexion</span>
                  </button>
                </div>
              )}
            </div>

            {/* Mobile menu button */}
            <button
              ref={mobileButtonRef}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 hover:text-gray-600 hover:bg-gray-100 transition-colors duration-200"
            >
              {mobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white/95 backdrop-blur-md">
            <div className="px-2 py-4 space-y-2">
              {/* Main Links */}
              {mainLinks.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium transition-colors duration-200 ${
                    location.pathname.startsWith(item.path)
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              ))}
              
              {/* Divider */}
              <div className="border-t border-gray-200 my-3" />
              
              {/* Request Signature */}
              <Link
                to="/signature/upload"
                className="flex items-center space-x-3 px-3 py-3 rounded-lg text-base font-medium text-blue-600 hover:bg-blue-50 transition-colors duration-200"
                onClick={() => setMobileMenuOpen(false)}
              >
                <FiFileText className="w-5 h-5" />
                <span>Demander signature</span>
              </Link>

              {/* Signature Options */}
              <div className="space-y-1">
                <div className="px-3 py-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Signer maintenant</h3>
                </div>
                {signatureOptions.map((option) => (
                  <Link
                    key={option.path}
                    to={option.path}
                    className={`flex items-start space-x-3 px-3 py-3 rounded-lg text-base font-medium transition-colors duration-200 ${getColorClasses(option.color)}`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {option.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{option.description}</div>
                    </div>
                  </Link>
                ))}
              </div>
              
              {/* Divider */}
              <div className="border-t border-gray-200 my-3" />
              
              
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default SignatureNavbar;