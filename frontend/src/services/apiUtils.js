// src/servics/apiUtils.js
import axios from 'axios';
import createAuthRefreshInterceptor from 'axios-auth-refresh';
import { toast } from 'react-toastify';
import logService from './logService';
// URL de base de l'API Django
export const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error('REACT_APP_API_BASE_URL is not defined');
}

// Instance Axios principale
export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  withCredentials: true,
});

// Tentative de récupération du jeton CSRF depuis différents cookies
const CSRF_COOKIE_NAMES = ['csrftoken', 'CSRF-TOKEN', 'XSRF-TOKEN'];
export const getCSRFToken = () => {
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (CSRF_COOKIE_NAMES.includes(name)) {
      return decodeURIComponent(value);
    }
  }
  return null;
};


// Callback que l'on remplira depuis AuthContext.js
let logoutCallback = null;
export const setLogoutCallback = (cb) => {
  logoutCallback = cb;
};

// Logique de refresh à déclencher sur 401
const refreshAuthLogic = (failedRequest) => {
  const url = failedRequest.response?.config?.url;

  // Ne pas essayer de rafraîchir pour /api/verify-token/
  if (url && url.includes('/api/verify-token/')) {
    // Ne déclenche PAS le logout ici : on laisse le contexte gérer ça
    return Promise.reject(failedRequest);
  }

  // Rafraîchit le token pour les autres cas (401)
  return axios
    .post(`${API_BASE_URL}/api/token/refresh/`, {}, { withCredentials: true })
    .then(() => Promise.resolve())
    .catch(err => {
      if (logoutCallback) logoutCallback();  // Déconnecte si le refresh échoue
      return Promise.reject(err);
    });
};


// Monte l'intercepteur de refresh AVANT tout autre intercepteur de réponse
createAuthRefreshInterceptor(api, refreshAuthLogic);

// Intercepteur de requête : ajuste le Content-Type pour FormData
api.interceptors.request.use(
  config => {
    if (config.data instanceof FormData) {
      // Laisse le navigateur gérer le Content-Type
      delete config.headers['Content-Type'];
    }

    const method = config.method ? config.method.toLowerCase() : '';
    if (['post', 'put', 'patch', 'delete'].includes(method)) {
      const token = getCSRFToken();
      if (token) {
        config.headers['X-CSRFToken'] = token;
      }
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
        toast.error('Erreur réseau ou serveur injoignable');
      logService.error('Network error or backend unreachable');
    } else if (error.response.status === 403) {
      console.warn('Access denied (403).');
    } else if (error.response.status >= 500) {
      logService.error('Server error:', error.response.data);
    }
    return Promise.reject(error);
  }
);

// Petit helper pour vérifier / récupérer les données user via /api/verify-token/
export const verifyToken = async () => {
  const response = await api.get('/api/verify-token/');
  return response.data;
};
