import React, { useEffect, useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react';
import useResponsivePdf from '../hooks/useResponsivePdf';
import useIsMobile from '../hooks/useIsMobile';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiMove, FiFile, FiX, FiTrash2 } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
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

/* ----------------------------- Draggable ------------------------------ */

const DraggableSignature = React.memo(function DraggableSignature({
  field,
  pageWidth,
  pageHeight,
  isMobileView,
  onUpdate,
  onDelete,
  onOpenModal,
  image
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, fieldX: 0, fieldY: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const dragMovedRef = useRef(false);
  const mouseDownBlockedRef = useRef(false);

  const style = useMemo(() => ({
    position: 'absolute',
    left: field.position.x * pageWidth,
    top: field.position.y * pageHeight,
    width: field.position.width * pageWidth,
    height: field.position.height * pageHeight,
    borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.08)',
    background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 15,
    cursor: isDragging ? 'grabbing' : 'grab',
    border: '2px solid transparent',
    userSelect: 'none'
  }), [field.position, pageWidth, pageHeight, isDragging]);

  const handleMouseDown = useCallback((e) => {
    const t = e.target;
    const blocked = t.classList?.contains('resize-handle') || t.closest?.('.delete-handle') || t.closest?.('.sig-open');
    mouseDownBlockedRef.current = !!blocked;
    if (blocked) return;
    e.preventDefault(); e.stopPropagation();
    dragMovedRef.current = false; setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, fieldX: field.position.x, fieldY: field.position.y });
  }, [field.position]);

  const handleTouchStart = useCallback((e) => {
    const t = e.target;
    const blocked = t.classList?.contains('resize-handle') || t.closest?.('.delete-handle') || t.closest?.('.sig-open');
    mouseDownBlockedRef.current = !!blocked;
    if (blocked) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault(); e.stopPropagation();
    dragMovedRef.current = false; setIsDragging(true);
    setDragStart({ x: touch.clientX, y: touch.clientY, fieldX: field.position.x, fieldY: field.position.y });
  }, [field.position]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    mouseDownBlockedRef.current = true;
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, width: field.position.width, height: field.position.height });
  }, [field.position]);

  const handleResizeTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault(); e.stopPropagation();
    mouseDownBlockedRef.current = true;
    setIsResizing(true);
    setResizeStart({ x: touch.clientX, y: touch.clientY, width: field.position.width, height: field.position.height });
  }, [field.position]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const handleMouseMove = (e) => {
      if (isDragging) {
        const dx = (e.clientX - dragStart.x) / pageWidth;
        const dy = (e.clientY - dragStart.y) / pageHeight;
        if (Math.abs(dx) > 3 / pageWidth || Math.abs(dy) > 3 / pageHeight) dragMovedRef.current = true;
        onUpdate(field, { position: { ...field.position, x: Math.max(0, dragStart.fieldX + dx), y: Math.max(0, dragStart.fieldY + dy) } });
      } else if (isResizing) {
        const dx = (e.clientX - resizeStart.x) / pageWidth;
        const dy = (e.clientY - resizeStart.y) / pageHeight;
        onUpdate(field, { position: { ...field.position, width: Math.max(50 / pageWidth, resizeStart.width + dx), height: Math.max(20 / pageHeight, resizeStart.height + dy) } });
      }
    };
    const handleMouseUp = () => { setIsDragging(false); setIsResizing(false); };
    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      if (isDragging) {
        const dx = (touch.clientX - dragStart.x) / pageWidth;
        const dy = (touch.clientY - dragStart.y) / pageHeight;
        if (Math.abs(dx) > 3 / pageWidth || Math.abs(dy) > 3 / pageHeight) dragMovedRef.current = true;
        onUpdate(field, { position: { ...field.position, x: Math.max(0, dragStart.fieldX + dx), y: Math.max(0, dragStart.fieldY + dy) } });
      } else if (isResizing) {
        const dx = (touch.clientX - resizeStart.x) / pageWidth;
        const dy = (touch.clientY - resizeStart.y) / pageHeight;
        onUpdate(field, { position: { ...field.position, width: Math.max(50 / pageWidth, resizeStart.width + dx), height: Math.max(20 / pageHeight, resizeStart.height + dy) } });
      }
    };
    const handleTouchEnd = () => { setIsDragging(false); setIsResizing(false); };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, pageWidth, pageHeight, field, onUpdate]);

  const handleClickToOpen = useCallback(() => {
    if (mouseDownBlockedRef.current) { mouseDownBlockedRef.current = false; return; }
    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
    onOpenModal?.();
  }, [onOpenModal]);

  return (
    <div
      style={style}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={(e) => e.preventDefault()}
      onTouchEnd={(e) => e.preventDefault()}
      onClick={image ? handleClickToOpen : undefined}
      className={`signature-field ${isDragging ? 'dragging' : ''} hover:shadow-lg transition-shadow`}
      title={image ? 'Cliquer pour modifier la signature' : undefined}
    >
      {image ? (
        <img src={image} alt="signature" className="max-w-full max-h-full object-contain" draggable={false} />
      ) : (
        <div
          className="sig-open px-3 py-1 text-xs font-semibold text-white bg-blue-600 rounded shadow cursor-pointer select-none"
          onClick={(e) => { e.stopPropagation(); onOpenModal?.(); }}
          title="Cliquer pour signer"
        >
          Cliquer pour signer
        </div>
      )}

      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeTouchStart}
        style={{ position: 'absolute', bottom: -4, right: -4, width: 12, height: 12, background: '#3b82f6', borderRadius: '50%', cursor: 'se-resize', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}
      />

      <button
        onClick={(e) => { e.stopPropagation(); onDelete(field); }}
        className="delete-handle absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
        title="Supprimer la zone"
      >
        <FiX className="w-3 h-3" />
      </button>
    </div>
  );
});


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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

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

  // Échap ferme le panneau mobile
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Empêche le scroll derrière le drawer
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

  // Charger les signatures enregistrées
  useEffect(() => { signatureService.listSavedSignatures().then(setSavedSignatures).catch(()=>{}); }, []);

  // Nettoyage URL objet
  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  // ---- uploads ----
  const onFiles = (e) => {
    const arr = Array.from(e.target.files || []).filter((f) => f.type === 'application/pdf');
    if (!arr.length) { setFiles([]); setPdfUrl(null); setDocKey(k=>k+1); return; }

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setNumPages(0); setPageDims({}); setPlacement(null); setSigDataUrl(''); setSigSavedId(null);

    setFiles(arr);
    setPdfUrl(URL.createObjectURL(arr[0]));
    setDocKey((k) => k + 1);
    if (pdfsInputRef.current) pdfsInputRef.current.value = '';
    if (isMobile) setSidebarOpen(false);
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
    if (isMobile) setSidebarOpen(false);
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
  };

  /* ------------------------------ UI ------------------------------ */

  const Sidebar = () => (
    <div className="h-full flex flex-col">
      <div className="p-4 md:p-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3"><FiLayers className="w-6 h-6 text-blue-600" /><h1 className="text-lg md:text-xl font-bold text-gray-800">Signature en lot</h1></div>
        {(files.length || placement || sigDataUrl) && (
          <button onClick={resetAll} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1" title="Réinitialiser"><FiTrash2 className="w-4 h-4" /> Reset</button>
        )}
      </div>

      <div className="p-4 md:p-6">
        <p className="text-sm text-gray-600 mb-6">Définis une zone sur le premier PDF, elle sera appliquée à tous.</p>

        {/* Upload PDFs */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">PDF(s)</label>
          <input ref={pdfsInputRef} type="file" accept="application/pdf" multiple onChange={onFiles}
                 className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <p className="text-xs text-gray-500 mt-1">Sélectionne plusieurs PDF (même emplacement).</p>
        </div>

        {/* Files list */}
        {!!files.length && (
          <div className="mb-6">
            <label className="block font-medium mb-2 text-gray-700">Documents ({files.length})</label>
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center text-sm text-gray-700 mb-1 last:mb-0"><FiFile className="w-4 h-4 mr-2 text-blue-500" /><span className="truncate">{f.name}</span></div>
              ))}
            </div>
          </div>
        )}

        {/* Zone + signature */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">Zone & signature</label>
          {placement ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3 text-sm text-green-800 flex items-center justify-between">
              <span>Zone définie ✓ — Page {placement.page}</span>
              {sigDataUrl ? <span className="ml-3 text-green-700">Signature prête ✓</span> : <span className="ml-3 text-yellow-700">Clique la zone pour signer</span>}
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3 text-sm text-yellow-800">Aucune zone définie. Clique “Définir la zone” puis clique sur le PDF.</div>
          )}
          <button onClick={() => { setPlacing(true); if (isMobile) setSidebarOpen(false); }} disabled={!files.length}
                  className={`w-full px-4 py-2 rounded-lg text-white font-medium transition ${placing ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'}`}>
            {placing ? (<><FiMove className="inline w-4 h-4 mr-2" />Clique sur le PDF</>) : (placement ? 'Redéfinir la zone' : 'Définir la zone')}
          </button>
          <p className="text-xs text-gray-500 mt-2">Astuce : <strong>clique sur la zone</strong> pour ouvrir le modal (dessiner / importer / mes signatures).</p>
        </div>

        {/* Options */}
        <div className="mb-6">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={includeQr} onChange={(e) => setIncludeQr(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />Apposer un code QR (recommandé)</label>
        </div>

        {/* Summary */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800 space-y-1">
          <div><strong>Documents :</strong> {files.length}</div>
          <div><strong>Zone :</strong> {placement ? '✓' : '✗'}</div>
          <div><strong>Signature :</strong> {sigDataUrl ? '✓' : '✗'}</div>
        </div>

        {/* Submit */}
        <button onClick={submit} disabled={!files.length || !placement || (!sigDataUrl && !sigSavedId) || isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition">
          <FiDownload className="inline w-4 h-4 mr-2" />
          {isProcessing ? 'Lancement…' : 'Lancer la signature'}
        </button>
      </div>
    </div>
  );

  const containerOverlayStyle = isMobile && sidebarOpen ? { touchAction: 'none' } : {};

  return (
    <div className="h-screen bg-gray-50 flex" style={containerOverlayStyle}>
      {/* Overlay mobile */}
      {isMobile && (
        <div className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar (drawer intégré) */}
      <aside
       id="mobile-panel"
        className={`${isMobile
         ? `fixed inset-y-0 left-0 z-40 w-full max-w-sm transform transition-transform duration-300 ease-in-out will-change-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}` : 'w-1/3 max-w-md flex-shrink-0'} bg-white border-r border-gray-200`} aria-hidden={!sidebarOpen && isMobile}>
        <div className="relative z-40 bg-white h-full overflow-auto"><Sidebar /></div>
      </aside>

      {/* Viewer */}
      <div className="flex-1 flex flex-col" ref={viewerRef} style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}>
        <SignatureHeader
          title={files[0]?.name || 'Aperçu PDF'}
          placement={placement}
          placing={placing}
          isMobile={isMobile}
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
        />

        <div className="flex-1 overflow-auto bg-gray-100">
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <div>
                <FiLayers className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-600 text-lg">Ajoute des PDF pour commencer</p>
                <p className="text-gray-400 text-sm mt-2">La zone choisie sera appliquée à tous les documents</p>
                {isMobile && <button onClick={toggleSidebar} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Ouvrir les options</button>}
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
                  <Document key={docKey} file={pdfUrl} onLoadSuccess={onDocLoad}
                            loading={<div className="flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}
                            error={<div className="text-red-500 text-center p-8">Erreur lors du chargement du PDF</div>}>
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
                              onUpdate={(field, { position }) => setPlacement(p => ({ ...p, ...position }))}
                              onDelete={() => { setPlacement(null); setSigDataUrl(''); setSigSavedId(null); }}
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

        {isProcessing && (
          <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80 text-center">
              <div className="mx-auto mb-4 w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <h3 className="text-lg font-semibold text-gray-900">Traitement en cours…</h3>
              <p className="text-sm text-gray-600 mt-1">Signature en lot — quelques secondes.</p>
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
        initialSavedId={sigSavedId}
      />
    </div>
  );
}
