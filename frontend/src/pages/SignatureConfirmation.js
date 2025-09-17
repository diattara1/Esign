import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { CheckCircle, Download, RefreshCw } from 'lucide-react';
import signatureService from '../services/signatureService';
import SignatureNavbar from '../components/SignatureNavbar';
import logService from '../services/logService';

const SignatureConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [downloading, setDownloading] = useState(false);

  const docUuid = location.state?.docUuid || new URLSearchParams(location.search).get('doc_uuid');

  const handleDownload = async () => {
    if (!docUuid) {
      toast.error('Identifiant du document manquant');
      return;
    }
    try {
      setDownloading(true);
      const { download_url } = await signatureService.downloadEnvelope(docUuid);
      const response = await fetch(download_url);
      if (!response.ok) throw new Error('Erreur lors du téléchargement');
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
      logService.error('Erreur téléchargement document signé:', err);
      toast.error('Échec du téléchargement. Veuillez réessayer.');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => navigate('/signature/envelopes/completed'), 10000);
    toast.info('Redirection vers "Mes documents signés" dans 10 secondes');
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex flex-col min-h-screen">
      <SignatureNavbar />
      <main className="flex-1 flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-lg shadow-md p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-6">Signature confirmée&nbsp;!</h1>
          {docUuid && (
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
      </main>
    </div>
  );
};

export default SignatureConfirmation;
