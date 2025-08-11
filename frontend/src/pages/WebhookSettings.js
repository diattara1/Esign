import React, { useEffect, useState } from 'react';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';

const events = [
  { value: 'envelope_sent', label: 'Enveloppe envoyée' },
  { value: 'envelope_signed', label: 'Enveloppe signée' },
  { value: 'envelope_cancelled', label: 'Enveloppe annulée' },
];

const WebhookSettings = () => {
  const [endpoints, setEndpoints] = useState([]);
  const [form, setForm] = useState({ url: '', event: 'envelope_sent', secret: '' });

  const loadEndpoints = async () => {
    try {
      const data = await signatureService.getWebhooks();
      setEndpoints(data);
    } catch (e) {
      console.error(e);
      toast.error('Erreur de chargement des webhooks');
    }
  };

  useEffect(() => {
    loadEndpoints();
  }, []);

  const handleChange = e => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await signatureService.createWebhook(form);
      toast.success('Webhook ajouté');
      setForm({ url: '', event: 'envelope_sent', secret: '' });
      loadEndpoints();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la création du webhook');
    }
  };

  const toggleActive = async wh => {
    try {
      await signatureService.updateWebhook(wh.id, { active: !wh.active });
      loadEndpoints();
    } catch (err) {
      toast.error('Erreur lors de la mise à jour');
    }
  };

  const deleteWebhook = async id => {
    if (!window.confirm('Supprimer ce webhook ?')) return;
    try {
      await signatureService.deleteWebhook(id);
      loadEndpoints();
    } catch (err) {
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-6">Webhooks</h1>

      <form onSubmit={handleSubmit} className="space-y-4 mb-8">
        <div>
          <label className="block text-sm font-medium mb-1">URL</label>
          <input
            name="url"
            value={form.url}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Événement</label>
          <select
            name="event"
            value={form.event}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          >
            {events.map(ev => (
              <option key={ev.value} value={ev.value}>
                {ev.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Secret (optionnel)</label>
          <input
            name="secret"
            value={form.secret}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded"
          />
        </div>
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          Ajouter
        </button>
      </form>

      <ul className="space-y-4">
        {endpoints.map(wh => (
          <li
            key={wh.id}
            className="p-4 border rounded flex justify-between items-center"
          >
            <div>
              <p className="font-medium">{wh.url}</p>
              <p className="text-sm text-gray-600">{wh.event}</p>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => toggleActive(wh)}
                className={`px-2 py-1 rounded text-sm ${wh.active ? 'bg-green-200' : 'bg-gray-200'}`}
              >
                {wh.active ? 'Actif' : 'Inactif'}
              </button>
              <button
                onClick={() => deleteWebhook(wh.id)}
                className="px-2 py-1 rounded text-sm bg-red-200"
              >
                Supprimer
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default WebhookSettings;

