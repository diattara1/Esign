import React, { useEffect, useRef, useState } from 'react';
import Modal from 'react-modal';
import { toast } from 'react-toastify';
import SignaturePadComponent from './SignaturePadComponent';
import useFocusTrap from '../hooks/useFocusTrap';
import { fileToPngDataURL, savedSignatureImageUrl, fetchSavedSignatureAsDataURL } from '../utils/signatureUtils';

export default function SignatureModal({
  isOpen,
  onClose,
  onConfirm,
  savedSignatures = [],
  initialDataUrl = '',
  initialSavedId = null,
  style = {}
}) {
  const [mode, setMode] = useState('draw');
  const [tempDataUrl, setTempDataUrl] = useState('');
  const [savedSelectedId, setSavedSelectedId] = useState(null);
  const modalRef = useRef(null);
  useFocusTrap(modalRef, isOpen);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      setMode(initialSavedId ? 'saved' : 'draw');
      setTempDataUrl(initialDataUrl || '');
      setSavedSelectedId(initialSavedId || null);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [isOpen, initialDataUrl, initialSavedId]);

  useEffect(() => {
    if (!isOpen && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [isOpen]);

  const handleUpload = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Veuillez importer une image (PNG/JPG/SVG)');
    try {
      const dataUrl = await fileToPngDataURL(f);
      setTempDataUrl(dataUrl);
    } catch {
      toast.error("Impossible de lire l'image");
    }
  };

  const handleConfirm = () => {
    if (!tempDataUrl) return toast.error('Veuillez fournir une signature');
    onConfirm(tempDataUrl, savedSelectedId);
  };

  const defaultStyle = {
    overlay: { zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.5)' },
    content: { zIndex: 10001, inset: '10% 20%', borderRadius: 12, padding: 16 }
  };
  const mergedStyle = {
    overlay: { ...defaultStyle.overlay, ...(style.overlay || {}) },
    content: { ...defaultStyle.content, ...(style.content || {}) }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      contentLabel="Signer"
      shouldCloseOnOverlayClick
      shouldCloseOnEsc
      style={mergedStyle}
      contentRef={(node) => (modalRef.current = node)}
    >
      <h2 className="text-lg font-semibold mb-3">Ajouter une signature</h2>

      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" checked={mode==='draw'} onChange={() => setMode('draw')} />
          <span>Dessiner</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" checked={mode==='upload'} onChange={() => setMode('upload')} />
          <span>Importer</span>
        </label>
        {!!savedSignatures.length && (
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode==='saved'} onChange={() => setMode('saved')} />
            <span>Mes signatures</span>
          </label>
        )}
      </div>

      {mode === 'draw' && (
        <SignaturePadComponent
          mode="draw"
          onChange={(d) => setTempDataUrl(d)}
          onEnd={(d) => setTempDataUrl(d)}
          initialValue={tempDataUrl}
        />
      )}

      {mode === 'upload' && (
        <div className="space-y-3">
          <input type="file" accept="image/*" onChange={handleUpload} className="block w-full text-sm" />
          {tempDataUrl ? (
            <div className="border rounded p-2 inline-block"><img src={tempDataUrl} alt="Aperçu signature" style={{ maxWidth: 320, maxHeight: 160 }} /></div>
          ) : (
            <p className="text-sm text-gray-600">Choisissez une image (PNG/JPG/SVG).</p>
          )}
          {tempDataUrl && (
            <button type="button" onClick={() => setTempDataUrl('')} className="px-3 py-1 rounded bg-gray-200 text-gray-800">Effacer</button>
          )}
        </div>
      )}

      {mode === 'saved' && (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
          {savedSignatures.map(sig => {
            const previewSrc = sig.data_url || savedSignatureImageUrl(sig.id);
            return (
              <button
                type="button"
                key={sig.id}
                className={`relative border p-1 rounded flex items-center justify-center h-24 ${savedSelectedId===sig.id ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={async () => {
                  try {
                    const dataUrl = await fetchSavedSignatureAsDataURL(sig);
                    setTempDataUrl(dataUrl);
                    setSavedSelectedId(sig.id);
                  } catch {
                    toast.error('Impossible de charger la signature');
                  }
                }}
              >
                <img src={previewSrc} alt="saved" className="max-h-20 w-full object-contain" />
                {savedSelectedId===sig.id && <span className="absolute top-1 right-1 text-[10px] px-1 rounded bg-blue-600 text-white">Choisie</span>}
              </button>
            );
          })}
          {!savedSignatures.length && <p className="text-sm">Aucune signature enregistrée.</p>}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">Annuler</button>
        <button onClick={handleConfirm} className="px-4 py-2 rounded bg-green-600 text-white">Valider</button>
      </div>
    </Modal>
  );
}
