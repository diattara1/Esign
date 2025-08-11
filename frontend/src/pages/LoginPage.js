// src/pages/LoginPage.js
import React, { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useLocation } from 'react-router-dom';

const LoginPage = () => {
  const { login, isLoading } = useAuth();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const activated = params.get('activated');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    // Appel de login(username, password) qui renvoie true ou false
    const success = await login(username, password);
    if (!success) {
      setError('Nom d’utilisateur ou mot de passe incorrect.');
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded shadow-md w-full max-w-md"
      >
        <h2 className="text-2xl font-bold mb-6 text-center">Connexion</h2>

        {activated === '1' && (
          <div className="mb-4 text-green-600">Compte activé. Veuillez vous connecter.</div>
        )}
        {activated === '0' && (
          <div className="mb-4 text-red-500">Lien d'activation invalide.</div>
        )}
        {error && <div className="text-red-500 mb-4">{error}</div>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">
            Nom d’utilisateur
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700">
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
