// src/pages/ProfilePage.js
import React, { useEffect, useState, useRef } from 'react';
import { api, API_BASE_URL } from '../services/apiUtils';
import logService from '../services/logService';
import {
  User, Mail, Calendar, Phone, MapPin, Upload, Eye, EyeOff,
  Save, Lock, CheckCircle, XCircle, Camera, Edit3, Shield
} from 'lucide-react';
import PasswordStrengthIndicator from '../components/PasswordStrengthIndicator';
import { profileSchema, passwordChangeSchema } from '../validation/schemas';

const ProfilePage = () => {
  const [profile, setProfile] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    birth_date: '',
    phone_number: '',
    gender: '',
    address: '',
    avatar: null,
  });
  const [avatarPreview, setAvatarPreview] = useState(null);
    const [avatarObjectUrl, setAvatarObjectUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordData, setPasswordData] = useState({
    old_password: '',
    new_password: '',
  });
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [pwdErrors, setPwdErrors] = useState({});
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const profileTitleRef = useRef(null);
  const passwordTitleRef = useRef(null);
  const isProfileValid = profileSchema.isValidSync(profile);
  const isPwdValid = passwordChangeSchema.isValidSync(passwordData);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/api/signature/profile/');
        setProfile(res.data);
        if (res.data.avatar) {
          setAvatarPreview(`${API_BASE_URL}${res.data.avatar}`);
        }
      } catch (err) {
        logService.error(err);
      }
    };
    fetchProfile();
  }, []);
useEffect(() => {
    return () => {
      if (avatarObjectUrl) {
        URL.revokeObjectURL(avatarObjectUrl);
      }
    };
  }, [avatarObjectUrl]);
  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Réinitialiser l'erreur précédente
    setErrors((prev) => ({ ...prev, avatar: undefined }));

    // Validation du type et de la taille du fichier (< 5MB)
    if (!file.type.startsWith('image/')) {
      setErrors((prev) => ({ ...prev, avatar: 'Seuls les fichiers image sont autorisés' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, avatar: "La taille de l'image doit être inférieure à 5MB" }));
      return;
    }
    setProfile((prev) => ({ ...prev, avatar: file }));
    if (avatarObjectUrl) {
      URL.revokeObjectURL(avatarObjectUrl);
    }
     const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
    setAvatarObjectUrl(objectUrl);
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    if (pwdErrors[name]) {
      setPwdErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwdMessage('');
    setPwdErrors({});
    try {
      await passwordChangeSchema.validate(passwordData, { abortEarly: false });
    } catch (err) {
      const newErrors = {};
      err.inner.forEach((e) => {
        newErrors[e.path] = e.message;
      });
      setPwdErrors(newErrors);
      return;
    }
    setPwdLoading(true);

    try {
      await api.post('/api/signature/change-password/', passwordData);
      setPwdMessage('Mot de passe mis à jour avec succès');
      setPasswordData({ old_password: '', new_password: '' });
    } catch (err) {
      setPwdMessage('Erreur lors du changement de mot de passe');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setErrors({});
    try {
      await profileSchema.validate(profile, { abortEarly: false });
    } catch (err) {
      const newErrors = {};
      err.inner.forEach((e) => {
        newErrors[e.path] = e.message;
      });
      setErrors(newErrors);
      return;
    }
    setIsLoading(true);
    setUploadProgress(0);
    const formData = new FormData();
    Object.entries(profile).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });
    
    try {
      const res = await api.put('/api/signature/profile/', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            setUploadProgress(percent);
          }
        },
      });
      setMessage('Profil mis à jour avec succès');
      if (res.data.avatar) {
        if (avatarObjectUrl) {
          URL.revokeObjectURL(avatarObjectUrl);
          setAvatarObjectUrl(null);
        }
        setAvatarPreview(`${API_BASE_URL}${res.data.avatar}`);
      }
    } catch (err) {
      setMessage("Erreur lors de la mise à jour du profil");
    } finally {
      setIsLoading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-2xl mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-8">
            <div className="flex items-center space-x-4">
              <div className="relative">
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar"
                    className="h-20 w-20 rounded-full object-cover border-4 border-white shadow-lg"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-white/20 border-4 border-white flex items-center justify-center">
                    <User className="h-8 w-8 text-white" />
                  </div>
                )}
                <div className="absolute -bottom-2 -right-2 bg-blue-500 rounded-full p-2 border-2 border-white">
                  <Camera className="h-4 w-4 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-white">
                  {profile.first_name && profile.last_name 
                    ? `${profile.first_name} ${profile.last_name}` 
                    : profile.username}
                </h1>
                <p className="text-blue-100 mt-1">{profile.email}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex px-6">
              <button
                onClick={() => {
                  setActiveTab('profile');
                  setTimeout(() => profileTitleRef.current?.focus(), 0);
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'profile'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <User className="inline h-4 w-4 mr-2" />
                Informations personnelles
              </button>
              <button
                onClick={() => {
                  setActiveTab('password');
                  setTimeout(() => passwordTitleRef.current?.focus(), 0);
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'password'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Shield className="inline h-4 w-4 mr-2" />
                Sécurité
              </button>
            </nav>
            <div aria-live="polite" className="sr-only">
              {activeTab === 'profile'
                ? 'Onglet informations personnelles actif'
                : 'Onglet sécurité actif'}
            </div>
          </div>
        </div>

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="bg-white shadow-sm rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2
                ref={profileTitleRef}
                tabIndex={-1}
                className="text-xl font-semibold text-gray-900"
              >
                Modifier mon profil
              </h2><Edit3 className="h-5 w-5 text-gray-400" />
            </div>

            {/* Message de statut */}
            {message && (
              <div className={`mb-6 p-4 rounded-xl flex items-start space-x-3 ${
                message.includes('succès') 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                {message.includes('succès') ? (
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <p className={`text-sm ${
                  message.includes('succès') ? 'text-green-700' : 'text-red-700'
                }`}>
                  {message}
                </p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6" encType="multipart/form-data">
              {/* Photo de profil */}
              <div className="flex items-center space-x-6">
                <div className="flex-shrink-0">
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="h-24 w-24 rounded-full object-cover border-4 border-gray-200"
                    />
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-gray-100 border-4 border-gray-200 flex items-center justify-center">
                      <User className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                    <Upload className="h-4 w-4 mr-2" />
                    Changer la photo
                    <input
                      type="file"
                      name="avatar"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="sr-only"
                    />
                  </label>
                  <p className="mt-2 text-sm text-gray-500">
                    JPG, PNG jusqu'à 5MB. Recommandé: 400x400px
                  </p>
                   {errors.avatar && (
                    <p className="mt-1 text-sm text-red-600">{errors.avatar}</p>
                  )}
                  {uploadProgress > 0 && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">{uploadProgress}%</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Informations de connexion (lecture seule) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom d'utilisateur
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="text"
                      name="username"
                      value={profile.username || ''}
                      disabled
                      className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 sm:text-sm"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="email"
                      name="email"
                      value={profile.email || ''}
                      disabled
                      className="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl bg-gray-50 text-gray-500 sm:text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Informations personnelles */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Prénom
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={profile.first_name || ''}
                    onChange={handleChange}
                    className="block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="Votre prénom"
                  />
                  {errors.first_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.first_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={profile.last_name || ''}
                    onChange={handleChange}
                    className="block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="Votre nom"
                  />
                  {errors.last_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.last_name}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date de naissance
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Calendar className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      name="birth_date"
                      value={profile.birth_date || ''}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Téléphone
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="tel"
                      inputMode="tel"
                      name="phone_number"
                      value={profile.phone_number || ''}
                      onChange={handleChange}
                      className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                      placeholder="77 259 39 94"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Genre
                </label>
                <select
                  name="gender"
                  value={profile.gender || ''}
                  onChange={handleChange}
                  className="block w-full px-3 py-3 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                >
                  <option value="">Sélectionnez</option>
                  <option value="Homme">Homme</option>
                  <option value="Femme">Femme</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adresse
                </label>
                <div className="relative">
                  <div className="absolute top-3 left-3 flex items-center pointer-events-none">
                    <MapPin className="h-5 w-5 text-gray-400" />
                  </div>
                  <textarea
                    name="address"
                    rows={3}
                    value={profile.address || ''}
                    onChange={handleChange}
                    className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors resize-none"
                    placeholder="Votre adresse complète"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={isLoading || !isProfileValid}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isLoading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Password Tab */}
        {activeTab === 'password' && (
          <div className="bg-white shadow-sm rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                 <h2
                  ref={passwordTitleRef}
                  tabIndex={-1}
                  className="text-xl font-semibold text-gray-900"
                >
                  Changer le mot de passe
                </h2><p className="text-sm text-gray-500 mt-1">
                  Assurez-vous d'utiliser un mot de passe fort et unique
                </p>
              </div>
              <Lock className="h-5 w-5 text-gray-400" />
            </div>

            {/* Message de statut */}
            {pwdMessage && (
              <div className={`mb-6 p-4 rounded-xl flex items-start space-x-3 ${
                pwdMessage.includes('succès') 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                {pwdMessage.includes('succès') ? (
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <p className={`text-sm ${
                  pwdMessage.includes('succès') ? 'text-green-700' : 'text-red-700'
                }`}>
                  {pwdMessage}
                </p>
              </div>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Mot de passe actuel
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    name="old_password"
                    value={passwordData.old_password}
                    onChange={handlePasswordChange}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="Entrez votre mot de passe actuel"
                  />
                  {pwdErrors.old_password && (
                    <p className="mt-1 text-sm text-red-600">{pwdErrors.old_password}</p>
                  )}
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowOldPassword(!showOldPassword)}
                    aria-pressed={showOldPassword}
                    aria-label={showOldPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showOldPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    name="new_password"
                    value={passwordData.new_password}
                    onChange={handlePasswordChange}
                    className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-xl shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
                    placeholder="Entrez votre nouveau mot de passe"
                  />
                  {pwdErrors.new_password && (
                    <p className="mt-1 text-sm text-red-600">{pwdErrors.new_password}</p>
                  )}
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    aria-pressed={showNewPassword}
                    aria-label={showNewPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    ) : (
                      <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                </div>
                <PasswordStrengthIndicator password={passwordData.new_password} />
                <p className="mt-2 text-sm text-gray-500">
                  Le mot de passe doit contenir au moins 5 caractères
                </p>
              </div>

              {/* Conseils de sécurité */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h3 className="text-sm font-medium text-blue-800 mb-2">
                  Conseils pour un mot de passe sécurisé
                </h3>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Au moins 8 caractères</li>
                  <li>• Mélange de lettres majuscules et minuscules</li>
                  <li>• Inclure des chiffres et des caractères spéciaux</li>
                  <li>• Éviter les informations personnelles</li>
                </ul>
              </div>

              <div className="flex justify-end pt-6 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={pwdLoading || !isPwdValid}
                  className="inline-flex items-center px-6 py-3 border border-transparent text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                >
                  <Shield className="h-4 w-4 mr-2" />
                  {pwdLoading ? 'Modification...' : 'Modifier le mot de passe'}
                </button>
              </div>
            </form>
          </div>
        )}


        {/* Actions supplémentaires */}
        <div className="bg-white shadow-sm rounded-2xl p-6 mt-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Actions du compte</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border border-gray-200 rounded-xl">
              <div>
                <h4 className="font-medium text-gray-900">Exporter mes données</h4>
                <p className="text-sm text-gray-500">Télécharger une copie de toutes vos données</p>
              </div>
              <button className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                Exporter
              </button>
            </div>
            
            <div className="flex items-center justify-between p-4 border border-red-200 rounded-xl bg-red-50">
              <div>
                <h4 className="font-medium text-red-900">Supprimer le compte</h4>
                <p className="text-sm text-red-700">Cette action est irréversible</p>
              </div>
              <button className="inline-flex items-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-xl text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;