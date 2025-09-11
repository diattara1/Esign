import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import useResponsivePdf from '../hooks/useResponsivePdf';
import useIsMobile from '../hooks/useIsMobile';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiMove, FiFile } from 'react-icons/fi';
import DraggableSignature from '../components/DraggableSignature';
import signatureService from '../services/signatureService';
import SignatureModal from '../components/SignatureModal';
import { fileToPngDataURL, blobToPngDataURL, savedSignatureImageUrl, fetchSavedSignatureAsDataURL } from '../utils/signatureUtils';
import SignatureHeader from '../components/SignatureHeader';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/* -------------------------- helpers compacts -------------------------- */


// Normalise n'importe quelle dataURL (png/jpg/svg) en **PNG** dataURL
const ensurePngDataURL = async (dataUrl) => {
  if (!dataUrl) return '';
  if (dataUrl.startsWith('data:image/png')) return dataUrl;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width || 800;
  c.height = img.naturalHeight || img.height || 300;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL('image/png');
};

// Convertit dataURL -> Blob (fichier)
const dataURLtoBlob = (dataUrl) => {
  const [meta, b64] = dataUrl.split(',');
  const mime = (meta?.match(/data:(.*?);base64/) || [])[1] || 'image/png';
  const bin = atob(b64 || '');
  const len = bin.length;
  const u8 = new Uint8Array(len);
  for (let i = 0; i < len; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime });
};

/* ------------------------------ composant ------------------------------ */

export default function BulkSignSameWizard() {
  // ---- state ----
  const [files, setFiles] = useState([]);
  const [includeQr, setIncludeQr] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}

  const [sigDataUrl, setSigDataUrl] = useState('');
  const [sigSavedId, setSigSavedId] = useState(null); // id signature enregistrée
  const [savedSignatures, setSavedSignatures] = useState([]);

  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});
  const [docKey, setDocKey] = useState(0);
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const pdfsInputRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // responsive UI
  const isMobile = useIsMobile();
  const [step, setStep] = useState(0); // 0: upload, 1: zone, 2: signature

  const { pageWidth, pageScale } = useResponsivePdf(viewerWidth, pageDims, isMobile);

  /* ---------------- layout & responsive (aligné sur SelfSign) ---------------- */
  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    measure();
    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // plus de panneau latéral

  // Charger les signatures enregistrées
  useEffect(() => { signatureService.listSavedSignatures().then(setSavedSignatures).catch(()=>{}); }, []);

  // Nettoyage URL objet
  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  // ---- uploads ----
  const onFiles = (e) => {
    const arr = Array.from(e.target.files || []).filter((f) => f.type === 'application/pdf');
    if (!arr.length) { setFiles([]); setPdfUrl(null); setDocKey(k=>k+1); setStep(0); return; }

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setNumPages(0); setPageDims({}); setPlacement(null); setSigDataUrl(''); setSigSavedId(null);

    setFiles(arr);
    setPdfUrl(URL.createObjectURL(arr[0]));
    setDocKey((k) => k + 1);
    setStep(1);
    if (pdfsInputRef.current) pdfsInputRef.current.value = '';
  };

  // react-pdf
  const onDocLoad = ({ numPages }) => setNumPages(numPages);
  const onPageLoad = (n, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDims((d) => ({ ...d, [n]: { width: vp.width, height: vp.height } }));
  };


  // Placement zone
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
    toast.success(`Zone définie (page ${pageNumber}) — appliquée à tous les documents`);
    setStep(2);
    setTimeout(() => setModalOpen(true), 0);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const openSignatureModal = () => { if (!placement) return toast.info('Définis d’abord la zone'); setModalOpen(true); };
  const handleModalConfirm = (dataUrl, savedId = null) => { setSigDataUrl(dataUrl); setSigSavedId(savedId); setModalOpen(false); toast.success('Signature ajoutée'); };

  // ---- submit + polling ----
  const submit = async () => {
    if (!files.length) return toast.error('Ajoute au moins un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigDataUrl && !sigSavedId) return toast.error('Ajoute une image de signature');

    const fd = new FormData();
    files.forEach((f) => fd.append('files', f)); // aligné avec SelfSign
    fd.append('mode', 'bulk_same_spot');
    fd.append('placements', JSON.stringify([placement]));
    fd.append('include_qr', includeQr ? 'true' : 'false');

    if (sigSavedId) {
      fd.append('use_saved_signature_id', String(sigSavedId));
    } else {
      const pngDataUrl = await ensurePngDataURL(sigDataUrl);
      const blob = dataURLtoBlob(pngDataUrl.replace(/^data:image\/[^;]+/, 'data:image/png'));
      if (!blob || !blob.size) return toast.error('Signature vide — revalide ta signature ou réessaie.');
      fd.append('signature_image', blob, 'signature.png');
    }

    setIsProcessing(true);
    try {
      const job = await signatureService.createBatchSign(fd);
      const poll = async () => {
        const j = await signatureService.getBatchJob(job.id);
        if (['completed', 'partial', 'failed'].includes(j.status)) {
          clearInterval(pollingRef.current); pollingRef.current = null;
          if (j.result_zip) {
            const { url } = await signatureService.downloadBatchZip(j.id);
            const a = document.createElement('a'); a.href = url; a.download = `batch_${j.id}.zip`; a.click(); URL.revokeObjectURL(url);
          }
          toast.info(`Terminé: ${j.done}/${j.total} — échecs: ${j.failed || 0}`);
          setIsProcessing(false);
          resetAll();
          setStep(0);
        }
      };
      await poll();
      pollingRef.current = setInterval(poll, 2000);
    } catch (e) {
      setIsProcessing(false);
      const err = e?.response?.data;
      if (err instanceof Blob) {
        try { const t = await err.text(); const j = JSON.parse(t); toast.error(j?.error || t); } catch { toast.error('Erreur inconnue'); }
      } else {
        toast.error(e?.response?.data?.error || 'Erreur au lancement du job');
      }
    }
  };

  const pollingRef = useRef(null);
  useEffect(() => () => pollingRef.current && clearInterval(pollingRef.current), []);

  const resetAll = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setFiles([]); setPdfUrl(null); setPlacement(null); setSigDataUrl(''); setSigSavedId(null);
    setNumPages(0); setPageDims({}); setDocKey((k) => k + 1);
    if (pdfsInputRef.current) pdfsInputRef.current.value = '';
    setStep(0);
  };

  /* ------------------------------ UI ------------------------------ */


  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <SignatureHeader
        title={files[0]?.name || 'Aperçu PDF'}
        placement={placement}
        placing={placing}
        isMobile={false}
        sidebarOpen={false}
        toggleSidebar={() => {}}
      />

      <div className="flex flex-col md:flex-row flex-1">
        <div
          className="order-1 md:order-2 flex-1 overflow-auto bg-gray-100"
          ref={viewerRef}
          style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}
        >
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <div>
                <FiLayers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Ajoute des PDF pour commencer</p>
                <p className="text-gray-400 text-sm mt-2">La zone choisie sera appliquée à tous les documents</p>
              </div>
            </div>
          ) : (
            <div className="p-3 md:p-6">
              <div className="bg-white rounded-lg shadow-sm">
                <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                  <h3 className="font-medium text-gray-800">Aperçu du premier document</h3>
                  <p className="text-sm text-gray-600">Définis la zone de signature qui sera appliquée sur {files.length} document(s)</p>
                </div>
                <div className="py-3 md:py-6">
                  <Document
                    key={docKey}
                    file={pdfUrl}
                    onLoadSuccess={onDocLoad}
                    loading={<div className="flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}
                    error={<div className="text-red-500 text-center p-8">Erreur lors du chargement du PDF</div>}
                  >
                    {Array.from({ length: numPages }, (_, i) => {
                      const n = i + 1;
                      const s = pageScale(n);
                      const fieldObj = placement && placement.page === n ? { position: { x: placement.x, y: placement.y, width: placement.width, height: placement.height } } : null;
                      return (
                        <div key={i} className="relative mb-6 bg-white shadow rounded-lg overflow-hidden">
                          <Page
                            pageNumber={n}
                            width={pageWidth}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                            onLoadSuccess={(p) => onPageLoad(n, p)}
                            className="mx-auto"
                          />
                          {pageDims[n] && (
                            <div
                              onClick={(e) => handleOverlayClick(e, n)}
                              className="absolute top-0 left-1/2 -translate-x-1/2"
                              style={{ width: pageWidth, height: pageDims[n].height * s, cursor: placing ? 'crosshair' : 'default', zIndex: 10, backgroundColor: placing ? 'rgba(59,130,246,.06)' : 'transparent' }}
                            />
                          )}
                          {fieldObj && (
                            <DraggableSignature
                              field={fieldObj}
                              pageWidth={pageWidth}
                              pageHeight={(pageDims[n]?.height || 0) * s}
                              isMobileView={isMobile}
                              tapToPlace={isMobile}
                              onUpdate={(field, { position }) => setPlacement(p => ({ ...p, ...position }))}
                              onDelete={() => { setPlacement(null); setSigDataUrl(''); setSigSavedId(null); setStep(1); }}
                              onOpenModal={openSignatureModal}
                              image={sigDataUrl}
                            />
                          )}
                          <div className="absolute bottom-2 right-2 bg-gray-900/75 text-white text-xs px-2 py-1 rounded">Page {n}/{numPages}</div>
                        </div>
                      );
                    })}
                  </Document>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="order-2 md:order-1 md:w-64 md:border-r md:border-t-0 border-t bg-white p-4 space-y-4">
          {step === 0 && (
            <div className="text-center">
              <label className="block font-medium mb-2 text-gray-700">PDF(s)</label>
              <input ref={pdfsInputRef} type="file" accept="application/pdf" multiple onChange={onFiles}
                   className="w-full max-w-md mx-auto text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            <div className="mt-4">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={includeQr} onChange={(e) => setIncludeQr(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />Apposer un code QR (recommandé)</label>
            </div>
          </div>
        )}

          {step === 1 && (
            <div className="text-center space-y-4">
              {!!files.length && (
                <div className="max-w-md mx-auto bg-gray-50 rounded-lg p-3 overflow-y-auto max-h-32">
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center text-sm text-gray-700 mb-1 last:mb-0"><FiFile className="w-4 h-4 mr-2 text-blue-500" /><span className="truncate">{f.name}</span></div>
                  ))}
                </div>
              )}
              <p className="text-sm text-gray-600">Définis la zone de signature.</p>
              <button onClick={() => setPlacing(true)} disabled={!files.length} className={`px-4 py-2 rounded-lg text-white font-medium transition ${placing ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'}`}>
                {placing ? (<><FiMove className="inline w-4 h-4 mr-2" />Clique sur le PDF</>) : (placement ? 'Redéfinir la zone' : 'Définir la zone')}
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="text-center space-y-4">
              <p className="text-sm text-gray-600">Clique la zone pour modifier la signature si besoin.</p>
              <button onClick={submit} disabled={!files.length || !placement || (!sigDataUrl && !sigSavedId) || isProcessing} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:bg-gray-400">
                <FiDownload className="inline w-4 h-4 mr-2" />{isProcessing ? 'Lancement…' : 'Lancer la signature'}
              </button>
            </div>
          )}
        </div>
      </div>

      {isProcessing && (
        <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80 text-center">
            <div className="mx-auto mb-4 w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <h3 className="text-lg font-semibold text-gray-900">Traitement en cours…</h3>
            <p className="text-sm text-gray-600 mt-1">Signature en lot — quelques secondes.</p>
          </div>
        </div>
      )}

      <SignatureModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onConfirm={handleModalConfirm}
        savedSignatures={savedSignatures}
        initialDataUrl={sigDataUrl}
        initialSavedId={sigSavedId}
      />
    </div>
  );
}
