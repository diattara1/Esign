import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';

const SignaturePadComponent = ({ onEnd, canvasProps }) => {
  const sigRef = useRef();

  return (
    <div className="border border-gray-300 rounded-md p-2 bg-white">
      <SignatureCanvas
        penColor="black"
        canvasProps={{ className: 'sigCanvas', ...canvasProps }}
        ref={sigRef}
        onEnd={() => onEnd(sigRef.current.toDataURL())}
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