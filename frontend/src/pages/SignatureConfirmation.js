import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import signatureService from '../services/signatureService';
import SignatureNavbar from '../components/SignatureNavbar';
import {
  CheckCircle,
  Download,
  FileText,
  ArrowRight,
  Clock,
  Home,
  RefreshCw,
  Sparkles,
  Shield,
  ExternalLink
} from 'lucide-react';
import logService from '../services/logService';

const SignatureConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [envelope, setEnvelope] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(true);

  const envelopeId = location.state?.id || searchParams.get('id');

  useEffect(() => {
    const load = async () => {
      if (!envelopeId) { setLoadingEnv(false); return; }
      try {
        const data = await signatureService.getEnvelope(envelopeId);
        setEnvelope(data);
      } catch (e) {
        logService.error(e);
      } finally {
        setLoadingEnv(false);
      }
    };
    load();
  }, [envelopeId]);

  const handleDownload = async () => {
    if (!envelopeId) {
      toast.error('Identifiant du document manquant');
      return;
    }
    try {
      setDownloading(true);
      const { download_url } = await signatureService.downloadEnvelope(envelopeId);
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
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          navigate('/signature/envelopes/completed');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [navigate]);

  const handleStayOnPage = () => setCountdown(-1);
  const handleRedirectNow = () => navigate('/signature/envelopes/completed');

  return (
    <div className="flex flex-col min-h-screen">
      <SignatureNavbar />
      <main className="flex-1 bg-gradient-to-br from-green-50 via-white to-blue-50 p-4 lg:p-8">
        <div className="max-w-2xl mx-auto">
          {/* Animation de succès */}
          <div className="text-center mb-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 animate-ping rounded-full bg-green-200 opacity-75"></div>
              <div className="relative bg-green-500 rounded-full p-4">
                <CheckCircle className="w-12 h-12 text-white" />
              </div>
            </div>
            <div className="mt-4">
              <h1 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
                Signature confirmée !
              </h1>
              <p className="text-lg text-gray-600">
                Félicitations, votre signature a été enregistrée avec succès.
              </p>
            </div>
          </div>

          {/* Carte principale */}
          <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden mb-6">
            <div className="bg-gradient-to-r from-green-500 to-blue-600 p-6 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 opacity-20">
                <Sparkles className="w-32 h-32" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                  <Shield className="w-6 h-6" />
                  <span className="text-sm font-medium opacity-90">Signature sécurisée</span>
                </div>
                <h2 className="text-xl font-semibold">Document signé numériquement</h2>
                <p className="text-sm opacity-90 mt-1">
                  Votre signature électronique est juridiquement valable et sécurisée.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800">Statut</p>
                    <p className="text-sm text-green-700">Signature complétée</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Horodatage</p>
                    <p className="text-sm text-blue-700">
                      {new Date().toLocaleDateString('fr-FR', {
                        hour: '2-digit', minute: '2-digit', second: '2-digit'
                      })}
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions principales */}
              <div className="space-y-3">
                {envelopeId && (
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    {downloading ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Téléchargement en cours...
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Télécharger le document signé
                      </>
                    )}
                  </button>
                )}

                {/* Si multi-docs, proposer aussi l'accès à chaque PDF original */}
                {!loadingEnv && envelope?.documents?.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <div className="font-medium text-gray-900 mb-2">Documents de l’enveloppe</div>
                    <ul className="space-y-2">
                      {envelope.documents.map(doc => (
                        <li key={doc.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span className="text-sm">{doc.name || `Document ${doc.id}`}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              Ouvrir <ExternalLink className="w-3 h-3" />
                            </a>
                            <a
                              href={doc.file_url}
                              download
                              className="text-sm text-gray-700 hover:underline"
                            >
                              Télécharger
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Link 
                    to="/signature/envelopes/completed"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <FileText className="w-4 h-4" />
                    Mes documents
                  </Link>
                  <Link 
                    to="/dashboard"
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                  >
                    <Home className="w-4 h-4" />
                    Tableau de bord
                  </Link>
                </div>
              </div>
            </div>
          </div>

          {/* Redirection auto */}
          {countdown > 0 && (
            <div className="bg-white rounded-lg border border-amber-200 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center">
                    <Clock className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Redirection automatique dans {countdown} seconde{countdown !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-amber-700">
                      Vers la page "Mes documents signés"
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleStayOnPage}
                    className="text-xs px-3 py-1 text-amber-700 border border-amber-300 rounded hover:bg-amber-50 transition-colors"
                  >
                    Rester ici
                  </button>
                  <button
                    onClick={handleRedirectNow}
                    className="text-xs px-3 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors flex items-center gap-1"
                  >
                    Y aller
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <div className="w-full bg-amber-100 rounded-full h-1">
                  <div 
                    className="bg-amber-500 h-1 rounded-full transition-all duration-1000"
                    style={{ width: `${((10 - countdown) / 10) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 text-center text-xs text-gray-500">
            <p>
              Cette signature électronique est juridiquement valable selon les réglementations en vigueur.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SignatureConfirmation;
