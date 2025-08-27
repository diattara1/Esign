// src/pages/BulkSignSameWizard.js (version responsive + fluide)
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiMove, FiFile, FiX, FiMenu } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function BulkSignSameWizard() {
  // ---- state ----
  const [files, setFiles] = useState([]);
  const [sigFile, setSigFile] = useState(null);
  const [includeQr, setIncludeQr] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}

  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({}); // {pageNo:{width,height}}
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const pollingRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // responsive UI
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ---- layout measure ----
  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    const setBp = () => setIsMobile(window.innerWidth < 1024);
    measure(); setBp();
    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', measure);
    window.addEventListener('resize', setBp);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('resize', setBp); };
  }, []);

  // lock scroll when drawer open
  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

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
    setFiles(arr);
    setPlacement(null);
    setPdfUrl(arr[0] ? URL.createObjectURL(arr[0]) : null);
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
  };

  // ---- submit + polling ----
  const submit = async () => {
    if (!files.length) return toast.error('Ajoute au moins un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigFile) return toast.error('Ajoute une image de signature');

    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('mode', 'bulk_same_spot');
    fd.append('placements', JSON.stringify([placement]));
    fd.append('signature_image', sigFile);
    fd.append('include_qr', includeQr ? 'true' : 'false');

    setIsProcessing(true);
    try {
      const job = await signatureService.createBatchSign(fd);

      const poll = async () => {
        const j = await signatureService.getBatchJob(job.id);
        if (['completed', 'partial', 'failed'].includes(j.status)) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (j.result_zip) {
            const { url } = await signatureService.downloadBatchZip(j.id);
            const a = document.createElement('a');
            a.href = url; a.download = `batch_${j.id}.zip`; a.click();
            URL.revokeObjectURL(url);
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

  const resetAll = () => { setFiles([]); setPdfUrl(null); setSigFile(null); setPlacement(null); };

  /* ------------------------------ UI ------------------------------ */

  const Sidebar = () => (
    <div className="h-full flex flex-col">
      <div className="p-4 lg:p-6 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center">
          <FiLayers className="w-6 h-6 text-blue-600 mr-3" />
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800">Signature masse</h1>
        </div>
        {(files.length || sigFile || placement) && (
          <button onClick={resetAll} className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1" title="Réinitialiser">
            <FiX className="w-4 h-4" /> Reset
          </button>
        )}
      </div>

      <div className="p-4 lg:p-6">
        <p className="text-sm text-gray-600 mb-6">Définis une zone sur le premier PDF, elle sera appliquée à tous les autres.</p>

        {/* Upload PDFs */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">PDF(s)</label>
          <input
            type="file"
            accept="application/pdf"
            multiple
            onChange={onFiles}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">Sélectionne plusieurs PDF (même emplacement de signature).</p>
        </div>

        {/* Files list */}
        {!!files.length && (
          <div className="mb-6">
            <label className="block font-medium mb-2 text-gray-700">Documents ({files.length})</label>
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              {files.map((f, i) => (
                <div key={i} className="flex items-center text-sm text-gray-700 mb-1 last:mb-0">
                  <FiFile className="w-4 h-4 mr-2 text-blue-500" />
                  <span className="truncate">{f.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature image */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">Signature (image)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setSigFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          <p className="text-xs text-gray-500 mt-1">PNG avec fond transparent recommandé.</p>
        </div>

        {/* Zone */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">Zone de signature</label>
          {placement ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3 text-sm text-green-800">Zone définie ✓ — Page {placement.page}</div>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3 text-sm text-yellow-800">Aucune zone définie. Clique “Définir la zone” puis clique sur le PDF.</div>
          )}
          <button
            onClick={() => { setPlacing(true); if (isMobile) setSidebarOpen(false); }}
            disabled={!files.length}
            className={`w-full px-4 py-2 rounded-lg text-white font-medium transition ${placing ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'}`}
          >
            {placing ? (<><FiMove className="inline w-4 h-4 mr-2" />Clique sur le PDF</>) : (placement ? 'Redéfinir la zone' : 'Définir la zone')}
          </button>
        </div>

        {/* Options */}
        <div className="mb-6">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={includeQr} onChange={(e) => setIncludeQr(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Apposer un code QR (recommandé)
          </label>
        </div>

        {/* Summary */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg text-sm text-blue-800 space-y-1">
          <div><strong>Documents :</strong> {files.length}</div>
          <div><strong>Zone :</strong> {placement ? '✓' : '✗'}</div>
          <div><strong>Signature :</strong> {sigFile ? '✓' : '✗'}</div>
        </div>

        {/* Submit */}
        <button onClick={submit} disabled={!files.length || !placement || !sigFile || isProcessing} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition">
          <FiDownload className="inline w-4 h-4 mr-2" />
          {isProcessing ? 'Lancement…' : 'Lancer la signature'}
        </button>
      </div>
    </div>
  );

  const containerOverlayStyle = isMobile && sidebarOpen ? { touchAction: 'none' } : {};

  return (
    <div className="h-screen bg-gray-50 flex" style={containerOverlayStyle}>
      {/* Hamburger on mobile */}
      {isMobile && (
        <button onClick={() => setSidebarOpen(true)} className="fixed top-4 left-4 z-50 p-3 bg-white rounded-lg shadow-lg border lg:hidden">
          <FiMenu className="w-5 h-5" />
        </button>
      )}

      {/* Sidebar (drawer on mobile) */}
      <div className={`${isMobile ? `fixed inset-y-0 left-0 z-40 w-full max-w-sm transform transition-transform duration-200 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}` : 'w-full lg:w-1/3'} bg-white border-r border-gray-200` }>
        {isMobile && sidebarOpen && <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setSidebarOpen(false)} />}
        <div className="relative z-40 bg-white h-full overflow-auto"><Sidebar /></div>
      </div>

      {/* Viewer */}
      <div className="flex-1 flex flex-col" ref={viewerRef} style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}>
        <div className="bg-white border-b border-gray-200 px-4 lg:px-6 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base lg:text-lg font-semibold text-gray-900 truncate">{files[0]?.name || 'Aperçu PDF'}</h2>
            {placement && <span className="hidden lg:inline px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">Zone p.{placement.page}</span>}
            {placing && <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-sm rounded-full animate-pulse">Mode placement actif</span>}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {!pdfUrl ? (
            <div className="flex items-center justify-center h-full text-center text-gray-500">
              <div>
                <FiLayers className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p className="text-lg font-medium">Ajoute des PDF pour commencer</p>
                <p className="text-sm">La zone choisie sera appliquée à tous les documents</p>
                {isMobile && <button onClick={() => setSidebarOpen(true)} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg">Ouvrir les options</button>}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <h3 className="font-medium text-gray-800">Aperçu du premier document</h3>
                <p className="text-sm text-gray-600">Définis la zone de signature qui sera appliquée sur {files.length} document(s)</p>
              </div>
              <div className="p-4">
                <Document file={pdfUrl} onLoadSuccess={onDocLoad}
                          loading={<div className="flex items-center justify-center p-8"><div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>}
                          error={<div className="text-red-500 text-center p-8">Erreur lors du chargement du PDF</div>}>
                  {Array.from({ length: numPages }, (_, i) => {
                    const n = i + 1, padding = isMobile ? 24 : 32; // p-4
                    const w = Math.min(Math.max(viewerWidth - padding, 320), 900);
                    const s = pageScale(n);
                    return (
                      <div key={i} className="relative mb-6 last:mb-0">
                        <Page pageNumber={n} width={w} renderTextLayer={false} onLoadSuccess={(p) => onPageLoad(n, p)} className="border border-gray-200 rounded-lg shadow-sm mx-auto" />
                        {pageDims[n] && (
                          <div
                            onClick={(e) => handleOverlayClick(e, n)}
                            className="absolute top-0 left-1/2 -translate-x-1/2 rounded-lg"
                            style={{ width: w, height: pageDims[n].height * s, cursor: placing ? 'crosshair' : 'default', zIndex: 10, backgroundColor: placing ? 'rgba(59,130,246,.06)' : 'transparent' }}
                          />
                        )}
                        {placement?.page === n && (
                          <div className="absolute border-2 border-blue-500 bg-blue-100/60 rounded"
                               style={{ top: placement.y * s, left: `calc(50% - ${w / 2}px + ${placement.x * s}px)`, width: placement.width * s, height: placement.height * s, zIndex: 20 }}>
                            <button onClick={() => setPlacement(null)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">
                              <FiX className="w-3 h-3" />
                            </button>
                          </div>
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
    </div>
  );
}
