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
    overlay: { 
      zIndex: 10000, 
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    },
    content: { 
      position: 'relative',
      inset: 'auto',
      border: 'none',
      background: 'white',
      borderRadius: '16px',
      padding: '0',
      width: '100%',
      maxWidth: '600px',
      maxHeight: '90vh',
      overflow: 'auto',
      boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
      zIndex: 10001
    }
  };

  const mergedStyle = {
    overlay: { ...defaultStyle.overlay, ...(style.overlay || {}) },
    content: { ...defaultStyle.content, ...(style.content || {}) }
  };

  const modes = [
    { id: 'draw', label: 'Dessiner', icon: '✏️' },
    { id: 'upload', label: 'Importer', icon: '📁' },
    ...(savedSignatures.length ? [{ id: 'saved', label: 'Mes signatures', icon: '💾' }] : [])
  ];

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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
            Ajouter une signature
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors duration-200"
            aria-label="Fermer"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 sm:p-6">
          {/* Mode Selection */}
          <div className="mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {modes.map((modeOption) => (
                <label
                  key={modeOption.id}
                  className={`relative flex flex-col items-center p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                    mode === modeOption.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={modeOption.id}
                    checked={mode === modeOption.id}
                    onChange={() => setMode(modeOption.id)}
                    className="sr-only"
                  />
                  <span className="text-2xl mb-2">{modeOption.icon}</span>
                  <span className="text-sm font-medium text-center">{modeOption.label}</span>
                  {mode === modeOption.id && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Mode Content */}
          <div className="min-h-[300px] sm:min-h-[350px]">
            {mode === 'draw' && (
              <div className="bg-gray-50 rounded-xl p-4 border-2 border-dashed border-gray-300">
                <SignaturePadComponent
                  mode="draw"
                  onChange={(d) => setTempDataUrl(d)}
                  onEnd={(d) => setTempDataUrl(d)}
                  initialValue={tempDataUrl}
                />
              </div>
            )}

            {mode === 'upload' && (
              <div className="space-y-4">
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    id="signature-upload"
                  />
                  <label
                    htmlFor="signature-upload"
                    className="flex flex-col items-center justify-center w-full h-32 sm:h-40 border-2 border-dashed border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
                  >
                    <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-gray-600 font-medium">Cliquez pour importer une image</p>
                    <p className="text-xs text-gray-500 mt-1">PNG, JPG ou SVG</p>
                  </label>
                </div>

                {tempDataUrl && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">Aperçu de la signature</h4>
                        <button
                          type="button"
                          onClick={() => setTempDataUrl('')}
                          className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors duration-200"
                        >
                          Supprimer
                        </button>
                      </div>
                      <div className="flex justify-center bg-gray-50 rounded-lg p-4">
                        <img
                          src={tempDataUrl}
                          alt="Aperçu signature"
                          className="max-w-full max-h-32 sm:max-h-40 object-contain"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {mode === 'saved' && (
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900">Choisissez une signature enregistrée</h4>
                {savedSignatures.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 sm:max-h-80 overflow-y-auto">
                    {savedSignatures.map(sig => {
                      const previewSrc = sig.data_url || savedSignatureImageUrl(sig.id);
                      const isSelected = savedSelectedId === sig.id;
                      
                      return (
                        <button
                          type="button"
                          key={sig.id}
                          className={`relative p-3 rounded-xl border-2 transition-all duration-200 ${
                            isSelected
                              ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          }`}
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
                          <div className="flex items-center justify-center h-20 sm:h-24 bg-white rounded-lg">
                            <img
                              src={previewSrc}
                              alt="Signature sauvegardée"
                              className="max-h-16 sm:max-h-20 max-w-full object-contain"
                            />
                          </div>
                          {isSelected && (
                            <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <p className="text-gray-500 text-sm">Aucune signature enregistrée</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 p-4 sm:p-6">
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl font-medium transition-colors duration-200"
            >
              Annuler
            </button>
            <button
              onClick={handleConfirm}
              disabled={!tempDataUrl}
              className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
                tempDataUrl
                  ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              Valider la signature
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}