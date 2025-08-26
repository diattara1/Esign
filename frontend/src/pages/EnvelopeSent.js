import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import signatureService from '../services/signatureService';
import SignatureNavbar from '../components/SignatureNavbar';
import { 
  CheckCircle, 
  FileText, 
  Users, 
  Calendar, 
  Eye, 
  ArrowLeft,
  Clock,
  Mail,
  User,
  ExternalLink,
  Download
} from 'lucide-react';

export default function EnvelopeSent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEnvelope = async () => {
      try {
        setLoading(true);
        const data = await signatureService.getEnvelope(id);
        setEnvelope(data);
      } catch (error) {
        console.error("Erreur lors du chargement de l'enveloppe:", error);
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
            <CheckCircle className="w-12 h-12 text-green-500 shrink-0" />
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
                    <h2 className="text-xl font-semibold text-gray-900">{envelope.title}</h2>
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

              {/* Infos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {envelope.deadline_at && (
                  <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg">
                    <Calendar className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Date limite</p>
                      <p className="text-sm text-amber-700">
                        {new Date(envelope.deadline_at).toLocaleDateString('fr-FR', {
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </p>
                    </div>
                  </div>
                )}
                
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                  <Clock className="w-5 h-5 text-blue-600" />
                  <div>
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
            </div>
          </div>

          {/* Liste des destinataires */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-gray-500" />
                <h3 className="text-lg font-medium text-gray-900">
                  Destinataires ({envelope.recipients?.length || 0})
                </h3>
              </div>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {envelope.recipients?.map((recipient, index) => (
                  <div 
                    key={recipient.id || index}
                    className={`p-4 rounded-lg border-2 transition-colors ${
                      recipient.signed ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          recipient.signed ? 'bg-green-500 text-white' : 'bg-gray-300 text-gray-600'
                        }`}>
                          {recipient.signed ? <CheckCircle className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{recipient.full_name}</p>
                          <div className="flex items-center gap-1 text-sm text-gray-600">
                            <Mail className="w-3 h-3" />
                            <span>{recipient.email}</span>
                          </div>
                        </div>
                      </div>
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        recipient.signed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {recipient.signed ? 'Signé' : 'En attente'}
                      </span>
                    </div>
                    {recipient.signed && recipient.signed_at && (
                      <p className="text-xs text-green-700">
                        Signé le {new Date(recipient.signed_at).toLocaleDateString('fr-FR')} à {' '}
                        {new Date(recipient.signed_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
                          className="text-sm text-gray-700 hover:underline inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          Télécharger
                        </a>
                      </div>
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
            <h3 className="text-lg font-medium text-gray-900 mb-4">Actions disponibles</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate(`/signature/detail/${id}`)}
                className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Eye className="w-4 h-4 mr-2" />
                Voir le document
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="inline-flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour au tableau de bord
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
