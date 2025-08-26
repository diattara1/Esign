import React, { useRef, useEffect, useCallback, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import logService from '../services/logService';

const SignaturePadComponent = ({ onEnd, onChange, initialValue, canvasProps }) => {
  const sigRef = useRef(null);
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const [, setVersion] = useState(0); // force re-render for buttons

  // Charger une valeur initiale (dataURL) si fournie
  useEffect(() => {
    if (!sigRef.current) return;
    try {
      if (initialValue) {
        sigRef.current.fromDataURL(initialValue);
      } else {
        sigRef.current.clear();
      }
      undoStack.current = [sigRef.current.toData()];
      redoStack.current = [];
      setVersion(v => v + 1);
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

  // Ajuster le canvas pour les écrans haute densité
  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = sigRef.current?.getCanvas();
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const { offsetWidth, offsetHeight } = canvas;
      canvas.width = offsetWidth * ratio;
      canvas.height = offsetHeight * ratio;
      canvas.getContext('2d').scale(ratio, ratio);
      const data = undoStack.current[undoStack.current.length - 1];
      if (data) sigRef.current.fromData(data);
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Callback de fin de signature — déclenche les updates ici seulement
  const handleEnd = useCallback(() => {
    if (!sigRef.current) return;
    const dataUrl = sigRef.current.toDataURL('image/png');
    onEnd?.(dataUrl);
    onChange?.(dataUrl);
    undoStack.current.push(sigRef.current.toData());
    redoStack.current = [];
    setVersion(v => v + 1);
  }, [onEnd, onChange]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length <= 1) return;
    redoStack.current.push(undoStack.current.pop());
    const data = undoStack.current[undoStack.current.length - 1] || [];
    sigRef.current.fromData(data);
    const dataUrl = sigRef.current.isEmpty() ? '' : sigRef.current.toDataURL('image/png');
    onEnd?.(dataUrl);
    onChange?.(dataUrl);
    setVersion(v => v + 1);
  }, [onEnd, onChange]);

  const handleRedo = useCallback(() => {
    if (redoStack.current.length === 0) return;
    const data = redoStack.current.pop();
    undoStack.current.push(data);
    sigRef.current.fromData(data);
    const dataUrl = sigRef.current.isEmpty() ? '' : sigRef.current.toDataURL('image/png');
    onEnd?.(dataUrl);
    onChange?.(dataUrl);
    setVersion(v => v + 1);
  }, [onEnd, onChange]);

  const handleClear = useCallback(() => {
    if (!sigRef.current) return;
    sigRef.current.clear();
    undoStack.current.push([]);
    redoStack.current = [];
    onEnd?.('');
    onChange?.('');
    setVersion(v => v + 1);
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
          onClick={handleUndo}
          disabled={undoStack.current.length <= 1}
          className="bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300 text-sm disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          onClick={handleRedo}
          disabled={redoStack.current.length === 0}
          className="bg-gray-200 text-gray-800 px-3 py-1 rounded hover:bg-gray-300 text-sm disabled:opacity-50"
        >
          Rétablir
        </button>
        <button
          onClick={handleClear}
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
