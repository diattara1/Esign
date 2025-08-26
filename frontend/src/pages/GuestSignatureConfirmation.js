import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import signatureService from '../services/signatureService';
import {
  CheckCircle,
  Download,
  FileText,
  Clock,
  RefreshCw,
  Sparkles,
  Shield,
  ExternalLink,
  Mail,
  User,
  Calendar,
  Award
} from 'lucide-react';
import logService from '../services/logService';

const GuestSignatureConfirmation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [downloading, setDownloading] = useState(false);
  const [envelope, setEnvelope] = useState(null);
  const [loadingEnv, setLoadingEnv] = useState(true);

  const envelopeId = location.state?.id || searchParams.get('id');
  const token = searchParams.get('token');

  useEffect(() => {
    const load = async () => {
      if (!envelopeId || !token) { 
        setLoadingEnv(false); 
        return; 
      }
      try {
        const data = await signatureService.getGuestEnvelope(envelopeId, token);
        setEnvelope(data);
      } catch (e) {
        logService.error(e);
        toast.error('Impossible de charger les informations du document');
      } finally {
        setLoadingEnv(false);
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
      link.download = `${envelope?.title || 'document'}_signe.pdf`;
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

  const formatDate = (dateString) => {
    if (!dateString) return new Date().toLocaleDateString('fr-FR');
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50">
      {/* Header simple pour invités */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-semibold text-gray-900">Signature Électronique</span>
            </div>
            <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
              <Shield className="w-4 h-4" />
              <span>Signature sécurisée</span>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="flex-1 p-4 lg:p-8">
        <div className="max-w-3xl mx-auto">
          {/* Animation de succès */}
          <div className="text-center mb-8">
            <div className="relative inline-block">
              <div className="absolute inset-0 animate-ping rounded-full bg-green-200 opacity-75"></div>
              <div className="relative bg-green-500 rounded-full p-6">
                <CheckCircle className="w-16 h-16 text-white" />
              </div>
            </div>
            <div className="mt-6">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-3">
                Signature réussie !
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
                Félicitations ! Votre signature électronique a été enregistrée avec succès. 
                Le document est maintenant légalement signé.
              </p>
            </div>
          </div>

          {/* Carte principale */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden mb-8">
            {/* En-tête coloré */}
            <div className="bg-gradient-to-r from-green-500 via-green-600 to-blue-600 p-6 sm:p-8 text-white relative overflow-hidden">
              <div className="absolute top-0 right-0 opacity-20">
                <Sparkles className="w-32 h-32 sm:w-40 sm:h-40" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <Award className="w-6 h-6" />
                  <span className="text-sm sm:text-base font-medium opacity-90">
                    Signature électronique certifiée
                  </span>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold mb-2">
                  {envelope?.title || 'Document signé avec succès'}
                </h2>
                <p className="text-sm sm:text-base opacity-90">
                  Votre signature numérique est juridiquement valable et conforme aux standards de sécurité.
                </p>
              </div>
            </div>

            {/* Contenu de la carte */}
            <div className="p-6 sm:p-8 space-y-6">
              {/* Informations du document */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-4 p-4 bg-green-50 rounded-xl">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-800">Statut</p>
                    <p className="text-sm text-green-700">Signature complétée</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-blue-800">Date de signature</p>
                    <p className="text-sm text-blue-700">
                      {formatDate(envelope?.signed_at)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Informations du signataire */}
              {envelope && (
                <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Informations du signataire
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    {envelope.recipient_name && (
                      <div>
                        <span className="font-medium text-gray-700">Nom : </span>
                        <span className="text-gray-900">{envelope.recipient_name}</span>
                      </div>
                    )}
                    {envelope.recipient_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-900">{envelope.recipient_email}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Actions principales */}
              <div className="space-y-4">
                {envelopeId && token && (
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm hover:shadow-lg text-base font-semibold"
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

                {/* Documents de l'enveloppe pour invités */}
                {!loadingEnv && envelope?.documents?.length > 0 && (
                  <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                    <h3 className="font-semibold text-gray-900 mb-4">
                      Document{envelope.documents.length > 1 ? 's' : ''} de l'enveloppe
                    </h3>
                    <div className="space-y-3">
                      {envelope.documents.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                              <FileText className="w-4 h-4 text-blue-600" />
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {doc.name || `Document ${doc.id}`}
                            </span>
                          </div>
                          {doc.file_url && (
                            <div className="flex items-center gap-2">
                              <a
                                href={doc.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 font-medium"
                              >
                                Ouvrir
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Informations légales */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Validité juridique</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Cette signature électronique est juridiquement valable selon les réglementations en vigueur 
                  (Règlement eIDAS, Code civil). Elle a la même valeur qu'une signature manuscrite et engage 
                  juridiquement le signataire.
                </p>
              </div>
            </div>
          </div>

          {/* Informations de contact ou support */}
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 mb-2">
              Vous avez des questions sur ce document ?
            </p>
            <p className="text-xs text-gray-400">
              Conservez ce lien pour pouvoir télécharger à nouveau le document signé.
            </p>
          </div>

          {/* Footer minimaliste */}
          <footer className="mt-12 pt-8 border-t border-gray-200 text-center">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4" />
              <span>Signature électronique sécurisée - Tous droits réservés</span>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default GuestSignatureConfirmation;