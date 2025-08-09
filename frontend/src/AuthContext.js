
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
      const { data } = await api.post('/api/token/', { username, password });
      const { access, refresh } = data;
      localStorage.setItem('accessToken', access);
      localStorage.setItem('refreshToken', refresh);

      const userData = await verifyToken();
      setUser({ token: access, ...userData });              // bien étaler userData
      navigate('/dashboard');
      return true;
    } catch (err) {
      const msg = err.response?.data?.detail
               || err.response?.data?.error
               || 'Impossible de se connecter';
      toast.error(msg);                                     // on affiche l’erreur
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    navigate('/login');
  };

  useEffect(() => {
    // permet à axios-auth-refresh de déconnecter si refresh échoue
    setLogoutCallback(logout);

    const init = async () => {
      try {
        const access = localStorage.getItem('accessToken');
        if (access) {
          try {
            const userData = await verifyToken();
            setUser({ token: access, ...userData });
          } catch {
            const refresh = localStorage.getItem('refreshToken');
            if (!refresh) throw new Error('No refresh token');
            const { data } = await api.post('/api/token/refresh/', { refresh });
            const newAccess = data.access, newRefresh = data.refresh;
            localStorage.setItem('accessToken', newAccess);
            if (newRefresh) localStorage.setItem('refreshToken', newRefresh);
            const userData2 = await verifyToken();
            setUser({ token: newAccess, ...userData2 });
          }
        }
      } catch {
        logout();
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
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
