import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';

import signatureService from '../services/signatureService';

const SignatureConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [downloading, setDownloading] = useState(false);

  const envelopeId = location.state?.id || searchParams.get('id');

  const handleDownload = async () => {
    if (!envelopeId) return;
    try {
      setDownloading(true);
      const { download_url } = await signatureService.downloadEnvelope(envelopeId);
      const response = await fetch(download_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'document_signe.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Document téléchargé avec succès');
    } catch (err) {
      toast.error('Échec du téléchargement');
      console.error('Erreur téléchargement document signé:', err);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate('/signature/envelopes/completed');
    }, 5000);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="p-6 container mx-auto">
      <h1 className="text-2xl font-bold mb-6">Signature Confirmée</h1>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <p className="text-gray-600">Votre signature a été enregistrée avec succès.</p>
        <p className="text-gray-600 mt-2">Vous pouvez fermer cette page ou attendre la redirection.</p>
        {envelopeId && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading ? 'Téléchargement…' : 'Télécharger le document signé'}
          </button>
        )}
        <div className="mt-4">
          <Link to="/signature/envelopes/completed" className="text-blue-600 hover:underline">
            Voir mes documents
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SignatureConfirmation;
