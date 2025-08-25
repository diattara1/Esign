import React, { useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePadComponent = ({ onEnd, onChange, initialValue, canvasProps }) => {
   
  const sigRef = useRef();

  // Nettoyer le canvas si la valeur initiale change ou lors du démontage
  useEffect(() => {
    return () => {
      sigRef.current?.clear();
    };
  }, [initialValue]);

  // Charger une valeur initiale (dataURL) si fournie
  useEffect(() => {
    if (!sigRef.current || !initialValue) return;
    try {
      sigRef.current.fromDataURL(initialValue);
    } catch (error) {
      console.error('Erreur lors du chargement de la signature :', error);
    }
  }, [initialValue]);

  return (
    <div className="border border-gray-300 rounded-md p-2 bg-white">
      <SignatureCanvas
        penColor="black"
        canvasProps={{ className: 'sigCanvas', ...canvasProps }}
        ref={sigRef}
        onBegin={() => onChange?.(sigRef.current.toDataURL())}
        onEnd={() => onEnd?.(sigRef.current.toDataURL())}
        onTouchEnd={() => onEnd?.(sigRef.current.toDataURL())}
      />
      <button
        onClick={() => sigRef.current.clear()}
        className="mt-2 bg-red-500 text-white px-4 py-1 rounded hover:bg-red-600 text-sm"
      >
        Effacer
      </button>
    </div>
  );
};

export default SignaturePadComponent;