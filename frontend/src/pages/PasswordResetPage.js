import React, { useState } from 'react';
import { api } from '../services/apiUtils';

const PasswordResetPage = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await api.post('/api/signature/password-reset/', { email });
      setMessage('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
      setEmail('');
    } catch (err) {
      setMessage('Erreur lors de la demande.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center">Mot de passe oublié</h2>
        {message && <div className="mb-4 text-center">{message}</div>}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700">
          Envoyer
        </button>
      </form>
    </div>
  );
};

export default PasswordResetPage;