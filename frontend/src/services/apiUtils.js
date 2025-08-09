// src/apiUtils.js
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';

// URL de base de l'API Django
export const API_BASE_URL = 'http://localhost:8000';

// Instance Axios principale
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Callback que l'on remplira depuis AuthContext.js
let logoutCallback = null;
export const setLogoutCallback = (cb) => {
  logoutCallback = cb;
};

// Logique de refresh à déclencher sur 401
const refreshAuthLogic = (failedRequest) => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) {
    // plus rien à faire, on déconnecte
    if (logoutCallback) logoutCallback();
    return Promise.reject(new Error('No refresh token'));
  }
  // Attention : on utilise axios brut pour ne pas ré-intercepter cette requête
  return axios
    .post(`${API_BASE_URL}/api/token/refresh/`, { refresh: refreshToken })
    .then(resp => {
      const { access, refresh } = resp.data;
      localStorage.setItem('accessToken', access);
      if (refresh) localStorage.setItem('refreshToken', refresh);
      // On met à jour le header de la requête en échec et on la relance
      failedRequest.response.config.headers['Authorization'] = `Bearer ${access}`;
      return Promise.resolve();
    })
    .catch(err => {
      // Si le refresh échoue, on logout
      if (logoutCallback) logoutCallback();
      return Promise.reject(err);
    });
};

// Monte l'intercepteur de refresh AVANT tout autre intercepteur de réponse
createAuthRefreshInterceptor(api, refreshAuthLogic);

// Intercepteur de requête : ajoute automatiquement le Bearer token
api.interceptors.request.use(
  config => {
    if (config.data instanceof FormData) {
      // Laisse le navigateur gérer le Content-Type
      delete config.headers['Content-Type'];
    }
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

// Intercepteur de réponse : gère les autres erreurs (403, 5xx, network)
api.interceptors.response.use(
  response => response,
  error => {
    if (!error.response) {
      console.error('Network error or backend unreachable');
    } else if (error.response.status === 403) {
      console.warn('Access denied (403).');
    } else if (error.response.status >= 500) {
      console.error('Server error:', error.response.data);
    }
    return Promise.reject(error);
  }
);

// Petit helper pour vérifier / récupérer les données user via /api/verify-token/
export const verifyToken = async () => {
  const response = await api.get('/api/verify-token/');
  return response.data;
};
