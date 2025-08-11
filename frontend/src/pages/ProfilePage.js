import React, { useEffect, useState } from 'react';
import { api, API_BASE_URL } from '../services/apiUtils';

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
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get('/api/signature/profile/');
        setProfile(res.data);
        if (res.data.avatar) {
          setAvatarPreview(`${API_BASE_URL}${res.data.avatar}`);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchProfile();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProfile((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setProfile((prev) => ({ ...prev, avatar: file }));
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    Object.entries(profile).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    });
    try {
      const res = await api.put('/api/signature/profile/', formData);
      setMessage('Profil mis à jour');
      if (res.data.avatar) {
        setAvatarPreview(`${API_BASE_URL}${res.data.avatar}`);
      }
    } catch (err) {
      setMessage("Erreur lors de la mise à jour");
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Mon profil</h2>
      {message && <div className="mb-4 text-center">{message}</div>}
      <form onSubmit={handleSubmit} className="space-y-4" encType="multipart/form-data">
        <div>
          <label className="block text-sm font-medium text-gray-700">Nom d'utilisateur</label>
          <input
            type="text"
            name="username"
            value={profile.username || ''}
            disabled
            className="w-full border border-gray-300 rounded px-3 py-2 bg-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            name="email"
            value={profile.email || ''}
            disabled
            className="w-full border border-gray-300 rounded px-3 py-2 bg-gray-100"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Prénom</label>
            <input
              type="text"
              name="first_name"
              value={profile.first_name || ''}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Nom</label>
            <input
              type="text"
              name="last_name"
              value={profile.last_name || ''}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Date de naissance</label>
          <input
            type="date"
            name="birth_date"
            value={profile.birth_date || ''}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Téléphone</label>
          <input
            type="text"
            name="phone_number"
            value={profile.phone_number || ''}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Genre</label>
          <select
            name="gender"
            value={profile.gender || ''}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          >
            <option value="">Sélectionnez</option>
            <option value="Homme">Homme</option>
            <option value="Femme">Femme</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Adresse</label>
          <textarea
            name="address"
            value={profile.address || ''}
            onChange={handleChange}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Avatar</label>
          {avatarPreview && (
            <img
              src={avatarPreview}
              alt="Avatar"
              className="h-16 w-16 rounded-full mb-2 object-cover"
            />
          )}
          <input type="file" name="avatar" accept="image/*" onChange={handleFileChange} />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Enregistrer
        </button>
      </form>
    </div>
  );
};

export default ProfilePage;

