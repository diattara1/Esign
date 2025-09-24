import React, { useEffect, useState } from 'react';
import SignaturePadComponent from '../components/SignaturePadComponent';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { api } from '../services/apiUtils';
import ConfirmDialog from '../components/ConfirmDialog';

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
  const [tab, setTab] = useState('upload');
  const [confirmId, setConfirmId] = useState(null);

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

  const remove = (id) => {
    setConfirmId(id);
  };

  const confirmRemove = async () => {
    if (confirmId === null) return;
    try {
      await signatureService.deleteSavedSignature(confirmId);
      toast.success('Supprimé');
      load();
    } catch {
      toast.error('Suppression impossible');
    } finally {
      setConfirmId(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Mes signatures enregistrées</h1>

      <div>
        <div className="flex border-b mb-4">
          <button
            onClick={() => setTab('upload')}
            className={`px-4 py-2 -mb-px border-b-2 ${
              tab === 'upload' ? 'border-emerald-600' : 'border-transparent'
            }`}
          >
            Téléverser
          </button>
          <button
            onClick={() => setTab('draw')}
            className={`px-4 py-2 -mb-px border-b-2 ${
              tab === 'draw' ? 'border-emerald-600' : 'border-transparent'
            }`}
          >
            Dessiner
          </button>
        </div>

        {tab === 'upload' && (
          <div className="flex justify-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleFile}
              disabled={uploading}
            />
          </div>
        )}

        {tab === 'draw' && (
          <div className="flex flex-col items-center">
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
        )}
      </div>

      <div>
        <h2 className="font-medium mb-2">Signatures existantes</h2>
        {items.length === 0 && <p>Aucune signature enregistrée.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map(sig => {
            const imageSrc = sig.data_url || toAbsolute(sig.image_url);
            return (
              <div key={sig.id} className="border p-2 rounded relative">
                {imageSrc ? (
                  <img src={imageSrc} alt={sig.kind || 'signature'} style={{ maxHeight: 80 }} />
                ) : (
                  <div className="h-20 flex items-center justify-center text-sm text-gray-500 bg-gray-100 rounded">
                    Aucune image
                  </div>
                )}

                <button
                  onClick={() => remove(sig.id)}
                  className="absolute top-1 right-1 text-red-600"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmId !== null}
        title="Supprimer la signature"
        message="Supprimer cette signature ?"
        secondaryMessage="Cette action est irréversible."
        onCancel={() => setConfirmId(null)}
        onConfirm={confirmRemove}
      />
    </div>
  );
};

export default SavedSignaturesPage;
