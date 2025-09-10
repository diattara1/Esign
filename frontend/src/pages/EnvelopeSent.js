import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import signatureService from '../services/signatureService';
import SignatureNavbar from '../components/SignatureNavbar';
import { FileText, Users, ArrowLeft, Download, ChevronDown } from 'lucide-react';
import slugify from 'slugify';
import logService from '../services/logService';
import sanitize from '../utils/sanitize';
export default function EnvelopeSent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRecipients, setShowRecipients] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const loadEnvelope = async () => {
      try {
        setLoading(true);
        const data = await signatureService.getEnvelope(id);
        setEnvelope(data);
      } catch (error) {
        logService.error("Erreur lors du chargement de l'enveloppe:", error);
        setEnvelope(null);
      } finally {
        setLoading(false);
      }
    };
    if (id) loadEnvelope();
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-col min-h-screen">
        <SignatureNavbar />
        <main className="flex-1 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Chargement...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!envelope) {
    return (
      <div className="flex flex-col min-h-screen">
        <SignatureNavbar />
        <main className="flex-1 bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Document introuvable</h2>
            <p className="text-gray-600 mb-6">Le document demandé n'existe pas ou n'est plus accessible.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Retour au tableau de bord
            </button>
          </div>
        </main>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const statusConfig = {
      sent: { color: 'bg-purple-100 text-purple-800', text: 'Envoyé' },
      completed: { color: 'bg-green-100 text-green-800', text: 'Complété' },
      draft: { color: 'bg-gray-100 text-gray-800', text: 'Brouillon' },
      action_required: { color: 'bg-red-100 text-red-800', text: 'Action requise' }
    };
    const config = statusConfig[status] || statusConfig.sent;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.text}
      </span>
    );
  };

  const signedCount = envelope.recipients?.filter(r => r.signed).length || 0;
  const totalRecipients = envelope.recipients?.length || 0;
  const progressPercentage = totalRecipients > 0 ? (signedCount / totalRecipients) * 100 : 0;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const { download_url } = await signatureService.downloadEnvelope(id);
      const response = await fetch(download_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const safeName = slugify(envelope.title || 'document', { lower: true, strict: true });
      link.download = `${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logService.error(error);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <SignatureNavbar />
      <main className="flex-1 bg-gray-50 p-4 lg:p-8">
        {/* En-tête */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Retour au tableau de bord
          </button>
          
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
                Document envoyé avec succès !
              </h1>
              <p className="text-gray-600">
                Votre document a été envoyé aux destinataires pour signature.
              </p>
            </div>
          </div>
        </div>

        {/* Carte principale */}
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <FileText className="w-5 h-5 text-blue-500" />
                    <h2 className="text-xl font-semibold text-gray-900">{sanitize(envelope.title)}</h2>
                  </div>
                  {getStatusBadge(envelope.status)}
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600 mb-1">Progression des signatures</div>
                  <div className="text-2xl font-bold text-gray-900">{signedCount}/{totalRecipients}</div>
                  <div className="w-32 bg-gray-200 rounded-full h-2 mt-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {envelope.deadline_at && (
                  <div className="p-4 bg-amber-50 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">Date limite</p>
                    <p className="text-sm text-amber-700">
                      {new Date(envelope.deadline_at).toLocaleDateString('fr-FR', {
                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                      })}
                    </p>
                  </div>
                )}
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm font-medium text-blue-800">Envoyé le</p>
                  <p className="text-sm text-blue-700">
                    {new Date(envelope.created_at || Date.now()).toLocaleDateString('fr-FR', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setShowRecipients(!showRecipients)}
              className="w-full flex items-center justify-between px-6 py-4 border-t border-gray-200 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="text-lg font-medium text-gray-900">
                  Destinataires ({totalRecipients})
                </span>
              </div>
              <ChevronDown className={`w-5 h-5 transform transition-transform ${showRecipients ? 'rotate-180' : ''}`} />
            </button>
            {showRecipients && (
              <div className="p-6 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {envelope.recipients?.map((recipient, index) => (
                    <div
                      key={recipient.id || index}
                      className={`p-4 rounded-lg border-2 ${recipient.signed ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                    >
                      <p className="font-medium text-gray-900">{sanitize(recipient.full_name)}</p>
                      <p className="text-sm text-gray-600">{sanitize(recipient.email)}</p>
                      <span className={`inline-block mt-2 text-xs font-medium px-2 py-1 rounded-full ${recipient.signed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {recipient.signed ? 'Signé' : 'En attente'}
                      </span>
                      {recipient.signed && recipient.signed_at && (
                        <p className="mt-2 text-xs text-green-700">
                          Signé le {new Date(recipient.signed_at).toLocaleDateString('fr-FR')} à{' '}
                          {new Date(recipient.signed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Documents envoyés */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-medium text-gray-900">Documents envoyés</h3>
              </div>
            </div>
            <div className="p-6">
              {envelope.documents?.length ? (
                <ul className="space-y-2">
                  {envelope.documents.map(doc => (
                    <li key={doc.id} className="flex items-center justify-between">
                      <span className="text-sm">{doc.name || `Document ${doc.id}`}</span>
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Ouvrir
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-gray-500">Aucun document attaché.</div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <button
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="w-4 h-4 mr-2" />
                {downloading ? 'Téléchargement...' : 'Télécharger le PDF'}
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Autres actions
                </button>
                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                    <button
                      onClick={() => navigate(`/signature/detail/${id}`)}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Voir le document
                    </button>
                    <button
                      onClick={() => navigate('/dashboard')}
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Retour au tableau de bord
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
