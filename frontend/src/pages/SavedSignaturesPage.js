import React, { useEffect, useState } from 'react';
import SignaturePadComponent from '../components/SignaturePadComponent';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { api } from '../services/apiUtils';

const toAbsolute = (url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  const base = (api.defaults.baseURL || '').replace(/\/$/, '');
  return `${base}/${url.replace(/^\//, '')}`;
};

const SavedSignaturesPage = () => {
  const [items, setItems] = useState([]);
  const [drawData, setDrawData] = useState('');
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const data = await signatureService.listSavedSignatures();
      setItems(data || []);
    } catch (e) {
      toast.error('Impossible de charger les signatures');
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append('image', file);
    form.append('kind', 'upload');
    setUploading(true);
    try {
      await signatureService.createSavedSignature(form);
      toast.success('Signature enregistrée');
      e.target.value = '';
      load();
    } catch {
      toast.error('Échec de l\'upload');
    } finally {
      setUploading(false);
    }
  };

  const saveDrawn = async () => {
    if (!drawData) return toast.error('Dessinez une signature');
    try {
      await signatureService.createSavedSignature({ kind: 'draw', data_url: drawData });
      toast.success('Signature enregistrée');
      setDrawData('');
      load();
    } catch {
      toast.error('Échec de l\'enregistrement');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Supprimer cette signature ?')) return;
    try {
      await signatureService.deleteSavedSignature(id);
      toast.success('Supprimé');
      load();
    } catch {
      toast.error('Suppression impossible');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Mes signatures enregistrées</h1>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <h2 className="font-medium mb-2">Téléverser</h2>
          <input type="file" accept="image/*" onChange={handleFile} disabled={uploading} />
        </div>
        <div>
          <h2 className="font-medium mb-2">Dessiner</h2>
          <SignaturePadComponent
            onEnd={(d) => setDrawData(d)}
            onChange={(d) => setDrawData(d)}
            initialValue={drawData}
            canvasProps={{ width: 320, height: 160 }}
          />
          <button
            onClick={saveDrawn}
            className="mt-2 px-4 py-1 bg-emerald-600 text-white rounded"
          >
            Sauvegarder
          </button>
        </div>
      </div>

      <div>
        <h2 className="font-medium mb-2">Signatures existantes</h2>
        {items.length === 0 && <p>Aucune signature enregistrée.</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map(sig => (
            <div key={sig.id} className="border p-2 rounded relative">
              <img
  src={sig.data_url || sig.image_url}
  alt="signature"
/>

              <button
                onClick={() => remove(sig.id)}
                className="absolute top-1 right-1 text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SavedSignaturesPage;
