import React, { useEffect, useRef, useState, useLayoutEffect, useCallback, useMemo } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiMove, FiFile, FiX, FiMenu } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
import Modal from 'react-modal';
import SignaturePadComponent from '../components/SignaturePadComponent';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/* -------------------------- helpers compacts -------------------------- */

const savedSignatureImageUrl = (id) => `${(api?.defaults?.baseURL || '').replace(/\/$/, '')}/api/signature/saved-signatures/${id}/image/`;

const blobToPngDataURL = async (blob) => {
  try {
    const bmp = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    const url = URL.createObjectURL(blob);
    const dataUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
        URL.revokeObjectURL(url);
      };
      img.onerror = reject;
      img.src = url;
    });
    return dataUrl;
  }
};

const fileToPngDataURL = async (file) => {
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    return await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject; img.src = fr.result;
      };
      fr.onerror = reject; fr.readAsDataURL(file);
    });
  }
};

const fetchSavedSignatureAsDataURL = async (sig) => {
  if (sig?.data_url) return sig.data_url;
  const res = await fetch(savedSignatureImageUrl(sig.id), { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return blobToPngDataURL(await res.blob());
};

/* ----------------------------- Draggable ------------------------------ */

const DraggableSignature = React.memo(function DraggableSignature({
  field,
  factor,
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
    left: field.position.x * factor,
    top: field.position.y * factor,
    width: field.position.width * factor,
    height: field.position.height * factor,
    borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.08)',
    background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 15,
    cursor: isDragging ? 'grabbing' : 'grab',
    border: '2px solid transparent',
    userSelect: 'none'
  }), [field.position, factor, isDragging]);

  const handleMouseDown = useCallback((e) => {
    const t = e.target;
    const blocked = t.classList?.contains('resize-handle') || t.closest?.('.delete-handle') || t.closest?.('.sig-open');
    mouseDownBlockedRef.current = !!blocked;
    if (blocked) return;
    e.preventDefault(); e.stopPropagation();
    dragMovedRef.current = false; setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, fieldX: field.position.x, fieldY: field.position.y });
  }, [field.position]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault(); e.stopPropagation();
    mouseDownBlockedRef.current = true;
    setIsResizing(true);
    setResizeStart({ x: e.clientX, y: e.clientY, width: field.position.width, height: field.position.height });
  }, [field.position]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const handleMouseMove = (e) => {
      if (isDragging) {
        const dx = (e.clientX - dragStart.x) / factor;
        const dy = (e.clientY - dragStart.y) / factor;
        if (Math.abs(dx) > 3 / factor || Math.abs(dy) > 3 / factor) dragMovedRef.current = true;
        onUpdate(field, { position: { ...field.position, x: Math.max(0, dragStart.fieldX + dx), y: Math.max(0, dragStart.fieldY + dy) } });
      } else if (isResizing) {
        const dx = (e.clientX - resizeStart.x) / factor;
        const dy = (e.clientY - resizeStart.y) / factor;
        onUpdate(field, { position: { ...field.position, width: Math.max(50 / factor, resizeStart.width + dx), height: Math.max(20 / factor, resizeStart.height + dy) } });
      }
    };
    const handleMouseUp = () => { setIsDragging(false); setIsResizing(false); };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, isResizing, dragStart, resizeStart, factor, field, onUpdate]);

  const handleClickToOpen = useCallback(() => {
    if (mouseDownBlockedRef.current) { mouseDownBlockedRef.current = false; return; }
    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
    onOpenModal?.();
  }, [onOpenModal]);

  return (
    <div
      style={style}
      onMouseDown={handleMouseDown}
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

/* ------------------------------ Modal UI ------------------------------ */

function SignatureModal({ isOpen, onClose, onConfirm, savedSignatures }) {
  const [mode, setMode] = useState('draw'); // 'draw' | 'upload' | 'saved'
  const [tempDataUrl, setTempDataUrl] = useState('');
  const [savedSelectedId, setSavedSelectedId] = useState(null);

  useEffect(() => {
    if (isOpen) { setMode('draw'); setTempDataUrl(''); setSavedSelectedId(null); }
  }, [isOpen]);

  const handleUpload = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return; if (!f.type.startsWith('image/')) return toast.error('Veuillez importer une image');
    try { setTempDataUrl(await fileToPngDataURL(f)); } catch { toast.error("Impossible de lire l'image"); }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      contentLabel="Signer"
      style={{ overlay: { zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.5)' }, content: { zIndex: 10001, inset: '10% 20%', borderRadius: 12, padding: 16 } }}
    >
      <h2 className="text-lg font-semibold mb-3">Ajouter une signature</h2>

      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode==='draw'} onChange={()=>setMode('draw')} /><span>Dessiner</span></label>
        <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode==='upload'} onChange={()=>setMode('upload')} /><span>Importer</span></label>
        {!!savedSignatures.length && (
          <label className="flex items-center gap-2"><input type="radio" name="mode" checked={mode==='saved'} onChange={()=>setMode('saved')} /><span>Mes signatures</span></label>
        )}
      </div>

      {mode === 'draw' && (
        <SignaturePadComponent mode="draw" onChange={(d)=>setTempDataUrl(d)} onEnd={(d)=>setTempDataUrl(d)} initialValue={tempDataUrl} />
      )}

      {mode === 'upload' && (
        <div className="space-y-3">
          <input type="file" accept="image/*" onChange={handleUpload} className="block w-full text-sm" />
          {tempDataUrl ? (
            <div className="border rounded p-2 inline-block"><img src={tempDataUrl} alt="Aperçu signature" style={{ maxWidth: 320, maxHeight: 160 }} /></div>
          ) : (
            <p className="text-sm text-gray-600">Choisissez une image (PNG/JPG/SVG).</p>
          )}
          {tempDataUrl && (<button type="button" onClick={()=> setTempDataUrl('')} className="px-3 py-1 rounded bg-gray-200 text-gray-800">Effacer</button>)}
        </div>
      )}

      {mode === 'saved' && (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
          {savedSignatures.map(sig => {
            const previewSrc = sig.data_url || savedSignatureImageUrl(sig.id);
            return (
              <button type="button" key={sig.id}
                className={`relative border p-1 rounded flex items-center justify-center h-24 ${savedSelectedId===sig.id ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={async ()=>{ try { const d = await fetchSavedSignatureAsDataURL(sig); setTempDataUrl(d); setSavedSelectedId(sig.id);} catch { toast.error('Impossible de charger la signature'); } }}>
                <img src={previewSrc} alt="saved" className="max-h-20 w-full object-contain" />
                {savedSelectedId===sig.id && <span className="absolute top-1 right-1 text-[10px] px-1 rounded bg-blue-600 text-white">Choisie</span>}
              </button>
            );
          })}
          {!savedSignatures.length && <p className="text-sm">Aucune signature enregistrée.</p>}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 rounded bg-gray-200">Annuler</button>
        <button onClick={()=> { if(!tempDataUrl) return toast.error('Veuillez fournir une signature'); onConfirm(tempDataUrl); }} className="px-4 py-2 rounded bg-blue-600 text-white">Valider</button>
      </div>
    </Modal>
  );
}

/* ------------------------------ composant ------------------------------ */

export default function BulkSignSameWizard() {
  // ---- state ----
  const [files, setFiles] = useState([]);
  const [includeQr, setIncludeQr] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}

  const [sigDataUrl, setSigDataUrl] = useState('');
  const [savedSignatures, setSavedSignatures] = useState([]);

  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});
  const [docKey, setDocKey] = useState(0);
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const pollingRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // responsive UI
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = useCallback(() => setSidebarOpen((o) => !o), []);

  // refs pour reset inputs
  const pdfsInputRef = useRef(null);

  // ---- layout measure (simplifié : pas de RAF, arrondi, 1 seul listener) ----
  useLayoutEffect(() => {
    const measure = () => {
      const w = Math.floor(viewerRef.current?.getBoundingClientRect().width ?? 600);
      setViewerWidth((prev) => (prev !== w ? w : prev));
    };
    const setBp = () => setIsMobile(window.innerWidth < 1024);

    measure(); setBp();

    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);

    window.addEventListener('resize', setBp);
    return () => { ro.disconnect(); window.removeEventListener('resize', setBp); };
  }, []);

  // Échap pour fermer le panneau mobile
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // lock scroll when drawer open
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

  // Charger les signatures enregistrées
  useEffect(() => { signatureService.listSavedSignatures().then(setSavedSignatures).catch(()=>{}); }, []);

  // Revoke objectURL on unmount / change
  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  // ---- helpers ----
  const pageScale = (n) => {
    const padding = isMobile ? 24 : 32; // p-4
    const w = Math.min(Math.max(viewerWidth - padding, 320), 900);
    return w / (pageDims[n]?.width || w || 1);
  };

  const onFiles = (e) => {
    const arr = Array.from(e.target.files || []).filter((f) => f.type === 'application/pdf');
    if (!arr.length) { setFiles([]); setPdfUrl(null); setDocKey(k=>k+1); return; }

    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setNumPages(0); setPageDims({}); setPlacement(null); setSigDataUrl('');

    setFiles(arr);
    setPdfUrl(URL.createObjectURL(arr[0]));
    setDocKey((k) => k + 1);
    if (pdfsInputRef.current) pdfsInputRef.current.value = '';
    if (isMobile) setSidebarOpen(false);
  };

  const onDocLoad = ({ numPages }) => setNumPages(numPages);
  const onPageLoad = (n, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDims((d) => ({ ...d, [n]: { width: vp.width, height: vp.height } }));
  };

  const handleOverlayClick = (e, pageNumber) => {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const s = pageScale(pageNumber);
    const x = (e.clientX - rect.left) / s;
    const y = (e.clientY - rect.top) / s;
    setPlacement({ page: pageNumber, x, y, width: 160, height: 50 });
    setPlacing(false);
    toast.success(`Zone définie (page ${pageNumber}) — appliquée à tous les documents`);
    if (isMobile) setSidebarOpen(false);
    setTimeout(()=> setModalOpen(true), 0);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const openSignatureModal = () => { if (!placement) return toast.info('Définis d’abord la zone'); setModalOpen(true); };
  const handleModalConfirm = (dataUrl) => { setSigDataUrl(dataUrl); setModalOpen(false); toast.success('Signature ajoutée'); };

  // ---- submit + polling ----
  const submit = async () => {
    if (!files.length) return toast.error('Ajoute au moins un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigDataUrl) return toast.error('Ajoute une image de signature');

    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('mode', 'bulk_same_spot');
    fd.append('placements', JSON.stringify([placement]));
    fd.append('signature_image', sigDataUrl); // data:image/png;base64
    fd.append('include_qr', includeQr ? 'true' : 'false');

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
      toast.error(e?.response?.data?.error || 'Erreur au lancement du job');
    }
  };

  useEffect(() => () => pollingRef.current && clearInterval(pollingRef.current), []);

  const resetAll = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setFiles([]); setPdfUrl(null); setPlacement(null); setSigDataUrl('');
    setNumPages(0); setPageDims({}); setDocKey((k) => k + 1);
    if (pdfsInputRef.current) pdfsInputRef.current.value = '';
  };

  /* ------------------------------ UI ------------------------------ */

  const Sidebar = () => (
    <div className="h-full flex flex-col">
      <div className="p-4 lg:p-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center"><FiLayers className="w-6 h-6 text-blue-600 mr-3" /><h1 className="text-xl lg:text-2xl font-bold text-gray-800">Signature masse</h1></div>
        {(files.length || placement || sigDataUrl) && (
          <button onClick={resetAll} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1" title="Réinitialiser"><FiX className="w-4 h-4" /> Reset</button>
        )}
      </div>

      <div className="p-4 lg:p-6">
        <p className="text-sm text-gray-600 mb-6">Définis une zone sur le premier PDF, elle sera appliquée à tous les autres.</p>

        {/* Upload PDFs */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">PDF(s)</label>
          <input ref={pdfsInputRef} type="file" accept="application/pdf" multiple onChange={onFiles}
                 className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
          <p className="text-xs text-gray-500 mt-1">Sélectionne plusieurs PDF (même emplacement de signature).</p>
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
        <button onClick={submit} disabled={!files.length || !placement || !sigDataUrl || isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition">
          <FiDownload className="inline w-4 h-4 mr-2" />
          {isProcessing ? 'Lancement…' : 'Lancer la signature'}
        </button>
      </div>
    </div>
  );

  const containerOverlayStyle = isMobile && sidebarOpen ? { touchAction: 'none' } : {};

  return (
    <div className="h-screen bg-gray-50 flex" style={containerOverlayStyle}>
      {/* Overlay mobile (fluide, intégré) */}
      {isMobile && (
        <div className={`fixed inset-0 bg-black/50 z-30 transition-opacity duration-200 ${sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar (drawer intégré) */}
      <aside id="mobile-panel" className={`${isMobile ? `fixed inset-y-0 left-0 z-40 w-full max-w-sm transform transition-transform duration-300 ease-in-out will-change-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}` : 'w-full lg:w-1/3'} bg-white border-r border-gray-200`} aria-hidden={!sidebarOpen && isMobile}>
        <div className="relative z-40 bg-white h-full overflow-auto"><Sidebar /></div>
      </aside>

      {/* Viewer */}
      <div className="flex-1 flex flex-col" ref={viewerRef} style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}>
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base lg:text-lg font-semibold text-gray-900 truncate">{files[0]?.name || 'Aperçu PDF'}</h2>
            <div className="flex items-center gap-2">
              {placement && <span className="hidden lg:inline px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Zone p.{placement.page}</span>}
              {placing && <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs lg:text-sm rounded-full animate-pulse">Placement actif</span>}
              {isMobile && (
                <button onClick={toggleSidebar} aria-expanded={sidebarOpen} aria-controls="mobile-panel" className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition" title={sidebarOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}>
                  {sidebarOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4" style={{ scrollbarGutter: 'stable both-edges', overscrollBehavior: 'contain' }}>
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-full text-center text-gray-500">
              <div>
                <FiLayers className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Ajoute des PDF pour commencer</p>
                <p className="text-sm">La zone choisie sera appliquée à tous les documents</p>
                {isMobile && <button onClick={toggleSidebar} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Ouvrir les options</button>}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <h3 className="font-medium text-gray-800">Aperçu du premier document</h3>
                <p className="text-sm text-gray-600">Définis la zone de signature qui sera appliquée sur {files.length} document(s)</p>
              </div>
              <div className="p-4">
                <Document key={docKey} file={pdfUrl} onLoadSuccess={onDocLoad}
                          loading={<div className="flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}
                          error={<div className="text-red-500 text-center p-8">Erreur lors du chargement du PDF</div>}>
                  {Array.from({ length: numPages }, (_, i) => {
                    const n = i + 1;
                    const padding = isMobile ? 24 : 32; // p-4
                    const pageWidth = Math.min(Math.max(viewerWidth - padding, 320), 900);
                    const s = pageWidth / (pageDims[n]?.width || 1);

                    const fieldObj = placement && placement.page === n ? { position: { x: placement.x, y: placement.y, width: placement.width, height: placement.height } } : null;

                    return (
                      <div key={i} className="relative mb-6 last:mb-0" style={{ width: pageWidth, margin: '0 auto' }}>
                        <Page
                          pageNumber={n}
                          width={pageWidth}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                          onLoadSuccess={(p) => onPageLoad(n, p)}
                          className="border border-gray-200 rounded-lg shadow-sm"
                        />
                        {pageDims[n] && (
                          <div
                            onClick={(e) => handleOverlayClick(e, n)}
                            className="absolute top-0 left-0 rounded-lg"
                            style={{ width: '100%', height: pageDims[n].height * s, cursor: placing ? 'crosshair' : 'default', zIndex: 10, backgroundColor: placing ? 'rgba(59,130,246,.06)' : 'transparent' }}
                          />
                        )}

                        {fieldObj && (
                          <DraggableSignature
                            field={fieldObj}
                            factor={s}
                            isMobileView={isMobile}
                            onUpdate={(field, { position }) => setPlacement(p => ({ ...p, ...position }))}
                            onDelete={() => { setPlacement(null); setSigDataUrl(''); }}
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
          )}
        </div>

        {isProcessing && (
          <div className="fixed inset-0 z-[1000] bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white rounded-xl shadow-xl p-6 w-80 text-center">
              <div className="mx-auto mb-4 w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <h3 className="text-lg font-semibold text-gray-900">Traitement en cours…</h3>
              <p className="text-sm text-gray-600 mt-1">Nous lançons la signature en lot, cela peut prendre un moment.</p>
            </div>
          </div>
        )}
      </div>

      {/* MODAL signature */}
      <SignatureModal isOpen={modalOpen} onClose={()=> setModalOpen(false)} onConfirm={handleModalConfirm} savedSignatures={savedSignatures} />
    </div>
  );
}
