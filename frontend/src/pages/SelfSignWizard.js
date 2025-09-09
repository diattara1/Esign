import React, { useEffect, useRef, useState, useLayoutEffect, useMemo, useCallback } from 'react';
import useResponsivePdf from '../hooks/useResponsivePdf';
import useIsMobile from '../hooks/useIsMobile';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiUpload, FiEdit3, FiTrash2 } from 'react-icons/fi';
import DraggableSignature from '../components/DraggableSignature';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
import SignatureModal from '../components/SignatureModal';
import { fileToPngDataURL, blobToPngDataURL, savedSignatureImageUrl, fetchSavedSignatureAsDataURL } from '../utils/signatureUtils';
import SignatureHeader from '../components/SignatureHeader';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/* -------------------------- helpers compacts -------------------------- */

/* ------------------------------ composant ------------------------------ */

export default function SelfSignWizard() {
  // PDF + viewer
  const [file, setFile] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});
  const [docKey, setDocKey] = useState(0); // force remount Document quand on change le PDF
  const viewerRef = useRef(null);
  const fileInputRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  // UI
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}

  // Signatures
  const [sigDataUrl, setSigDataUrl] = useState('');
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Option QR (checkbox)
  const [includeQr, setIncludeQr] = useState(true);

  // Modal signature
  const [modalOpen, setModalOpen] = useState(false);

  const { pageWidth, pageScale } = useResponsivePdf(viewerWidth, pageDims, isMobile);

  /* layout + responsive width (mesure + breakpoints) */
  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    measure();
    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Fermer le tiroir sur Échap (mobile)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Empêche le scroll derrière le tiroir mobile
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

  // Charger les signatures enregistrées
  useEffect(() => {
    signatureService.listSavedSignatures().then(setSavedSignatures).catch(() => {});
  }, []);

  // Révoquer l'URL objet précédente pour éviter fuites mémoire
  useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  // Upload (1 seul PDF)
  const onFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (e.target.files?.length > 1) toast.info('Un seul PDF est pris en compte.');

    // Nettoyage ancien PDF
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setNumPages(0);
    setPageDims({});
    setPlacement(null);
    setSigDataUrl('');

    if (!f) {
      setFile(null);
      setPdfUrl(null);
      setDocKey((k) => k + 1);
      return;
    }

    // Nouveau PDF
    const url = URL.createObjectURL(f);
    setFile(f);
    setPdfUrl(url);
    setDocKey((k) => k + 1);

    // réinitialiser l'input pour permettre re-sélection du même fichier
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (isMobile) setSidebarOpen(false);
  };

  // react-pdf
  const onDocLoad = ({ numPages }) => setNumPages(numPages);
  const onPageLoad = (n, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDims((d) => ({ ...d, [n]: { width: vp.width, height: vp.height } }));
  };

  // pose de zone
  const handleOverlayClick = (e, pageNumber) => {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = pageScale(pageNumber);
    const pageHeightPx = (pageDims[pageNumber]?.height || 0) * scale;
    const x = (e.clientX - rect.left) / pageWidth;
    const y = (e.clientY - rect.top) / pageHeightPx;
    setPlacement({
      page: pageNumber,
      x,
      y,
      width: 160 / pageWidth,
      height: 50 / pageHeightPx,
    });
    setPlacing(false);
    toast.success(`Zone posée p.${pageNumber}`);
    if (isMobile) setSidebarOpen(false);
    // Ouvre direct le modal à la création
    setTimeout(() => setModalOpen(true), 0);
  };

  const openSignatureModal = () => {
    if (!placement) return toast.info('Définis d’abord la zone');
    setModalOpen(true);
  };

  const handleModalConfirm = (dataUrl) => {
    setSigDataUrl(dataUrl);
    setModalOpen(false);
    toast.success('Signature ajoutée');
  };

  // envoi (sync)
  const submit = async () => {
    if (!file) return toast.error('Ajoute un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigDataUrl) return toast.error('Ajoute une image de signature');

    setIsProcessing(true);
    const fd = new FormData();
    fd.append('files[]', file);
    fd.append('placements', JSON.stringify([placement]));
    fd.append('signature_image', sigDataUrl);        // data:image/png;base64,...
    fd.append('sync', 'true');
    fd.append('include_qr', includeQr ? 'true' : 'false');

    try {
      const response = await signatureService.selfSign(fd, { sync: true });
      const url = URL.createObjectURL(response.data);
      const name = (file.name || 'document').replace(/\.pdf$/i, '');
      const a = document.createElement('a'); a.href = url; a.download = `${name}_signed.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Document signé et téléchargé');
    } catch (e) {
      const msg = (await (async () => {
        if (e?.response?.data instanceof Blob) {
          const t = await e.response.data.text(); try { return JSON.parse(t).error || t; } catch { return t; }
        }
        return e?.response?.data?.error || e.message || 'Erreur inconnue';
      })());
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const containerOverlayStyle = isMobile && sidebarOpen ? { touchAction: 'none' } : {};

  return (
    <div className="flex h-screen bg-gray-50" style={containerOverlayStyle}>
      {/* Overlay mobile (fluide, intégré) */}
      {isMobile && (
        <div
          className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar / panneau d'options */}
      <aside
        id="mobile-panel"
        className={`${isMobile ? `fixed inset-y-0 left-0 z-40 w-full max-w-sm transform transition-transform duration-300 ease-in-out will-change-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}` : 'w-1/3 max-w-md'} bg-white border-r border-gray-200 flex flex-col`}
        aria-hidden={!sidebarOpen && isMobile}
      >
        {/* Upload + options */}
        <div className="relative z-40 bg-white h-full flex flex-col">
          {/* Upload PDF */}
          <div className="p-4 md:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg"><FiEdit3 className="w-5 h-5 text-emerald-600" /></div>
                <h1 className="text-lg md:text-xl font-bold text-gray-900">Auto-signature</h1>
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-2">PDF</label>
            <div className="relative">
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
                <FiUpload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Clique ou glisse ton PDF</p>
                <p className="text-xs text-gray-400 mt-1">Un seul document</p>
              </div>
            </div>
            {file && (
              <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                <span className="truncate">{file.name}</span>
                <button onClick={() => {
                  // Nettoyage complet
                  if (pdfUrl) URL.revokeObjectURL(pdfUrl);
                  setFile(null);
                  setPdfUrl(null);
                  setPlacement(null);
                  setSigDataUrl('');
                  setNumPages(0);
                  setPageDims({});
                  setDocKey((k) => k + 1);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }} className="ml-2 text-red-500 hover:text-red-700"><FiTrash2 className="w-4 h-4" /></button>
              </div>
            )}
          </div>

          {/* Options */}
          <div className="p-4 md:p-6 border-b border-gray-200">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={includeQr}
                onChange={(e) => setIncludeQr(e.target.checked)}
                className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Apposer un code QR (recommandé)
            </label>
          </div>

          {/* Actions */}
          <div className="p-4 md:p-6 bg-gray-50 mt-auto">
            <button onClick={() => { setPlacing(true); if (isMobile) setSidebarOpen(false); }}
                    disabled={!pdfUrl}
                    className={`w-full mb-3 px-4 py-3 rounded-lg font-medium ${placing ? 'bg-yellow-500 text-white' : 'bg-emerald-500 text-white hover:bg-emerald-600'} disabled:opacity-50`}>
              {placement ? 'Redéfinir la zone' : 'Définir la zone'}
            </button>

            {/* plus de bouton "modifier" : on clique directement dans la zone */}
            <p className="text-xs text-gray-500 mb-3">Astuce : cliquez sur la zone pour signer ou modifier.</p>

            <button onClick={submit}
                    disabled={isProcessing || !file || !placement || !sigDataUrl}
                    className="w-full px-4 py-3 bg-gradient-to-r from-emerald-600 to-blue-600 text-white font-medium rounded-lg hover:from-emerald-700 hover:to-blue-700 disabled:opacity-50">
              {isProcessing ? 'Signature…' : 'Signer et télécharger'}
            </button>
          </div>
        </div>
      </aside>

      {/* Viewer */}
      <div className="flex-1 flex flex-col" ref={viewerRef}>
        <SignatureHeader
          title={file ? file.name : 'Aperçu PDF'}
          placement={placement}
          placing={placing}
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
        />

        <div className="flex-1 overflow-auto bg-gray-100" style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}>
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <div>
                <FiUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Ajoute un PDF pour prévisualiser</p>
                <p className="text-gray-400 text-sm mt-2">Signature rapide d’un document</p>
                {isMobile && <button onClick={toggleSidebar} className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg">Ouvrir les options</button>}
              </div>
            </div>
          ) : (
            <div className="p-3 md:p-6">
              <Document key={docKey} file={pdfUrl} onLoadSuccess={onDocLoad}
                        loading={<div className="flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" /></div>}
                        error={<div className="text-red-500 text-center p-8">Erreur lors du chargement du PDF</div>}>
                {Array.from({ length: numPages }, (_, i) => {
                  const n = i + 1;
                  const scale = pageScale(n);

                  const fieldObj = placement && placement.page === n
                    ? { position: { x: placement.x, y: placement.y, width: placement.width, height: placement.height } }
                    : null;

                  return (
                    <div key={i} className="relative mb-6 bg-white shadow-lg rounded-lg overflow-hidden">
                      <Page pageNumber={n} width={pageWidth} renderTextLayer={false} onLoadSuccess={(p) => onPageLoad(n, p)} className="mx-auto" />
                      {pageDims[n] && (
                        <div onClick={(e) => handleOverlayClick(e, n)}
                             className="absolute top-0 left-1/2 -translate-x-1/2"
                             style={{ width: pageWidth, height: pageDims[n].height * scale, cursor: placing ? 'crosshair' : 'default', zIndex: 10, backgroundColor: placing ? 'rgba(16,185,129,.08)' : 'transparent' }} />
                      )}

                      {fieldObj && (
                        <DraggableSignature
                          field={fieldObj}
                          pageWidth={pageWidth}
                          pageHeight={(pageDims[n]?.height || 0) * scale}
                          isMobileView={isMobile}
                          tapToPlace={isMobile}
                          onUpdate={(field, { position }) => setPlacement(p => ({ ...p, ...position }))}
                          onDelete={() => { setPlacement(null); setSigDataUrl(''); }}
                          onOpenModal={openSignatureModal}
                          image={sigDataUrl}
                        />
                      )}

                      <div className="absolute bottom-2 right-2 bg-gray-900/75 text-white text-sm px-2 py-1 rounded">Page {n}/{numPages}</div>
                    </div>
                  );
                })}
              </Document>
            </div>
          )}
        </div>

        {isProcessing && (
          <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80 text-center">
              <div className="mx-auto mb-4 w-10 h-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
              <h3 className="text-lg font-semibold text-gray-900">Signature en cours…</h3>
              <p className="text-sm text-gray-600 mt-1">Merci de patienter quelques secondes.</p>
            </div>
          </div>
        )}
      </div>

      {/* MODAL signature */}
      <SignatureModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleModalConfirm}
        savedSignatures={savedSignatures}
        initialDataUrl={sigDataUrl}
      />
    </div>
  );
}
