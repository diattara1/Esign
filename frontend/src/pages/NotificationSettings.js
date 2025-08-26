import React, { useEffect, useState } from 'react';
import { api } from '../services/apiUtils';
import logService from '../services/logService';
import { notificationSettingsSchema } from '../validation/schemas';

const NotificationSettings = () => {
  const [prefs, setPrefs] = useState({ email: true, sms: false, push: false });
  const [id, setId] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isValid = notificationSettingsSchema.isValidSync(prefs);

  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const { data } = await api.get('/api/signature/notifications/');
        if (data.length > 0) {
          setPrefs({ email: data[0].email, sms: data[0].sms, push: data[0].push });
          setId(data[0].id);
        }
      } catch (err) {
        logService.error(err);
      }
    };
    fetchPrefs();
  }, []);

  const handleChange = (e) => {
    const { name, checked } = e.target;
    setPrefs({ ...prefs, [name]: checked });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await notificationSettingsSchema.validate(prefs, { abortEarly: false });
    } catch (err) {
      setError(err.message);
      return;
    }
    try {
      if (id) {
        await api.put(`/api/signature/notifications/${id}/`, prefs);
      } else {
        const { data } = await api.post('/api/signature/notifications/', prefs);
        setId(data.id);
      }
      setMessage('Préférences mises à jour.');
    } catch (err) {
      setMessage('Erreur lors de la mise à jour.');
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold mb-6">Notifications</h2>
      {message && <div className="mb-4">{message}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="flex items-center">
          <input type="checkbox" name="email" checked={prefs.email} onChange={handleChange} className="mr-2" />
          Email
        </label>
        <label className="flex items-center">
          <input type="checkbox" name="sms" checked={prefs.sms} onChange={handleChange} className="mr-2" />
          SMS
        </label>
        <label className="flex items-center">
          <input type="checkbox" name="push" checked={prefs.push} onChange={handleChange} className="mr-2" />
          Push
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={!isValid} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed">Sauvegarder</button>
      </form>
    </div>
  );
};

export default NotificationSettings;
