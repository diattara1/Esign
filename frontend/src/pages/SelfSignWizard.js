import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import useResponsivePdf from '../hooks/useResponsivePdf';
import useIsMobile from '../hooks/useIsMobile';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiUpload } from 'react-icons/fi';
import DraggableSignature from '../components/DraggableSignature';
import signatureService from '../services/signatureService';
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
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}
  const [step, setStep] = useState(0); // 0: upload, 1: zone, 2: signature

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

  // plus de tiroir latéral

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
      setStep(0);
      return;
    }

    // Nouveau PDF
    const url = URL.createObjectURL(f);
    setFile(f);
    setPdfUrl(url);
    setDocKey((k) => k + 1);
    setStep(1);

    // réinitialiser l'input pour permettre re-sélection du même fichier
    if (fileInputRef.current) fileInputRef.current.value = '';
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
    setStep(2);
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

  const resetAll = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setFile(null);
    setPdfUrl(null);
    setPlacement(null);
    setSigDataUrl('');
    setNumPages(0);
    setPageDims({});
    setDocKey((k) => k + 1);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setStep(0);
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
      resetAll();
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <SignatureHeader
        title={file ? file.name : 'Aperçu PDF'}
        placement={placement}
        placing={placing}
        isMobile={false}
        sidebarOpen={false}
        toggleSidebar={() => {}}
      />

      <div className="flex-1 overflow-auto bg-gray-100" ref={viewerRef} style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}>
        {!pdfUrl ? (
          <div className="flex items-center justify-center h-full p-6 text-center">
            <div>
              <FiUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 text-lg">Ajoute un PDF pour prévisualiser</p>
              <p className="text-gray-400 text-sm mt-2">Signature rapide d’un document</p>
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
                        onDelete={() => { setPlacement(null); setSigDataUrl(''); setStep(1); }}
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

      <div className="border-t bg-white p-4 space-y-4">
        {step === 0 && (
          <div className="text-center">
            <label className="block text-sm font-medium text-gray-700 mb-2">PDF</label>
            <div className="relative max-w-md mx-auto">
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={onFile} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                <FiUpload className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Clique ou glisse ton PDF</p>
              </div>
            </div>
            <div className="mt-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={includeQr} onChange={(e) => setIncludeQr(e.target.checked)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                Apposer un code QR (recommandé)
              </label>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">Définis la zone de signature sur le document.</p>
            <button onClick={() => setPlacing(true)} disabled={!pdfUrl} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg disabled:opacity-50">
              {placement ? 'Redéfinir la zone' : 'Définir la zone'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="text-center space-y-4">
            <p className="text-sm text-gray-600">Clique la zone pour modifier la signature si besoin.</p>
            <button onClick={submit} disabled={isProcessing || !file || !placement || !sigDataUrl} className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-blue-600 text-white rounded-lg disabled:opacity-50">
              {isProcessing ? 'Signature…' : 'Signer et télécharger'}
            </button>
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
