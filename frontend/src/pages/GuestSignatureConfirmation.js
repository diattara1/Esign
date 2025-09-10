import React, { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { CheckCircle, Download, RefreshCw } from 'lucide-react';
import signatureService from '../services/signatureService';
import logService from '../services/logService';
import sanitize from '../utils/sanitize';

const GuestSignatureConfirmation = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [envelope, setEnvelope] = useState(null);

  const envelopeId = location.state?.id || searchParams.get('id');
  const token = searchParams.get('token');

  useEffect(() => {
    const load = async () => {
      if (!envelopeId || !token) return;
      try {
        const data = await signatureService.getGuestEnvelope(envelopeId, token);
        setEnvelope(data);
      } catch (e) {
        logService.error(e);
        toast.error("Impossible de charger les informations du document");
      }
    };
    load();
  }, [envelopeId, token]);

  const handleDownload = async () => {
    if (!envelopeId || !token) {
      toast.error('Informations manquantes pour le téléchargement');
      return;
    }
    try {
      setDownloading(true);
      const { download_url } = await signatureService.downloadGuestEnvelope(envelopeId, token);
      const response = await fetch(download_url);
      if (!response.ok) throw new Error('Erreur lors du téléchargement');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeTitle = sanitize(envelope?.title || 'document');
      link.download = `${safeTitle}_signe.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Document téléchargé avec succès');
    } catch (err) {
      logService.error('Erreur téléchargement document signé:', err);
      toast.error('Échec du téléchargement. Veuillez réessayer.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 text-center">
        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-6">Signature réussie&nbsp;!</h1>
        {envelopeId && token && (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 mx-auto"
          >
            {downloading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Téléchargement...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Télécharger
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default GuestSignatureConfirmation;
