import React, { useRef, useEffect, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import logService from '../services/logService';

const SignaturePadComponent = ({ onEnd, onChange, initialValue, canvasProps }) => {
  const sigRef = useRef(null);

  // Charger une valeur initiale (dataURL) si fournie
  useEffect(() => {
    if (!sigRef.current || !initialValue) return;
    try {
      sigRef.current.fromDataURL(initialValue);
    } catch (error) {
      logService.error('Erreur lors du chargement de la signature :', error);
    }
  }, [initialValue]);

  // Nettoyage à l’unmount uniquement (évite de clear à chaque changement d'initialValue en plein trait)
  useEffect(() => {
    return () => {
      sigRef.current?.clear();
    };
  }, []);

  // Callback de fin de signature — déclenche les updates ici seulement
  const handleEnd = useCallback(() => {
    if (!sigRef.current) return;
    const dataUrl = sigRef.current.toDataURL('image/png');
    onEnd?.(dataUrl);
    onChange?.(dataUrl);
  }, [onEnd, onChange]);

  return (
    <div className="border border-gray-300 rounded-md p-2 bg-white">
      <SignatureCanvas
        ref={sigRef}
        penColor="black"
        // Réglages pour un tracé plus fluide
        minWidth={0.8}
        maxWidth={2.5}
        velocityFilterWeight={0.7}
        minDistance={0}           // 0 = plus fluide (au prix de plus d’échantillons)
        throttle={16}             // ~1 frame à 60fps
        // Important: ne rien faire en onBegin (pas de setState ici)
        onBegin={() => {}}
        onEnd={handleEnd}
        canvasProps={{
          className: 'sigCanvas',
          style: { width: '100%', height: '220px', display: 'block' },
          ...canvasProps,
        }}
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => sigRef.current?.clear()}
          className="bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600 text-sm"
        >
          Effacer
        </button>
        <button
          onClick={handleEnd}
          className="bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300 text-sm"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
};

export default SignaturePadComponent;
