import React, { useEffect, useRef, useState, useLayoutEffect, useMemo, useCallback } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiUpload, FiX, FiEdit3, FiMenu, FiTrash2 } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
import Modal from 'react-modal';
import SignaturePadComponent from '../components/SignaturePadComponent';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

/* -------------------------- helpers compacts -------------------------- */

// URL absolue de l’image d’une signature enregistrée
const savedSignatureImageUrl = (id) =>
  `${(api?.defaults?.baseURL || '').replace(/\/$/, '')}/api/signature/saved-signatures/${id}/image/`;

// Rasterise n’importe quel blob en data:image/png;base64,...
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

// Convertit un File d'image en data:image/png;base64
const fileToPngDataURL = async (file) => {
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d').drawImage(bmp, 0, 0);
    return c.toDataURL('image/png');
  } catch {
    // fallback via FileReader -> Image
    const dataUrl = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = reject;
        img.src = fr.result;
      };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
    return dataUrl;
  }
};

// Charge l’image d’une signature enregistrée → dataURL PNG
const fetchSavedSignatureAsDataURL = async (sig) => {
  if (sig?.data_url) return sig.data_url;
  const res = await fetch(savedSignatureImageUrl(sig.id), { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return blobToPngDataURL(await res.blob());
};

/* ----------------------------- Draggable ------------------------------ */

const DraggableSignature = React.memo(function DraggableSignature({
  field,              // { position: {x,y,width,height} }
  factor,             // scale factor (pdf pixels -> screen pixels)
  isMobileView,
  onUpdate,           // (field, {position})
  onDelete,
  onOpenModal,        // () => void
  image               // dataURL à afficher (optionnel)
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, fieldX: 0, fieldY: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef(null);

  // Permet de distinguer un click simple d’un drag
  const dragMovedRef = useRef(false);
  const mouseDownBlockedRef = useRef(false); // clic sur handle/btn

  const style = useMemo(() => ({
    position: 'absolute',
    left: field.position.x * factor,
    top: field.position.y * factor,
    width: field.position.width * factor,
    height: field.position.height * factor,
    borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.08)',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
    cursor: isDragging ? 'grabbing' : 'grab',
    border: '2px solid transparent',
    userSelect: 'none',
  }), [field.position, factor, isDragging]);

  const handleMouseDown = useCallback((e) => {
    const t = e.target;
    const blocked = t.classList?.contains('resize-handle') || t.closest?.('.delete-handle') || t.closest?.('.sig-open');
    mouseDownBlockedRef.current = !!blocked;
    if (blocked) return; // laissons resize/suppression/ouverture bouton gérer

    e.preventDefault();
    e.stopPropagation();
    dragMovedRef.current = false;
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      fieldX: field.position.x,
      fieldY: field.position.y
    });
  }, [field.position]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    mouseDownBlockedRef.current = true;
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: field.position.width,
      height: field.position.height
    });
  }, [field.position]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        const deltaX = (e.clientX - dragStart.x) / factor;
        const deltaY = (e.clientY - dragStart.y) / factor;
        if (Math.abs(deltaX) > 3 / factor || Math.abs(deltaY) > 3 / factor) {
          dragMovedRef.current = true;
        }
        const newPosition = {
          ...field.position,
          x: Math.max(0, dragStart.fieldX + deltaX),
          y: Math.max(0, dragStart.fieldY + deltaY)
        };
        onUpdate(field, { position: newPosition });
      } else if (isResizing) {
        const deltaX = (e.clientX - resizeStart.x) / factor;
        const deltaY = (e.clientY - resizeStart.y) / factor;
        const newPosition = {
          ...field.position,
          width: Math.max(50 / factor, resizeStart.width + deltaX),
          height: Math.max(20 / factor, resizeStart.height + deltaY)
        };
        onUpdate(field, { position: newPosition });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, factor, field, onUpdate]);

  const handleClickToOpen = useCallback(() => {
    // Ouvre le modal si : pas de déplacement, pas de resize/suppression
    if (mouseDownBlockedRef.current) { mouseDownBlockedRef.current = false; return; }
    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
    onOpenModal?.();
  }, [onOpenModal]);

  return (
    <div
      ref={elementRef}
      style={style}
      onMouseDown={handleMouseDown}
      onClick={image ? handleClickToOpen : undefined}
      className={`signature-field ${isDragging ? 'dragging' : ''} hover:shadow-lg transition-shadow`}
      title={image ? 'Cliquer pour modifier la signature' : undefined}
    >
      {/* Contenu */}
      {image ? (
        <img
          src={image}
          alt="signature"
          className="max-w-full max-h-full object-contain"
          draggable={false}
        />
      ) : (
        <div
          className="sig-open px-3 py-1 text-xs font-semibold text-white bg-emerald-600 rounded shadow cursor-pointer select-none"
          onClick={(e) => { e.stopPropagation(); onOpenModal?.(); }}
          title="Cliquer pour signer"
          role="button"
          aria-label="Ouvrir le modal de signature"
        >
          Cliquer pour signer
        </div>
      )}

      {/* Handle resize */}
      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        style={{
          position: 'absolute',
          bottom: -4,
          right: -4,
          width: 12,
          height: 12,
          background: '#3b82f6',
          borderRadius: '50%',
          cursor: 'se-resize',
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />

      {/* Delete */}
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

  // Reset à l’ouverture
  useEffect(() => {
    if (isOpen) {
      setMode('draw');
      setTempDataUrl('');
      setSavedSelectedId(null);
    }
  }, [isOpen]);

  const handleUpload = async (ev) => {
    const f = ev.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Veuillez importer une image');
    try {
      const dataUrl = await fileToPngDataURL(f);
      setTempDataUrl(dataUrl);
    } catch {
      toast.error("Impossible de lire l'image");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onClose}
      ariaHideApp={false}
      contentLabel="Signer"
      style={{
        overlay: { zIndex: 10000, backgroundColor: 'rgba(0,0,0,0.5)' },
        content: { zIndex: 10001, inset: '10% 20%', borderRadius: 12, padding: 16 }
      }}
    >
      <h2 className="text-lg font-semibold mb-3">Ajouter une signature</h2>

      <div className="flex items-center gap-4 mb-3">
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" checked={mode==='draw'} onChange={()=>setMode('draw')} />
          <span>Dessiner</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" checked={mode==='upload'} onChange={()=>setMode('upload')} />
          <span>Importer</span>
        </label>
        {!!savedSignatures.length && (
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode==='saved'} onChange={()=>setMode('saved')} />
            <span>Mes signatures</span>
          </label>
        )}
      </div>

      {mode === 'draw' && (
        <SignaturePadComponent
          mode="draw"
          onChange={(dataUrl)=> setTempDataUrl(dataUrl)}
          onEnd={(dataUrl)=> setTempDataUrl(dataUrl)}
          initialValue={tempDataUrl}
        />
      )}

      {mode === 'upload' && (
        <div className="space-y-3">
          <input type="file" accept="image/*" onChange={handleUpload} className="block w-full text-sm" />
          {tempDataUrl
            ? (
              <div className="border rounded p-2 inline-block">
                <img src={tempDataUrl} alt="Aperçu signature" style={{ maxWidth: 320, maxHeight: 160 }} />
              </div>
            )
            : <p className="text-sm text-gray-600">Choisissez une image (PNG/JPG/SVG).</p>
          }
          {tempDataUrl && (
            <button type="button" onClick={()=> setTempDataUrl('')} className="px-3 py-1 rounded bg-gray-200 text-gray-800">Effacer</button>
          )}
        </div>
      )}

      {mode === 'saved' && (
        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
          {savedSignatures.map(sig => {
            const previewSrc = sig.data_url || savedSignatureImageUrl(sig.id);
            return (
              <button
                type="button"
                key={sig.id}
                className={`relative border p-1 rounded flex items-center justify-center h-24 ${savedSelectedId===sig.id ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50' : 'hover:bg-gray-50'}`}
                onClick={async ()=>{
                  try {
                    const dataUrl = await fetchSavedSignatureAsDataURL(sig);
                    setTempDataUrl(dataUrl);
                    setSavedSelectedId(sig.id);
                  } catch { toast.error('Impossible de charger la signature'); }
                }}
              >
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
        <button onClick={()=> { if(!tempDataUrl) return toast.error('Veuillez fournir une signature'); onConfirm(tempDataUrl); }} className="px-4 py-2 rounded bg-green-600 text-white">Valider</button>
      </div>
    </Modal>
  );
}

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
  const [isMobile, setIsMobile] = useState(false);
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

  /* layout + responsive width (mesure + breakpoints) */
  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    const onResize = () => setIsMobile(window.innerWidth < 768);
    measure(); onResize();
    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('resize', onResize);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('resize', onResize); };
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
    const scale = (viewerWidth || 600) / (pageDims[pageNumber]?.width || 600);
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setPlacement({ page: pageNumber, x, y, width: 160, height: 50 });
    setPlacing(false);
    toast.success(`Zone posée p.${pageNumber}`);
    if (isMobile) setSidebarOpen(false);
    // Ouvre direct le modal à la création
    setTimeout(()=> setModalOpen(true), 0);
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
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between gap-2">
             <div className="flex items-center gap-2">
              {placement && <span className="hidden md:inline px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full">Zone p.{placement.page}</span>}
              {placing && <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs md:text-sm rounded-full animate-pulse">Placement actif</span>}
              {isMobile && (
                <button
                  onClick={toggleSidebar}
                  aria-expanded={sidebarOpen}
                  aria-controls="mobile-panel"
                  className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 active:scale-95 transition"
                  title={sidebarOpen ? 'Fermer le panneau' : 'Ouvrir le panneau'}
                >
                  {sidebarOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
                </button>
              )}
            </div>
            <h2 className="text-base md:text-lg font-semibold text-gray-900 truncate">{file ? file.name : 'Aperçu PDF'}</h2>
           
          </div>
        </div>

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
                  const containerPadding = isMobile ? 24 : 48; // correspond aux p-3/md:p-6
                  const maxWidth = Math.min(Math.max(viewerWidth - containerPadding, 320), 900);
                  const pageWidth = maxWidth;
                  const scale = pageWidth / (pageDims[i + 1]?.width || 1);

                  const fieldObj = placement && placement.page === i + 1
                    ? { position: { x: placement.x, y: placement.y, width: placement.width, height: placement.height } }
                    : null;

                  return (
                    <div key={i} className="relative mb-6 bg-white shadow-lg rounded-lg overflow-hidden">
                      <Page pageNumber={i + 1} width={pageWidth} renderTextLayer={false} onLoadSuccess={(p) => onPageLoad(i + 1, p)} className="mx-auto" />
                      {pageDims[i + 1] && (
                        <div onClick={(e) => handleOverlayClick(e, i + 1)}
                             className="absolute top-0 left-1/2 -translate-x-1/2"
                             style={{ width: pageWidth, height: pageDims[i + 1].height * scale, cursor: placing ? 'crosshair' : 'default', zIndex: 10, backgroundColor: placing ? 'rgba(16,185,129,.08)' : 'transparent' }} />
                      )}

                      {fieldObj && (
                        <DraggableSignature
                          field={fieldObj}
                          factor={scale}
                          isMobileView={isMobile}
                          onUpdate={(field, { position }) => setPlacement(p => ({ ...p, ...position }))}
                          onDelete={() => { setPlacement(null); setSigDataUrl(''); }}
                          onOpenModal={openSignatureModal}
                          image={sigDataUrl}
                        />
                      )}

                      <div className="absolute bottom-2 right-2 bg-gray-900/75 text-white text-sm px-2 py-1 rounded">Page {i + 1}/{numPages}</div>
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
        onClose={()=> setModalOpen(false)}
        onConfirm={handleModalConfirm}
        savedSignatures={savedSignatures}
      />
    </div>
  );
}
