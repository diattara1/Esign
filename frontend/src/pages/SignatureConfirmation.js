import React from 'react';

const SignatureConfirmation = () => {
  return (
    <div className="p-6 container mx-auto">
      <h1 className="text-2xl font-bold mb-6">Signature Confirmée</h1>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <p className="text-gray-600">Votre signature a été enregistrée avec succès.</p>
        <p className="text-gray-600 mt-2">Vous pouvez fermer cette page ou attendre la redirection.</p>
      </div>
    </div>
  );
};

export default SignatureConfirmation;