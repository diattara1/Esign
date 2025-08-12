// src/pages/DocumentDetail.js
// Preview avec react-pdf alignée sur le comportement de downloadEnvelope()
// => affiche le PDF signé s'il existe, sinon l'original, comme le bouton Télécharger.

import React, { useEffect, useState, useCallback, useLayoutEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const DocumentDetail = () => {
  const { id } = useParams();

  // Enveloppe / docs
  const [env, setEnv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);

  // PDF (react-pdf) – on affiche toujours la version consolidée (signée si dispo)
  const [pdfUrl, setPdfUrl] = useState(null);   // object URL
  const [numPages, setNumPages] = useState(0);
  const [loadingPdf, setLoadingPdf] = useState(false);

  // Viewer width stable (évite zoom/reflow)
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  useLayoutEffect(() => {
    const el = viewerRef.current;
    if (!el) return;
    const measure = () => setViewerWidth(el.clientWidth || 0);
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

  // Libère l’URL blob quand elle change / unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Charge la preview consolidée (signée si existe)
  const loadConsolidatedPreview = useCallback(async () => {
    setLoadingPdf(true);
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      // download_url est déjà un object URL (créé dans le service)
      setPdfUrl(prev => {
        if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
        return download_url;
      });
      setNumPages(0);
    } catch (e) {
      console.error(e);
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
        if (docs.length > 0) setSelectedDoc(docs[0]); // pour l’UI
        await loadConsolidatedPreview(); // toujours la version consolidée
      } catch (err) {
        console.error(err);
        toast.error("Échec du chargement de l'enveloppe");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, loadConsolidatedPreview]);

  // Clic sur un doc → on garde la même preview consolidée (signée si dispo)
  const handleClickDoc = async (doc) => {
    if (selectedDoc?.id === doc.id) return;
    setSelectedDoc(doc);
    await loadConsolidatedPreview();
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
      console.error(e);
      toast.error('Échec du téléchargement');
    }
  };

  // Callbacks react-pdf
  const onDocumentLoad = ({ numPages }) => setNumPages(numPages);
  const onDocumentError = (err) => {
    console.error('PDF error:', err);
    toast.error('Erreur lors du chargement du PDF');
  };

  if (loading) return <div className="p-6">Chargement...</div>;
  if (!env) return <div className="p-6">Enveloppe non trouvée</div>;

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-1/3 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Détails : {env.title}</h1>

          {documents.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-lg font-semibold">Documents</h2>
                
              </div>
              <ul className="space-y-1">
                {documents.map(doc => (
                  <li key={doc.id}>
                    <button
                      onClick={() => handleClickDoc(doc)}
                      className={`w-full text-left px-2 py-1 rounded ${
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

          {/* Meta */}
          <div className="space-y-2 mb-6">
            <div>
              <strong>Statut :</strong>{' '}
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
            </div>
            <div><strong>Version :</strong> {env.version}</div>
            <div><strong>Créé le :</strong> {new Date(env.created_at).toLocaleDateString()}</div>
            {env.hash_original && (
              <div>
                <strong>Hachage original :</strong>{' '}
                <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded ml-2">
                  {env.hash_original.substring(0, 16)}…
                </span>
              </div>
            )}
            <div><strong>Flux :</strong> {env.flow_type === 'sequential' ? 'Séquentiel' : 'Parallèle'}</div>
            {env.deadline_at && (<div><strong>Échéance :</strong> {new Date(env.deadline_at).toLocaleDateString()}</div>)}
          </div>

          {/* Progression */}
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Progression de signature</span>
              <span className="text-sm text-gray-600">{env.completion_rate?.toFixed(0) || 0}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${env.completion_rate || 0}%` }}
              />
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handlePreview}
              className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 transition-colors"
            >
              Ouvrir dans un nouvel onglet
            </button>
            <button
              onClick={handleDownload}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
            >
              Télécharger
            </button>
            <Link
              to="/signature/list"
              className="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600 transition-colors text-center block"
            >
              Retour à la liste
            </Link>
          </div>
        </div>
      </div>

      {/* Viewer react-pdf – toujours la version consolidée (signée si dispo) */}
      <div
        className="flex-1 p-4 overflow-y-scroll bg-gray-100"
        ref={viewerRef}
        style={{ scrollbarGutter: 'stable' }}
      >
        {loadingPdf ? (
          <div className="flex justify-center items-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Chargement du PDF...</p>
            </div>
          </div>
        ) : !pdfUrl ? (
          <div className="p-8 text-center text-gray-600">Prévisualisation indisponible.</div>
        ) : (
          <Document
            key={env?.status === 'completed' ? `signed-${env.id}` : `orig-${env.id}-${selectedDoc?.id || 'single'}`}
            file={pdfUrl}
            onLoadSuccess={onDocumentLoad}
            onLoadError={onDocumentError}
            loading={<div>Chargement PDF…</div>}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="relative mb-6">
                <Page
                  pageNumber={i + 1}
                  width={viewerWidth || 600}
                  renderTextLayer={false}
                />
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
};

export default DocumentDetail;
