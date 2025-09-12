// src/pages/RegisterPage.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/apiUtils';
import {
  User, Mail, Lock, Eye, EyeOff, Calendar, Phone, MapPin,
  Upload, UserPlus, ArrowLeft, CheckCircle, XCircle, Loader2,
  Check
} from 'lucide-react';
import { registerStep1Schema, registerStep2Schema } from '../validation/schemas';

const RegisterPage = () => {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    first_name: '',
    last_name: '',
    birth_date: '',
    phone_number: '',
    gender: '',
    address: '',
    avatar: null,
  });
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [avatarPreview, setAvatarPreview] = useState(null);
   const [isResendDisabled, setIsResendDisabled] = useState(false);
  const isStep1Valid = registerStep1Schema.isValidSync(form);
  const isStep2Valid = registerStep2Schema.isValidSync(form);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setForm((prev) => ({ ...prev, avatar: file }));
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
    }
  };
const handleStep2Blur = async (e) => {
  const { name } = e.target;

  const step1Fields = new Set(['username', 'email', 'password']);
  const schema = step1Fields.has(name) ? registerStep1Schema : registerStep2Schema;

  try {
    await schema.validateAt(name, form);
    setErrors((prev) => ({ ...prev, [name]: null }));
  } catch (err) {
    setErrors((prev) => ({ ...prev, [name]: err.message }));
  }
};
  const validateStep1 = async () => {
    try {
      await registerStep1Schema.validate(form, { abortEarly: false });
      setErrors({});
      return true;
    } catch (err) {
      const stepErrors = {};
      err.inner.forEach((e) => {
        stepErrors[e.path] = e.message;
      });
      setErrors(stepErrors);
      return false;
    }
  };

  const handleNext = async () => {
    if (await validateStep1()) {
      setCurrentStep(2);
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.getElementById('id-titre-etape2')?.focus();
      }, 0);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setErrors({});
    try {
      await registerStep2Schema.validate(form, { abortEarly: false });
    } catch (err) {
      const stepErrors = {};
      err.inner.forEach((e) => {
        stepErrors[e.path] = e.message;
      });
      setErrors(stepErrors);
      return;
    }
    setIsLoading(true);
    
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value) data.append(key, value);
      });
      await api.post('/api/signature/register/', data);
      setSuccess(true);
    } catch (err) {
      if (err.response?.data) {
        setErrors(err.response.data);
      } else {
        setMessage("Erreur lors de l'inscription.");
      }
    } finally {
      setIsLoading(false);
    }
  };
const handleResendEmail = async () => {
    if (isResendDisabled) return;
    setIsResendDisabled(true);
    try {
      await api.post('/api/signature/register/resend/', { email: form.email });
    } catch (err) {
      console.error('Erreur lors de la réexpédition de l\'email', err);
    }
  };
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-100 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100 text-center">
            <div className="mx-auto h-16 w-16 bg-green-500 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Inscription réussie !
            </h2>
            <p className="text-gray-600 mb-6">
              Un email de confirmation a été envoyé à votre adresse.
              Vérifiez votre boîte mail pour activer votre compte.
            </p>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Vous n'avez pas reçu l'email ? Vérifiez vos spams.
              </p>
               <button
                type="button"
                onClick={handleResendEmail}
                disabled={isResendDisabled}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white transition-colors shadow-lg ${
                  isResendDisabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Renvoyer l'email
              </button>
              <Link
                to="/login"
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-lg"
              >
                Aller à la connexion
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const errorMessages = Object.values(errors).flat().filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-100 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <UserPlus className="h-6 w-6 text-white" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">
            Créer un compte
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Rejoignez notre plateforme de signature électronique
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            <div className={`flex items-center ${currentStep >= 1 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
              </div>
              <span className="ml-2 text-sm font-medium">Compte</span>
            </div>
            <div className={`w-16 h-0.5 ${currentStep > 1 ? 'bg-blue-600' : 'bg-gray-200'}`} />
            <div className={`flex items-center ${currentStep >= 2 ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-200'
              }`}>
                2
              </div>
              <span className="ml-2 text-sm font-medium">Profil</span>
            </div>
          </div>
        </div>

        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-gray-100">
          {/* Messages d'erreur */}
          {message && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3">
              <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700">{message}</p>
            </div>
          )}

          {errorMessages.length > 0 && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-start space-x-3">
                <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Erreurs de validation</p>
                  <ul className="mt-1 text-sm text-red-700 space-y-1">
                    {errorMessages.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} encType="multipart/form-data">
            {currentStep === 1 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Informations de connexion</h3>
                
                {/* Username & Email */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                      Nom d'utilisateur *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="username"
                        type="text"
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="Nom d'utilisateur"
                        aria-describedby={errors.username ? 'username-error' : undefined}
                      />
                      {errors.username && (
                        <p id="username-error" className="mt-1 text-sm text-red-600">{errors.username}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="exemple@email.com"
                        aria-describedby={errors.email ? 'email-error' : undefined}
                      />
                      {errors.email && (
                        <p id="email-error" className="mt-1 text-sm text-red-600">{errors.email}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                    Mot de passe *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        value={form.password}
                        onChange={handleChange}
                        onBlur={handleStep2Blur}
                        className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="Minimum 5 caractères"
                        aria-describedby={errors.password ? 'password-error' : undefined}
                      />
                      {errors.password && (
                        <p id="password-error" className="mt-1 text-sm text-red-600">{errors.password}</p>
                      )}
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                      )}
                    </button>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Le mot de passe doit contenir au moins 8 caractères
                  </p>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!isStep1Valid}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="flex items-center justify-between"><h3 id="id-titre-etape2" className="text-lg font-medium text-gray-900">Informations personnelles</h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-500"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    Retour
                  </button>
                </div>

                {/* Nom & Prénom */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="first_name" className="block text-sm font-medium text-gray-700 mb-2">
                      Prénom
                    </label>
                    <input
                      id="first_name"
                      type="text"
                      name="first_name"
                      value={form.first_name}
                      onChange={handleChange}
                      onBlur={handleStep2Blur}
                      className="block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="Votre prénom"
                      aria-describedby={errors.first_name ? 'first_name-error' : undefined}
                    />
                    {errors.first_name && (
                      <p id="first_name-error" className="mt-1 text-sm text-red-600">{errors.first_name}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="last_name" className="block text-sm font-medium text-gray-700 mb-2">
                      Nom
                    </label>
                    <input
                      id="last_name"
                      type="text"
                      name="last_name"
                      value={form.last_name}
                      onChange={handleChange}
                      onBlur={handleStep2Blur}
                      className="block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="Votre nom"
                      aria-describedby={errors.last_name ? 'last_name-error' : undefined}
                    />
                    {errors.last_name && (
                      <p id="last_name-error" className="mt-1 text-sm text-red-600">{errors.last_name}</p>
                    )}
                  </div>
                </div>

                {/* Date de naissance & Téléphone */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="birth_date" className="block text-sm font-medium text-gray-700 mb-2">
                      Date de naissance
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Calendar className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="birth_date"
                        type="date"
                        name="birth_date"
                        value={form.birth_date}
                        onChange={handleChange}
                        onBlur={handleStep2Blur}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        aria-describedby={errors.birth_date ? 'birth_date-error' : undefined}
                      />
                      {errors.birth_date && (
                        <p id="birth_date-error" className="mt-1 text-sm text-red-600">{errors.birth_date}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-2">
                      Téléphone
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Phone className="h-5 w-5 text-gray-400" />
                      </div>
                      <input
                        id="phone_number"
                        type="text"
                        name="phone_number"
                        value={form.phone_number}
                        onChange={handleChange}
                        className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                        placeholder="77 259 39 94"
                      />
                    </div>
                  </div>
                </div>

                {/* Genre */}
                <div>
                  <label htmlFor="gender" className="block text-sm font-medium text-gray-700 mb-2">
                    Genre
                  </label>
                  <select
                    id="gender"
                    name="gender"
                    value={form.gender}
                    onChange={handleChange}
                    className="block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                  >
                    <option value="">Sélectionnez</option>
                    <option value="Homme">Homme</option>
                    <option value="Femme">Femme</option>
                  </select>
                </div>

                {/* Adresse */}
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-2">
                    Adresse
                  </label>
                  <div className="relative">
                    <div className="absolute top-3 left-3 flex items-center pointer-events-none">
                      <MapPin className="h-5 w-5 text-gray-400" />
                    </div>
                    <textarea
                      id="address"
                      name="address"
                      rows={3}
                      value={form.address}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors resize-none"
                      placeholder="Votre adresse complète"
                    />
                  </div>
                </div>

                {/* Avatar */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Photo de profil
                  </label>
                  <div className="flex items-center space-x-4">
                    {avatarPreview && (
                      <div className="flex-shrink-0">
                        <img
                          src={avatarPreview}
                          alt="Aperçu"
                          className="h-16 w-16 rounded-full object-cover border-2 border-gray-200"
                        />
                      </div>
                    )}
                    <div className="flex-1">
                      <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                        <Upload className="h-4 w-4 mr-2" />
                        Choisir une photo
                        <input
                          type="file"
                          name="avatar"
                          onChange={handleFileChange}
                          accept="image/*"
                          className="sr-only"
                        />
                      </label>
                      <p className="mt-1 text-sm text-gray-500">
                        PNG, JPG jusqu'à 5MB (optionnel)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Précédent
                  </button>
                  <button
                    type="submit"
                    disabled={isLoading || !isStep2Valid}
                    className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                  >
                    {isLoading && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {isLoading ? 'Inscription...' : 'Créer mon compte'}
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Lien vers connexion */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-600">
              Vous avez déjà un compte ?{' '}
              <Link
                to="/login"
                className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
              >
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8 text-center">
        <p className="text-sm text-gray-500">
          En créant un compte, vous acceptez nos{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500">conditions d'utilisation</a>
          {' '}et notre{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500">politique de confidentialité</a>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;