
// src/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setLogoutCallback, verifyToken } from './services/apiUtils';
import { toast } from 'react-toastify';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // login renvoie true si OK, false sinon (pas d'exception non gérée)
  const login = async (username, password) => {
    try {
      await api.post('/api/token/', { username, password });
      const userData = await verifyToken();
      setUser(userData.user);
      navigate('/dashboard');
      return true;
    } catch (err) {
      const msg = err.response?.data?.detail
               || err.response?.data?.error
               || 'Impossible de se connecter';
      toast.error(msg);
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/logout/');
    } catch {}
    setUser(null);
    navigate('/login');
  };

  // Gère l'expiration de session côté client
  const handleTokenExpiry = () => {
    toast.error('Votre session a expiré. Veuillez vous reconnecter.');
    logout();
  };

  useEffect(() => {
    // permet à axios-auth-refresh de déconnecter si le refresh échoue
    setLogoutCallback(handleTokenExpiry);

    const init = async () => {
      try {
        const userData = await verifyToken();
        setUser(userData.user);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [navigate]);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
      handleTokenExpiry
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
