// src/pages/SelfSignWizard.js
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiUpload, FiX, FiEdit3, FiMenu, FiCheck, FiMove } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function SelfSignWizard() {
  // --- états ---
  const [file, setFile] = useState(null);          // UN SEUL PDF
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}
  const [sigFile, setSigFile] = useState(null);
  const [sigDataUrl, setSigDataUrl] = useState('');
  const [savedSignatures, setSavedSignatures] = useState([]);
  // Charge une image (même protégée par cookie) et la convertit en data-URL
 const urlToDataURL = async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    // createImageBitmap est rapide et évite les soucis cross-origin avec <img>
    try {
      const bmp = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width; canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      return canvas.toDataURL('image/png');         // <- forcé en PNG
    } catch {
      // fallback via <img> si createImageBitmap indisponible
      const urlObj = URL.createObjectURL(blob);
      const dataUrl = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          try { resolve(canvas.toDataURL('image/png')); }
          catch (e) { reject(e); }
          URL.revokeObjectURL(urlObj);
        };
        img.onerror = reject;
        img.src = urlObj;
      });
      return dataUrl;
    }
  };
  /** URL absolue de l'image d'une signature sauvegardée */
const savedSignatureImageUrl = (id) => {
  const base = (api?.defaults?.baseURL || '').replace(/\/$/, '');
  return `${base}/api/signature/saved-signatures/${id}/image/`;
};

/** Rasterise n'importe quel blob image en data:image/png;base64,... */
const blobToPngDataURL = async (blob) => {
  try {
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    // fallback via <img>
    const urlObj = URL.createObjectURL(blob);
    const dataUrl = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve(c.toDataURL('image/png'));
        URL.revokeObjectURL(urlObj);
      };
      img.onerror = reject;
      img.src = urlObj;
    });
    return dataUrl;
  }
};

/** Récupère l'image d'une signature sauvegardée et renvoie une dataURL PNG */
const fetchSavedSignatureAsDataURL = async (sig) => {
  if (sig?.data_url) return sig.data_url; // déjà une dataURL
  if (!sig?.id) throw new Error('signature id manquant');
  const res = await fetch(savedSignatureImageUrl(sig.id), { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  return blobToPngDataURL(blob);
};
  // remplace la fonction existante
const toAbsolute = (url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;     // déjà absolue
  const base = (api.defaults.baseURL || '').replace(/\/$/, '');
  // si l’API renvoie "signature/saved/…", on préfixe "/media/"
  const path = url.startsWith('media/') || url.startsWith('/media/')
    ? url.replace(/^\//, '')
    : `media/${url.replace(/^\//, '')}`;
  return `${base}/${path}`;
};

  const [isProcessing, setIsProcessing] = useState(false);

  // --- layout / resize ---
  useLayoutEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    };
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    checkMobile(); measure();
    const ro = new ResizeObserver(() => { checkMobile(); measure(); });
    if (viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', checkMobile);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    signatureService.listSavedSignatures().then(setSavedSignatures).catch(() => {});
  }, []);

  // --- upload d'un seul fichier ---
  const onFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (e.target.files && e.target.files.length > 1) {
      toast.info('Un seul PDF est pris en compte ici (le premier a été sélectionné).');
    }
    setFile(f);
    setPlacement(null);
    setPdfUrl(f ? URL.createObjectURL(f) : null);
    if (isMobile) setSidebarOpen(false);
  };

  const onDocLoad = ({ numPages }) => setNumPages(numPages);
  const onPageLoad = (n, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDims(d => ({ ...d, [n]: { width: vp.width, height: vp.height } }));
  };

  const handleOverlayClick = (e, pageNumber) => {
    if (!placing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = (viewerWidth || 600) / (pageDims[pageNumber]?.width || 600);
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    const width = 160, height = 50;
    setPlacement({ page: pageNumber, x, y, width, height });
    setPlacing(false);
    toast.success(`Zone posée p.${pageNumber}`);
    if (isMobile) setSidebarOpen(false);
  };

  // --- envoi : toujours en mode direct (sync=true) ---
  const submit = async () => {
    if (!file) return toast.error('Ajoute un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigFile && !sigDataUrl) return toast.error('Ajoute une image de signature (PNG recommandé)');

    setIsProcessing(true);
    const fd = new FormData();
    fd.append('files[]', file);                                  // un seul fichier
    fd.append('placements', JSON.stringify([placement]));
    if (sigFile) fd.append('signature_image', sigFile);
    else if (sigDataUrl) fd.append('signature_image', sigDataUrl);
    fd.append('sync', 'true');                                    // fast-path

    try {
      const response = await signatureService.selfSign(fd, { sync: true });
      const url = URL.createObjectURL(response.data);
      const base = (file.name || 'document').replace(/\.pdf$/i, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}_signed.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Document signé et téléchargé');
    } catch (e) {
      const msg = (await (async () => {
        if (e?.response?.data instanceof Blob) {
          const t = await e.response.data.text();
          try { return JSON.parse(t).error || t; } catch { return t; }
        }
        return e?.response?.data?.error || e.message || 'Erreur inconnue';
      })());
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- UI sidebar ---
  const SidebarContent = () => (
    <>
      <div className="p-4 md:p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-100 rounded-lg">
              <FiEdit3 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900">Auto-signature</h1>
              
            </div>
          </div>
          {isMobile && (
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-gray-100 rounded-lg">
              <FiX className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-center">
        
          
        </div>
      </div>

      {/* Upload (1 seul PDF) */}
      <div className="p-4 md:p-6 border-b border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">PDF</label>
        <div className="relative">
          <input
            type="file"
            accept="application/pdf"
            onChange={onFile}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-emerald-400 hover:bg-emerald-50 transition-colors">
            <FiUpload className="w-6 md:w-8 h-6 md:h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-600">Clique ou glisse ton PDF</p>
            <p className="text-xs text-gray-400 mt-1">Un seul document</p>
          </div>
        </div>

        {file && (
          <div className="mt-3 flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
            <span className="truncate">{file.name}</span>
            <button
              onClick={() => { setFile(null); setPdfUrl(null); setPlacement(null); }}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Signature PNG */}
      <div className="p-4 md:p-6 border-b border-gray-200">
        <label className="block text-sm font-medium text-gray-700 mb-2">Signature </label>
        <input
          type="file"
          accept="image/*"
          onChange={e => { setSigFile(e.target.files?.[0] || null); setSigDataUrl(''); }}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
        />
        {sigFile && (
          <div className="mt-2 flex items-center space-x-2">
            <FiCheck className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-600">{sigFile.name}</span>
          </div>
        )}
        {!sigFile && savedSignatures.length > 0 && (
  <div className="mt-2 grid grid-cols-2 gap-2">
    {savedSignatures.map(sig => {
  const previewSrc = sig.data_url || savedSignatureImageUrl(sig.id); // toujours défini
  return (
    <div
      key={sig.id}
      className="border p-1 cursor-pointer flex items-center justify-center hover:ring-2 hover:ring-emerald-400 rounded"
      onClick={async () => {
        try {
          setSigFile(null);
          const dataUrl = await fetchSavedSignatureAsDataURL(sig); // <-- jamais "undefined"
          setSigDataUrl(dataUrl);                                  // data:image/png;base64,...
        } catch (e) {
          console.error(e);
          setSigDataUrl('');
          // affiche ton toast si tu en utilises un :
          // toast.error("Impossible de charger la signature enregistrée");
        }
      }}
    >
      <img src={previewSrc} alt="saved" className="max-h-20" />
    </div>
  );
})}

  </div>
)}

      </div>


      {/* Actions */}
      <div className="p-4 md:p-6 bg-gray-50 mt-auto">
        <button
          onClick={() => { setPlacing(true); if (isMobile) setSidebarOpen(false); }}
          disabled={!pdfUrl}
          className={`w-full mb-3 px-4 py-2 rounded-lg font-medium transition-colors ${
            placing ? 'bg-yellow-500 text-white cursor-not-allowed'
                    : 'bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
        >
          {placement ? 'Redéfinir la zone' : 'Définir la zone'}
        </button>
        <button
  onClick={submit}
  disabled={isProcessing || !file || !placement || (!sigFile && !sigDataUrl)}
  className="w-full px-4 py-2 bg-gradient-to-r from-emerald-600 to-blue-600 text-white font-medium rounded-lg hover:from-emerald-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
>
          {isProcessing
            ? <div className="flex items-center justify-center space-x-2"><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div><span>Signature...</span></div>
            : <div className="flex items-center justify-center space-x-2"><FiEdit3 className="w-4 h-4" /><span>Signer et télécharger</span></div>}
        </button>
      </div>
    </>
  );

  // --- rendu ---
  return (
    <div className="flex h-screen bg-gray-50">
      {isMobile && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-20 left-4 z-50 p-3 bg-white rounded-lg shadow-lg border border-gray-200 md:hidden"
        >
          <FiMenu className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar */}
      <div className={`${
        isMobile
          ? `fixed inset-y-0 left-0 z-40 w-80 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
          : 'w-1/3'
      } bg-white border-r border-gray-200 flex flex-col`}>
        {isMobile && sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />
        )}
        <div className="relative z-40 bg-white h-full flex flex-col">
          <SidebarContent />
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 flex flex-col" ref={viewerRef}>
        <div className="bg-white border-b border-gray-200 px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {file ? file.name : 'Aperçu PDF'}
            </h2>
            {placement && (
              <span className="hidden md:inline px-2 py-1 bg-emerald-100 text-emerald-700 text-xs rounded-full">
                Zone p.{placement.page}
              </span>
            )}
            {placing && (
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full animate-pulse">
                {isMobile ? 'Clique sur le PDF' : 'Mode placement actif'}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100">
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-full p-6 text-center">
              <FiUpload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <div>
                <p className="text-gray-600 text-lg">Ajoute un PDF pour prévisualiser</p>
                <p className="text-gray-400 text-sm mt-2">Signature rapide d’un document</p>
                {isMobile && (
                  <button onClick={() => setSidebarOpen(true)} className="mt-4 px-4 py-2 bg-emerald-500 text-white rounded-lg">
                    Ouvrir les options
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3 md:p-6">
              <Document
                file={pdfUrl}
                onLoadSuccess={onDocLoad}
                loading={<div className="flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div></div>}
                error={<div className="text-red-500 text-center p-8">Erreur lors du chargement du PDF</div>}
              >
                {Array.from({ length: numPages }, (_, i) => {
                  const pageWidth = Math.min(viewerWidth - (isMobile ? 24 : 48), isMobile ? 350 : 800);
                  const scale = pageWidth / (pageDims[i + 1]?.width || 1);
                  return (
                    <div key={i} className="relative mb-6 bg-white shadow-lg rounded-lg overflow-hidden">
                      <Page
                        pageNumber={i + 1}
                        width={pageWidth}
                        renderTextLayer={false}
                        onLoadSuccess={p => onPageLoad(i + 1, p)}
                        className="mx-auto"
                      />
                      {pageDims[i + 1] && (
                        <div
                          onClick={e => handleOverlayClick(e, i + 1)}
                          className="absolute top-0 left-1/2 transform -translate-x-1/2"
                          style={{
                            width: pageWidth,
                            height: pageDims[i + 1].height * scale,
                            cursor: placing ? 'crosshair' : 'default',
                            zIndex: 10,
                            backgroundColor: placing ? 'rgba(16, 185, 129, 0.08)' : 'transparent'
                          }}
                        />
                      )}
                      {placement?.page === i + 1 && (
                        <div
                          className="absolute border-2 border-emerald-500 bg-emerald-100/60 rounded"
                          style={{
                            top: placement.y * scale,
                            left: `calc(50% - ${pageWidth / 2}px + ${placement.x * scale}px)`,
                            width: placement.width * scale,
                            height: placement.height * scale,
                            zIndex: 20
                          }}
                        >
                          <div className="absolute -top-6 left-0 bg-emerald-500 text-white text-xs px-2 py-1 rounded">
                            Signature
                          </div>
                          <button
                            onClick={() => setPlacement(null)}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                          >
                            <FiX className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                      <div className="absolute bottom-2 right-2 bg-gray-900/75 text-white text-sm px-2 py-1 rounded">
                        Page {i + 1}/{numPages}
                      </div>
                    </div>
                  );
                })}
              </Document>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
