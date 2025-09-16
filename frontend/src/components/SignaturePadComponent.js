import React, { useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePadComponent = ({ onEnd, onChange }) => {
  const sigRef = useRef();

  const handleEnd = useCallback(() => {
    if (!sigRef.current) return;
    const trimmed = sigRef.current.getTrimmedCanvas();
    const dataUrl = trimmed.toDataURL('image/png');
    onEnd?.(dataUrl);
    onChange?.(dataUrl);
  }, [onEnd, onChange]);

  return (
    <div>
      <SignatureCanvas
        ref={sigRef}
        penColor="black"
        canvasProps={{ width: 300, height: 200, className: 'sigCanvas' }}
        onEnd={handleEnd}
      />
      <button onClick={() => sigRef.current.clear()}>Effacer</button>
    </div>
  );
};

export default SignaturePadComponent;
