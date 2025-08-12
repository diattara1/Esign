// Modification de votre composant DocumentDetail.jsx pour affichage PDF intégré

import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';

const DocumentDetail = ({ envelope }) => {
  const { id } = useParams();
  const [env, setEnv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [iframeError, setIframeError] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);

  useEffect(() => {
    async function loadEnvelope() {
      try {
        const data = await signatureService.getEnvelope(id);
        setEnv(data);
        if (data.documents && data.documents.length > 0) {
          setSelectedDoc(data.documents[0]);
          await loadPdfPreview(data.documents[0].file_url);
        } else {
          await loadPdfPreview(null, data.id);
        }
      } catch (err) {
        toast.error('Échec du chargement de l\'enveloppe');
        console.error('Failed to fetch envelope:', err);
      } finally {
        setLoading(false);
      }
    }
    loadEnvelope();
  }, [id]);

  const loadPdfPreview = async (fileUrl, envelopeId) => {
    setLoadingPdf(true);
    setIframeError(false);
    try {
      let url = fileUrl;
      if (!url && envelopeId) {
        const { download_url } = await signatureService.downloadEnvelope(envelopeId);
        url = download_url;
      }
      if (!url) return;
      const embedUrl = `${url}#toolbar=0&navpanes=0&scrollbar=0`;
      setPdfUrl(embedUrl);
    } catch (error) {
      console.error('Erreur lors du chargement du PDF:', error);
      toast.error('Impossible de charger le PDF');
      setIframeError(true);
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleIframeError = () => {
    console.error('Erreur lors du chargement de l\'iframe PDF');
    setIframeError(true);
    toast.error('Impossible d\'afficher le PDF dans cette fenêtre');
  };

  const handlePreview = async () => {
    if (pdfUrl) {
      const originalUrl = pdfUrl.split('#')[0];
      window.open(originalUrl, '_blank');
    }
  };

  const handleDownload = async () => {
    try {
      let downloadUrl;
      if (selectedDoc) {
        downloadUrl = selectedDoc.file_url;
      } else {
        const { download_url } = await signatureService.downloadEnvelope(env.id);
        downloadUrl = download_url;
      }
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = selectedDoc ? selectedDoc.name || `${env.title}.pdf` : `${env.title}_signed.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Document téléchargé avec succès');
    } catch (err) {
      toast.error('Échec du téléchargement du document');
      console.error('Failed to download envelope:', err);
    }
  };

  if (loading) return <div className="p-6">Chargement...</div>;
  if (!env) return <div className="p-6">Enveloppe non trouvée</div>;

  return (
    <div className="flex h-screen">
      {/* Sidebar avec les détails du document */}
      <div className="w-1/3 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Détails : {env.title}</h1>

          {env.documents?.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">Documents</h2>
              <ul className="space-y-1">
                {env.documents.map(doc => (
                  <li key={doc.id}>
                    <button
                      onClick={() => {
                        setSelectedDoc(doc);
                        loadPdfPreview(doc.file_url);
                      }}
                      className={`text-left w-full px-2 py-1 rounded ${
                        selectedDoc?.id === doc.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                      }`}
                    >
                      {doc.name || `Document ${doc.id}`}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="space-y-4 mb-6">
            <div>
              <p className="mb-2">
                <strong>Statut :</strong> 
                <span className={`ml-2 px-2 py-1 rounded text-sm ${
                  env.status === 'completed' ? 'bg-green-100 text-green-800' :
                  env.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                  env.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {env.status === 'completed' ? 'Signé' :
                   env.status === 'sent' ? 'Envoyé' :
                   env.status === 'cancelled' ? 'Annulé' : 'Brouillon'}
                </span>
              </p>
              <p className="mb-2"><strong>Version :</strong> {env.version}</p>
              <p className="mb-2"><strong>Créé le :</strong> {new Date(env.created_at).toLocaleDateString()}</p>
              <p className="mb-2"><strong>Hachage original :</strong> 
                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded ml-2">
                  {env.hash_original?.substring(0, 16)}...
                </span>
              </p>
              <p className="mb-2"><strong>Type de flux :</strong> {env.flow_type === 'sequential' ? 'Séquentiel' : 'Parallèle'}</p>
              {env.deadline_at && (
                <p className="mb-2"><strong>Échéance :</strong> {new Date(env.deadline_at).toLocaleDateString()}</p>
              )}
            </div>

            {/* Barre de progression */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Progression de signature</span>
                <span className="text-sm text-gray-600">{env.completion_rate?.toFixed(0) || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${env.completion_rate || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Destinataires */}
          <h2 className="text-xl font-semibold mb-4">Destinataires</h2>
          <div className="space-y-3 mb-6">
            {env.recipients?.map((r, index) => (
              <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    r.signed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-sm text-gray-600">{r.email}</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    r.signed ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {r.signed ? 'Signé' : 'En attente'}
                  </span>
                  {r.signed_at && (
                    <span className="text-xs text-gray-500">
                      {new Date(r.signed_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handlePreview}
              className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
            >
              Ouvrir dans un nouvel onglet
            </button>
            
            {env.status === 'completed' && (
              <button
                onClick={handleDownload}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Télécharger signé</span>
              </button>
            )}
            
            {env.status !== 'completed' && (
              <button
                onClick={handleDownload}
                className="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors flex items-center justify-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Télécharger original</span>
              </button>
            )}
            
            <Link
              to="/signature/list"
              className="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors text-center block"
            >
              Retour à la liste
            </Link>
          </div>
        </div>
      </div>

      {/* Zone d'affichage du PDF */}
      <div className="flex-1 bg-gray-100">
        {loadingPdf ? (
          <div className="flex justify-center items-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Chargement du PDF...</p>
            </div>
          </div>
        ) : pdfUrl && !iframeError ? (
          <div className="h-full">
            <iframe
              src={pdfUrl}
              width="100%"
              height="100%"
              className="border-0"
              title={`Document - ${env.title}`}
              onError={handleIframeError}
              style={{ 
                background: 'white',
                minHeight: '100vh'
              }}
              onLoad={() => {
                setTimeout(() => {
                  const iframe = document.querySelector('iframe');
                  if (iframe) {
                    try {
                      const doc = iframe.contentDocument || iframe.contentWindow.document;
                      if (!doc || doc.body.innerHTML === '') {
                        handleIframeError();
                      }
                    } catch (e) {
                      console.warn('Iframe content blocked:', e);
                      handleIframeError();
                    }
                  }
                }, 1000);
              }}
            />
          </div>
        ) : (
          <div className="flex justify-center items-center h-full">
            <div className="text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 mb-4">
                {iframeError ? 'Impossible d\'afficher le PDF dans cette fenêtre' : 'PDF non disponible'}
              </p>
              <div className="space-y-2">
                <button
                  onClick={handlePreview}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors mr-2"
                >
                  Ouvrir dans un nouvel onglet
                </button>
                <button
                  onClick={() => loadPdfPreview()}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors"
                >
                  Réessayer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentDetail;