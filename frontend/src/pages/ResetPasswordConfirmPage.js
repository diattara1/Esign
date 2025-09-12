import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import signatureService from '../services/signatureService';
import { Eye, EyeOff } from 'lucide-react';
import { passwordChangeSchema } from '../validation/schemas';

const ResetPasswordConfirmPage = () => {
  const { uid, token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const newErrors = {};
    try {
      passwordChangeSchema.fields.new_password.validateSync(password);
    } catch (err) {
      newErrors.password = err.message;
    }
    if (password !== confirm) {
      newErrors.confirm = 'Les mots de passe ne correspondent pas.';
    }
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

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

  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);
    try {
      passwordChangeSchema.fields.new_password.validateSync(value);
      setErrors((prev) => ({ ...prev, password: undefined }));
    } catch (err) {
      setErrors((prev) => ({ ...prev, password: err.message }));
    }
    if (confirm && value !== confirm) {
      setErrors((prev) => ({ ...prev, confirm: 'Les mots de passe ne correspondent pas.' }));
    } else {
      setErrors((prev) => ({ ...prev, confirm: undefined }));
    }
  };

  const handleConfirmChange = (e) => {
    const value = e.target.value;
    setConfirm(value);
    if (password && value !== password) {
      setErrors((prev) => ({ ...prev, confirm: 'Les mots de passe ne correspondent pas.' }));
    } else {
      setErrors((prev) => ({ ...prev, confirm: undefined }));
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
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="w-full border rounded px-3 py-2 pr-10"
              value={password}
              onChange={handlePasswordChange}
              autoComplete="new-password"
              required
              minLength={5}
              aria-describedby={errors.password ? 'password-error' : undefined}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-500" />
              ) : (
                <Eye className="h-5 w-5 text-gray-500" />
              )}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1 text-sm text-red-600">{errors.password}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Confirmer le mot de passe</label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              className="w-full border rounded px-3 py-2 pr-10"
              value={confirm}
              onChange={handleConfirmChange}
              autoComplete="new-password"
              required
              minLength={5}
              aria-describedby={errors.confirm ? 'confirm-error' : undefined}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 px-3 flex items-center"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            >
              {showConfirm ? (
                <EyeOff className="h-5 w-5 text-gray-500" />
              ) : (
                <Eye className="h-5 w-5 text-gray-500" />
              )}
            </button>
          </div>
          {errors.confirm && (
            <p id="confirm-error" className="mt-1 text-sm text-red-600">{errors.confirm}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting || !password || !confirm || errors.password || errors.confirm}
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
