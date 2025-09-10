import React, { useRef, useEffect, useCallback, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import logService from '../services/logService';

const SignaturePadComponent = ({ onEnd, onChange, initialValue, canvasProps }) => {
  const sigRef = useRef(null);
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 350, height: 220 });

  // Ajuste la taille du canvas selon le conteneur
  useEffect(() => {
    const resize = () => {
      const width = containerRef.current?.offsetWidth || 0;
      setSize((s) => ({ ...s, width }));
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Charge une valeur initiale (dataURL) si fournie
  useEffect(() => {
    if (!sigRef.current) return;
    sigRef.current.clear();
    if (initialValue) {
      try {
        sigRef.current.fromDataURL(initialValue);
      } catch (error) {
        logService.error('Erreur lors du chargement de la signature :', error);
      }
    }
  }, [initialValue, size]);

  // Nettoyage à l’unmount uniquement
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
    <div ref={containerRef} className="border border-gray-300 rounded-md p-2 bg-white">
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
          width: size.width,
          height: size.height,
          style: { width: `${size.width}px`, height: `${size.height}px`, display: 'block' },
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
      </div>
    </div>
  );
};

export default SignaturePadComponent;
