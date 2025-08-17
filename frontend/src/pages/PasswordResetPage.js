// src/pages/PasswordResetPage.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/apiUtils';
import { Mail, ArrowLeft, CheckCircle, XCircle, Send, Loader2 } from 'lucide-react';

const PasswordResetPage = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);
    
    try {
      await api.post('/api/signature/password-reset/', { email });
      setMessage('Si un compte existe pour cet email, un lien de réinitialisation a été envoyé.');
      setIsSuccess(true);
      setEmail('');
    } catch (err) {
      setMessage('Erreur lors de la demande.');
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
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
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">
          {/* Message de statut */}
          {message && (
            <div className={`mb-6 p-4 rounded-xl flex items-start space-x-3 ${
              isSuccess 
                ? 'bg-green-50 border border-green-200' 
                : 'bg-red-50 border border-red-200'
            }`}>
              {isSuccess ? (
                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              )}
              <div>
                <p className={`text-sm font-medium ${
                  isSuccess ? 'text-green-800' : 'text-red-800'
                }`}>
                  {isSuccess ? 'Email envoyé' : 'Erreur'}
                </p>
                <p className={`text-sm ${
                  isSuccess ? 'text-green-700' : 'text-red-700'
                }`}>
                  {message}
                </p>
              </div>
            </div>
          )}

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
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                  placeholder="exemple@email.com"
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Nous vous enverrons un lien sécurisé pour réinitialiser votre mot de passe.
              </p>
            </div>

            {/* Bouton d'envoi */}
            <div>
              <button
                type="submit"
                disabled={isLoading}
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

          {/* Instructions supplémentaires */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <h3 className="text-sm font-medium text-blue-800 mb-2">
              Instructions
            </h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Vérifiez votre dossier spam si vous ne recevez pas l'email</li>
              <li>• Le lien est valable pendant 24 heures</li>
              <li>• Contactez le support si vous rencontrez des difficultés</li>
            </ul>
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