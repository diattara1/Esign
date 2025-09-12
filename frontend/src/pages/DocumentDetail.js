// src/pages/DocumentDetail.js
// Version plus épurée, responsive sur tablette/mobile, intuitive et allégée

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
import useIsMobile from '../hooks/useIsMobile';

function ReminderModal({ open, count, onClose }) {
  const dialogRef = useRef(null);
  useFocusTrap(dialogRef, open);
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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

  const isMobile = useIsMobile();
  const signedCount = env?.recipients?.filter(r => r.signed).length || 0;
  const totalRecipients = env?.recipients?.length || 0;

  // Gestion responsive du viewer width avec breakpoints tablette
  useLayoutEffect(() => {
    const el = viewerRef.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth || 0;
      let adjustedWidth = width - 32;
      if (width < 640) { // Mobile
        adjustedWidth = Math.min(adjustedWidth, 400);
      } else if (width < 1024) { // Tablette
        adjustedWidth = Math.min(adjustedWidth, 600);
      }
      setViewerWidth(adjustedWidth);
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
        if (!isMobile) {
          await loadConsolidatedPreview();
        }
      } catch (err) {
        logService.error(err);
        toast.error("Échec du chargement de l'enveloppe");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadConsolidatedPreview, isMobile]);

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

  // Callbacks react-pdf
  const onDocumentLoad = ({ numPages }) => setNumPages(numPages);
  const onDocumentError = (err) => {
    logService.error('PDF error:', err);
    toast.error('Erreur lors du chargement du PDF');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!env) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-gray-600 text-base">Enveloppe non trouvée</p>
          <Link 
            to="/signature/list" 
            className="mt-4 inline-flex items-center text-blue-600 hover:text-blue-700 text-sm"
          >
            <FiArrowLeft className="w-4 h-4 mr-1" />
            Retour
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header mobile/tablette avec menu simplifié */}
      <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <FiMenu className="w-5 h-5 text-gray-700" />
        </button>
        <h1 className="font-medium text-gray-900 truncate flex-1 text-center text-base">{env.title}</h1>
        <div className="flex space-x-2">
          <button
            onClick={handlePreview}
            className="p-2 rounded-md hover:bg-gray-100"
            title="Ouvrir"
          >
            <FiExternalLink className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 rounded-md hover:bg-gray-100"
            title="Télécharger"
          >
            <FiDownload className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="flex h-[calc(100vh-60px)] md:h-screen lg:h-auto">
        {/* Sidebar - épurée et responsive (w-72 sur tablette, w-80 sur desktop) */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-72 md:w-80 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out
          md:relative md:translate-x-0 md:w-1/3 md:min-w-0 md:max-w-sm lg:max-w-md
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          {/* Header sidebar mobile simplifié */}
          <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-base font-medium text-gray-900">Détails</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-2 rounded-md hover:bg-gray-100"
            >
              <FiX className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          {/* Contenu sidebar épuré : plus d'espace, moins de bordures */}
          <div className="overflow-y-auto h-full p-4 md:p-6 space-y-6">
            {/* Titre desktop simplifié */}
            <div className="hidden md:block">
              <h1 className="text-xl font-semibold text-gray-900 break-words">{env.title}</h1>
            </div>

            {/* Documents : liste simplifiée */}
            {documents.length > 0 && (
              <div>
                <h2 className="text-base font-medium text-gray-700 mb-2">Documents</h2>
                <div className="space-y-1">
                  {documents.map(doc => (
                    <button
                      key={doc.id}
                      onClick={() => handleClickDoc(doc)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedDoc?.id === doc.id 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'hover:bg-gray-50 text-gray-800'
                      }`}
                    >
                      {doc.name || `Document ${doc.id}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Métadonnées : grille simplifiée, moins de texte */}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-gray-600">Statut</span>
                <span className={`text-right font-medium ${
                  env.status === 'completed' ? 'text-green-600' :
                  env.status === 'sent' ? 'text-blue-600' :
                  env.status === 'cancelled' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {env.status === 'completed' ? 'Signé' :
                   env.status === 'sent' ? 'Envoyé' :
                   env.status === 'cancelled' ? 'Annulé' : 'Brouillon'}
                </span>
                
                <span className="text-gray-600">Version</span>
                <span className="text-right text-gray-800">{env.version}</span>
                
                <span className="text-gray-600">Créé le</span>
                <span className="text-right text-gray-800">
                  {new Date(env.created_at).toLocaleDateString()}
                </span>

                {env.deadline_at && (
                  <>
                    <span className="text-gray-600">Échéance</span>
                    <span className="text-right text-gray-800">
                      {new Date(env.deadline_at).toLocaleDateString()}
                    </span>
                  </>
                )}
                
                <span className="text-gray-600">Flux</span>
                <span className="text-right text-gray-800">
                  {env.flow_type === 'sequential' ? 'Séquentiel' : 'Parallèle'}
                </span>
              </div>

              {env.hash_original && (
                <div>
                  <span className="text-sm text-gray-600 block mb-1">Hachage original</span>
                  <span className="text-xs font-mono bg-gray-50 px-2 py-1 rounded break-all text-gray-700">
                    {env.hash_original.substring(0, 32)}...
                  </span>
                </div>
              )}
            </div>

            {/* Countdown : allégé */}
            {env.deadline_at && env.status !== 'completed' && (
              <div className="bg-orange-50 rounded-md p-3">
                <div className="flex items-center mb-1">
                  <FiClock className="w-4 h-4 text-orange-600 mr-2" />
                  <span className="text-sm text-orange-700">Temps restant</span>
                </div>
                <Countdown targetIso={env.deadline_at} className="text-orange-700 text-sm" />
              </div>
            )}

            {/* Bouton relance : simplifié */}
            {(env.status === 'sent' || env.status === 'pending') && (
              <button
                ref={remindBtnRef}
                onClick={handleRemind}
                disabled={reminding}
                className={`w-full px-4 py-2 rounded-md text-white text-sm font-medium transition-colors ${
                  reminding 
                    ? 'bg-amber-300 cursor-wait' 
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                {reminding ? 'Envoi...' : 'Relancer'}
              </button>
            )}

            {/* Progression : bar plus fine */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-700">
                <span>Progression</span>
                <span className="font-medium">{env.completion_rate?.toFixed(0) || 0}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${env.completion_rate || 0}%` }}
                />
              </div>
            </div>

            {/* Destinataires : accordion simplifié */}
            {totalRecipients > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer flex justify-between text-gray-700">
                  <span>Statut : {signedCount}/{totalRecipients} signés</span>
                  <span className="text-blue-600">Détails</span>
                </summary>
                <ul className="mt-2 space-y-1 pl-2">
                  {env.recipients.map((r, idx) => (
                    <li key={r.id || idx} className="flex justify-between text-gray-800">
                      <span>{r.full_name || r.email}</span>
                      <span className={`${r.signed ? 'text-green-600' : 'text-yellow-600'}`}>
                        {r.signed ? 'Signé' : 'En attente'}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Actions desktop : boutons simplifiés */}
            <div className="hidden md:flex flex-col space-y-2 mt-4">
              <button
                onClick={handlePreview}
                className="w-full bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 text-sm font-medium flex items-center justify-center"
              >
                <FiExternalLink className="w-4 h-4 mr-2" />
                Ouvrir
              </button>
              <button
                onClick={handleDownload}
                className="w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 text-sm font-medium flex items-center justify-center"
              >
                <FiDownload className="w-4 h-4 mr-2" />
                Télécharger
              </button>
              <Link
                to="/signature/list"
                className="w-full bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-medium flex items-center justify-center"
              >
                <FiArrowLeft className="w-4 h-4 mr-2" />
                Retour
              </Link>
            </div>
          </div>
        </div>

        {/* Overlay mobile/tablette */}
        {sidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black bg-opacity-25 z-40"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Viewer PDF : plus centré, chargement intuitif */}
        <div className="flex-1 min-w-0 bg-gray-100">
          <div
            className="h-full overflow-y-auto p-2 md:p-4"
            ref={viewerRef}
            style={{ scrollbarGutter: 'stable' }}
          >
            {loadingPdf ? (
              <div className="flex justify-center items-center h-full min-h-[50vh]">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-gray-600 text-sm">Chargement PDF...</p>
                </div>
              </div>
            ) : !pdfUrl ? (
              <div className="flex justify-center items-center h-full min-h-[50vh]">
                {isMobile ? (
                  <button
                    onClick={loadConsolidatedPreview}
                    className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm"
                  >
                    Voir le document
                  </button>
                ) : (
                  <p className="text-gray-600 text-sm text-center">Prévisualisation indisponible.</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-4 max-w-3xl mx-auto">
                <Document
                  key={env?.status === 'completed' ? `signed-${env.id}` : `orig-${env.id}-${selectedDoc?.id || 'single'}`}
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoad}
                  onLoadError={onDocumentError}
                  loading={
                    <div className="text-center py-8">
                      <div className="animate-pulse text-gray-500 text-sm">Chargement PDF...</div>
                    </div>
                  }
                >
                  {Array.from({ length: numPages }, (_, i) => (
                    <div key={i} className="mb-4 shadow-md rounded-md overflow-hidden bg-white">
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

      {/* Modal rappel : inchangé, déjà épuré */}
      <ReminderModal
        open={reminderModalOpen}
        count={reminderCount}
        onClose={closeReminderModal}
      />
    </div>
  );
};

export default DocumentDetail;