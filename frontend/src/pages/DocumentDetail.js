// src/pages/DocumentDetail.js
// Version responsive avec sidebar mobile et meilleure adaptation

import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import { FiMenu, FiX, FiDownload, FiExternalLink, FiArrowLeft, FiClock } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import Countdown from '../components/Countdown';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import logService from '../services/logService';
import useFocusTrap from '../hooks/useFocusTrap';
import useKeyboardActions from '../hooks/useKeyboardActions';

function ReminderModal({ open, count, onClose }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);
  const handleKeyDown = useKeyboardActions({ onEnter: onClose, onEsc: onClose });

  if (!open) return null;
  const has = (count ?? 0) > 0;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={dialogRef}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6"
        role="dialog"
        aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold">
            {has ? 'Rappel envoyé' : 'Aucune relance envoyée'}
          </h3>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          {has
            ? `${count} relance${count > 1 ? 's' : ''} a été envoyée${count > 1 ? 's' : ''} aux destinataires éligibles.`
            : 'Tous les destinataires ne sont pas éligibles (plafond atteint ou déjà signés).'}
        </p>
        <div className="flex justify-end">
          <button
            onClick={onClose}
            onKeyDown={(e) => e.key === 'Enter' && onClose(e)}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

const DocumentDetail = () => {
  const { id } = useParams();

  // État principal
  const [env, setEnv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  
  // État mobile
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // PDF
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Rappels
  const [reminding, setReminding] = useState(false);
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [reminderCount, setReminderCount] = useState(0);
  const remindBtnRef = useRef(null);

  // Viewer width
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  // Gestion responsive du viewer width
  useLayoutEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    
    const measure = () => {
      const width = el.clientWidth || 0;
      // Ajuster la largeur selon la taille d'écran
      const isMobile = window.innerWidth < 768;
      setViewerWidth(isMobile ? Math.min(width - 32, 400) : width - 32);
    };
    
    measure();
    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, []);

  // Libération URL blob
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Chargement preview consolidée
  const loadConsolidatedPreview = useCallback(async () => {
    setLoadingPdf(true);
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      setPdfUrl(prev => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return download_url;
      });
      setNumPages(0);
    } catch (e) {
      logService.error(e);
      setPdfUrl(null);
      toast.error('Impossible de charger le PDF');
    } finally {
      setLoadingPdf(false);
    }
  }, [id]);

  // Chargement initial
  useEffect(() => {
    (async () => {
      try {
        const data = await signatureService.getEnvelope(id);
        setEnv(data);
        const docs = data.documents || [];
        setDocuments(docs);
        if (docs.length > 0) setSelectedDoc(docs[0]);
        await loadConsolidatedPreview();
      } catch (err) {
        logService.error(err);
        toast.error("Échec du chargement de l'enveloppe");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadConsolidatedPreview]);

  // Gestion des actions
  const handleClickDoc = async (doc) => {
    if (selectedDoc?.id === doc.id) return;
    setSelectedDoc(doc);
    await loadConsolidatedPreview();
    setSidebarOpen(false); // Fermer sidebar mobile après sélection
  };

  const handlePreview = () => {
    if (!pdfUrl) return;
    window.open(pdfUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = async () => {
    try {
      let blobHref = pdfUrl;
      let filename = env ? `${env.title}.pdf` : 'document.pdf';

      if (!blobHref) {
        const { download_url } = await signatureService.downloadEnvelope(env.id);
        blobHref = download_url;
      } else if (env?.status === 'completed') {
        filename = `${env.title}_signed.pdf`;
      }

      const a = document.createElement('a');
      a.href = blobHref;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Document téléchargé');
    } catch (e) {
      logService.error(e);
      toast.error('Échec du téléchargement');
    }
  };

  const handleRemind = async () => {
    setReminding(true);
    try {
      const { reminders } = await signatureService.remindNow(env.id);
      const n = reminders ?? 0;
      setReminderCount(n);
      setReminderModalOpen(true);
    } catch (e) {
      const msg = e?.response?.data?.error || 'Échec de la relance';
      toast.error(msg);
    } finally {
      setReminding(false);
    }
  };

  const closeReminderModal = () => {
    setReminderModalOpen(false);
    remindBtnRef.current?.focus();
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeReminderModal();
    };
    if (reminderModalOpen) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [reminderModalOpen]);

  // Callbacks react-pdf
  const onDocumentLoad = ({ numPages }) => setNumPages(numPages);
  const onDocumentError = (err) => {
    logService.error('PDF error:', err);
    toast.error('Erreur lors du chargement du PDF');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!env) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Enveloppe non trouvée</p>
          <Link 
            to="/signature/list" 
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700"
          >
            <FiArrowLeft className="w-4 h-4 mr-2" />
            Retour à la liste
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header mobile avec bouton menu */}
      <div className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <FiMenu className="w-5 h-5" />
        </button>
        <h1 className="font-semibold text-gray-900 truncate mx-4 flex-1">{env.title}</h1>
        <div className="flex space-x-2">
          <button
            onClick={handlePreview}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Ouvrir dans un nouvel onglet"
          >
            <FiExternalLink className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            title="Télécharger"
          >
            <FiDownload className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="flex h-screen lg:h-auto">
        {/* Sidebar - responsive */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:w-1/3 lg:min-w-0 lg:max-w-md
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}>
          {/* Header sidebar mobile */}
          <div className="lg:hidden flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Détails</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          {/* Contenu sidebar */}
          <div className="overflow-y-auto h-full lg:h-auto p-4 lg:p-6 space-y-6">
            {/* Titre desktop */}
            <div className="hidden lg:block">
              <h1 className="text-xl lg:text-2xl font-bold mb-2 break-words">{env.title}</h1>
            </div>

            {/* Documents */}
            {documents.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold mb-3">Documents</h2>
                <div className="space-y-1">
                  {documents.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => handleClickDoc(doc)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedDoc?.id === doc.id 
                          ? 'bg-blue-100 text-blue-700 border border-blue-200' 
                          : 'hover:bg-gray-100'
                      }`}
                    >
                      {doc.name || `Document ${doc.id}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Métadonnées */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <strong className="text-sm text-gray-600">Statut :</strong>
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium mt-1 sm:mt-0 self-start ${
                    env.status === 'completed' ? 'bg-green-100 text-green-800' :
                    env.status === 'sent' ? 'bg-blue-100 text-blue-800' :
                    env.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {env.status === 'completed' ? 'Signé' :
                     env.status === 'sent' ? 'Envoyé' :
                     env.status === 'cancelled' ? 'Annulé' : 'Brouillon'}
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <strong className="text-sm text-gray-600">Version :</strong>
                  <span className="text-sm text-gray-800 mt-1 sm:mt-0">{env.version}</span>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <strong className="text-sm text-gray-600">Créé le :</strong>
                  <span className="text-sm text-gray-800 mt-1 sm:mt-0">
                    {new Date(env.created_at).toLocaleDateString()}
                  </span>
                </div>

                {env.deadline_at && (
                  <div className="flex flex-col sm:flex-row sm:justify-between">
                    <strong className="text-sm text-gray-600">Échéance :</strong>
                    <span className="text-sm text-gray-800 mt-1 sm:mt-0">
                      {new Date(env.deadline_at).toLocaleDateString()}
                    </span>
                  </div>
                )}
                
                <div className="flex flex-col sm:flex-row sm:justify-between">
                  <strong className="text-sm text-gray-600">Flux :</strong>
                  <span className="text-sm text-gray-800 mt-1 sm:mt-0">
                    {env.flow_type === 'sequential' ? 'Séquentiel' : 'Parallèle'}
                  </span>
                </div>

                {env.hash_original && (
                  <div className="flex flex-col">
                    <strong className="text-sm text-gray-600 mb-1">Hachage original :</strong>
                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded break-all">
                      {env.hash_original.substring(0, 32)}...
                    </span>
                  </div>
                )}
              </div>

              {/* Countdown */}
              {env.deadline_at && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <div className="flex items-center mb-2">
                    <FiClock className="w-4 h-4 text-orange-600 mr-2" />
                    <span className="text-sm font-medium text-orange-800">Temps restant</span>
                  </div>
                  <Countdown targetIso={env.deadline_at} className="text-orange-700" />
                </div>
              )}

              {/* Bouton relance */}
              {(env.status === 'sent' || env.status === 'pending') && (
                <button
                  ref={remindBtnRef}
                  onClick={handleRemind}
                  disabled={reminding}
                  className={`w-full px-4 py-2 rounded-lg transition-colors text-white text-sm font-medium ${
                    reminding 
                      ? 'bg-amber-300 cursor-wait' 
                      : 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700'
                  }`}
                >
                  {reminding ? 'Envoi...' : 'Relancer maintenant'}
                </button>
              )}
            </div>

            {/* Progression */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-700">Progression</span>
                <span className="text-sm font-bold text-gray-800">
                  {env.completion_rate?.toFixed(0) || 0}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${env.completion_rate || 0}%` }}
                />
              </div>
            </div>

            {/* Actions - Desktop uniquement (mobile dans header) */}
            <div className="hidden lg:flex flex-col space-y-3">
              <button
                onClick={handlePreview}
                className="w-full bg-green-500 text-white px-4 py-2 rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
              >
                <FiExternalLink className="w-4 h-4 inline mr-2" />
                Ouvrir dans un nouvel onglet
              </button>
              <button
                onClick={handleDownload}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
              >
                <FiDownload className="w-4 h-4 inline mr-2" />
                Télécharger
              </button>
              <Link
                to="/signature/list"
                className="w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-center text-sm font-medium flex items-center justify-center"
              >
                <FiArrowLeft className="w-4 h-4 mr-2" />
                Retour à la liste
              </Link>
            </div>
          </div>
        </div>

        {/* Overlay mobile pour fermer sidebar */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black bg-opacity-25 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Viewer PDF - Responsive */}
        <div className="flex-1 min-w-0">
          <div
            className="h-screen lg:h-auto overflow-y-auto bg-gray-100 p-2 lg:p-4"
            ref={viewerRef}
            style={{ scrollbarGutter: 'stable' }}
          >
            {loadingPdf ? (
              <div className="flex justify-center items-center h-full min-h-96">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600">Chargement du PDF...</p>
                </div>
              </div>
            ) : !pdfUrl ? (
              <div className="flex justify-center items-center h-full min-h-96">
                <p className="text-gray-600 text-center">Prévisualisation indisponible.</p>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4">
                <Document
                  key={env?.status === 'completed' ? `signed-${env.id}` : `orig-${env.id}-${selectedDoc?.id || 'single'}`}
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoad}
                  onLoadError={onDocumentError}
                  loading={
                    <div className="text-center py-8">
                      <div className="animate-pulse text-gray-500">Chargement PDF...</div>
                    </div>
                  }
                >
                  {Array.from({ length: numPages }, (_, i) => (
                    <div key={i} className="relative mb-4 lg:mb-6 shadow-lg rounded-lg overflow-hidden">
                      <Page
                        pageNumber={i + 1}
                        width={Math.max(viewerWidth, 300)}
                        renderTextLayer={false}
                        className="mx-auto"
                      />
                    </div>
                  ))}
                </Document>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions flottantes mobile */}
      <div className="lg:hidden fixed bottom-4 left-4 right-4 z-30">
        <div className="bg-white rounded-xl shadow-xl border border-gray-200 p-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handlePreview}
              className="flex items-center justify-center px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm font-medium"
            >
              <FiExternalLink className="w-4 h-4 mr-2" />
              Ouvrir
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center justify-center px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium"
            >
              <FiDownload className="w-4 h-4 mr-2" />
              Télécharger
            </button>
          </div>
          <Link
            to="/signature/list"
            className="mt-3 w-full bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 transition-colors text-center text-sm font-medium flex items-center justify-center"
          >
            <FiArrowLeft className="w-4 h-4 mr-2" />
            Retour à la liste
          </Link>
        </div>
      </div>

      {/* Modal rappel */}
      <ReminderModal
        open={reminderModalOpen}
        count={reminderCount}
        onClose={closeReminderModal}
      />
    </div>
  );
};

export default DocumentDetail;
