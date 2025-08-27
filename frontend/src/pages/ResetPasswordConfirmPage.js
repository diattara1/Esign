import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import signatureService from '../services/signatureService';

const ResetPasswordConfirmPage = () => {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!password || password.length < 5) {
      setMessage('Le mot de passe doit contenir au moins 5 caractères.');
      return;
    }
    if (password !== confirm) {
      setMessage('Les mots de passe ne correspondent pas.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      await signatureService.changePassword(uid, token, password);
      navigate('/login?reset=1', { replace: true });
    } catch (err) {
      setMessage(err?.message || 'Impossible de changer le mot de passe. Le lien est peut-être expiré.');
    } finally {
      setSubmitting(false);
    }
  };


  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-4">Définir un nouveau mot de passe</h1>
      <p className="text-sm text-gray-600 mb-6">
        Choisissez un mot de passe fort. Si le lien est invalide ou expiré, recommencez la procédure “mot de passe oublié”.
      </p>

      {message && (
        <div className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">
          {message}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Nouveau mot de passe</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={5}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Confirmer le mot de passe</label>
          <input
            type="password"
            className="w-full border rounded px-3 py-2"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            minLength={5}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black text-white py-2 disabled:opacity-60"
        >
          {submitting ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
        </button>
      </form>

      <div className="mt-4 text-sm">
        <Link to="/password-reset" className="text-blue-600 underline">
          Recommencer la procédure
        </Link>
      </div>
    </div>
  );
};

export default ResetPasswordConfirmPage;
