// src/pages/PasswordResetPage.js
import React, { useState,useEffect  } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/apiUtils';
import { Mail, ArrowLeft, Send, Loader2 } from 'lucide-react';
import { passwordResetSchema } from '../validation/schemas';

const PasswordResetPage = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sentEmail, setSentEmail] = useState('');
  const [timer, setTimer] = useState(0);
  const [errors, setErrors] = useState({});
  const [showHelp, setShowHelp] = useState(false);
  const isValid = passwordResetSchema.isValidSync({ email });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    try {
      await passwordResetSchema.validate({ email }, { abortEarly: false });
    } catch (err) {
      setErrors({ email: err.message });
      return;
    }
    setIsLoading(true);

    try {
      await api.post('/api/signature/password-reset/', { email });
      alert('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
      setSentEmail(email);
      setTimer(60);
      setEmail('');
    } catch (err) {
      alert('Erreur lors de la demande.');
    } finally {
      setIsLoading(false);
    }
  };
useEffect(() => {
    if (!timer) return;
    const interval = setInterval(() => {
      setTimer((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [timer]);

  const handleResend = async () => {
    if (!sentEmail) return;
    setIsLoading(true);
    try {
      await api.post('/api/signature/password-reset/', { email: sentEmail });
      alert('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
      setTimer(60);
    } catch (err) {
      alert('Erreur lors de la demande.');
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-6 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <Mail className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Mot de passe oublié
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Entrez votre adresse email pour recevoir un lien de réinitialisation
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-6 px-4 shadow-xl sm:rounded-2xl sm:px-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Adresse email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setErrors({});
                  }}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                  placeholder="exemple@email.com"
                />
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Nous vous enverrons un lien sécurisé pour réinitialiser votre mot de passe.
              </p>
            </div>

            {/* Bouton d'envoi */}
            <div>
              <button
                type="submit"
                disabled={isLoading || !isValid}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg hover:shadow-xl"
              >
                {isLoading && (
                  <Loader2 className="absolute left-4 h-5 w-5 animate-spin" />
                )}
                {!isLoading && (
                  <Send className="absolute left-4 h-5 w-5" />
                )}
                {isLoading ? 'Envoi en cours...' : 'Envoyer le lien'}
              </button>
            </div>
          </form>
          {sentEmail && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading || timer > 0}
                className="w-full flex justify-center py-2 px-4 border border-blue-300 text-sm font-medium rounded-xl text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50"
              >
                Renvoyer l'email
              </button>
              {timer > 0 && (
                <p className="mt-2 text-xs text-gray-500 text-center">
                  Vous pourrez renvoyer l'email dans {timer}s
                </p>
              )}
            </div>
          )}

          {/* Aide */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowHelp((s) => !s)}
              className="text-sm font-medium text-blue-600 hover:text-blue-500"
            >
              Aide
            </button>
            {showHelp && (
              <div className="mt-2 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h3 className="text-sm font-medium text-blue-800 mb-2">Instructions</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Vérifiez votre dossier spam si vous ne recevez pas l'email</li>
                  <li>• Le lien est valable pendant 24 heures</li>
                  <li>• Contactez le support si vous rencontrez des difficultés</li>
                </ul>
              </div>
            )}
          </div>

          {/* Lien retour */}
          <div className="mt-6">
            <Link
              to="/login"
              className="group inline-flex items-center text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Retour à la connexion
            </Link>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          Besoin d'aide ? <a href="mailto:support@signature.com" className="text-blue-600 hover:text-blue-500">Contactez le support</a>
        </p>
      </div>
    </div>
  );
};

export default PasswordResetPage;