// src/pages/BulkSignSameWizard.js
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiMove, FiFile, FiX } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function BulkSignSameWizard() {
  // ---- state ----
  const [files, setFiles] = useState([]);
  const [sigFile, setSigFile] = useState(null);
  const [includeQr, setIncludeQr] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null);      // {page,x,y,width,height}

  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});          // {pageNo:{width,height}}
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const pollingRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ---- layout measure ----
  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    measure();
    const ro = new ResizeObserver(measure);
    viewerRef.current && ro.observe(viewerRef.current);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  // Revoke objectURL on unmount / change
  useEffect(() => () => pdfUrl && URL.revokeObjectURL(pdfUrl), [pdfUrl]);

  // ---- helpers ----
  const pageScale = (n) => {
    const w = Math.min(viewerWidth - 32, 800);
    return w / (pageDims[n]?.width || w || 1);
  };

  const onFiles = (e) => {
    const arr = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf');
    setFiles(arr);
    setPlacement(null);
    setPdfUrl(arr[0] ? URL.createObjectURL(arr[0]) : null);
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
  };

  // ---- submit + polling ----
  const submit = async () => {
    if (!files.length)  return toast.error('Ajoute au moins un PDF');
    if (!placement)     return toast.error('Définis la zone de signature');
    if (!sigFile)       return toast.error('Ajoute une image de signature');

    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    fd.append('mode', 'bulk_same_spot');
    fd.append('placements', JSON.stringify([placement]));
    fd.append('signature_image', sigFile);
    fd.append('include_qr', includeQr ? 'true' : 'false');

    setIsProcessing(true);
    try {
      const job = await signatureService.createBatchSign(fd);

      const poll = async () => {
        const j = await signatureService.getBatchJob(job.id);
        if (['completed','partial','failed'].includes(j.status)) {
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

  // ---- UI ----
  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-full lg:w-1/3 p-4 lg:p-6 bg-white border-r border-gray-200 overflow-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <FiLayers className="w-6 h-6 text-blue-600 mr-3" />
            <h1 className="text-xl lg:text-2xl font-bold text-gray-800">Signature masse</h1>
          </div>
          {(files.length || sigFile || placement) ? (
            <button
              onClick={() => { setFiles([]); setPdfUrl(null); setSigFile(null); setPlacement(null); }}
              className="text-gray-500 hover:text-gray-700 text-sm flex items-center gap-1"
              title="Réinitialiser"
            >
              <FiX className="w-4 h-4" /> Reset
            </button>
          ) : null}
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Définis une zone sur le premier PDF, elle sera appliquée à tous les autres.
        </p>

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
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3 text-sm text-green-800">
              Zone définie ✓ — Page {placement.page}
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3 text-sm text-yellow-800">
              Aucune zone définie. Clique “Définir la zone” puis clique sur le PDF.
            </div>
          )}
          <button
            onClick={() => setPlacing(true)}
            disabled={!files.length}
            className={`w-full px-4 py-2 rounded-lg text-white font-medium transition ${
              placing ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'
            }`}
          >
            {placing ? (<><FiMove className="inline w-4 h-4 mr-2" />Clique sur le PDF</>) : (placement ? 'Redéfinir la zone' : 'Définir la zone')}
          </button>
        </div>

        {/* Options */}
        <div className="mb-6">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={includeQr}
              onChange={(e) => setIncludeQr(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
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
        <button
          onClick={submit}
          disabled={!files.length || !placement || !sigFile || isProcessing}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition"
        >
          <FiDownload className="inline w-4 h-4 mr-2" />
          {isProcessing ? 'Lancement…' : 'Lancer la signature'}
        </button>
      </div>

      {/* Viewer */}
      <div className="flex-1 p-4 overflow-auto" ref={viewerRef} style={isProcessing ? { pointerEvents: 'none', filter: 'grayscale(0.2)', opacity: 0.7 } : {}}>
        {!pdfUrl ? (
          <div className="flex items-center justify-center h-full text-center text-gray-500">
            <div>
              <FiLayers className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Ajoute des PDF pour commencer</p>
              <p className="text-sm">La zone choisie sera appliquée à tous les documents</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h2 className="font-medium text-gray-800">Aperçu du premier document</h2>
              <p className="text-sm text-gray-600">Définis la zone de signature qui sera appliquée sur {files.length} document(s)</p>
            </div>
            <div className="p-4">
              <Document file={pdfUrl} onLoadSuccess={onDocLoad}
                loading={<div className="flex items-center justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>}>
                {Array.from({ length: numPages }, (_, i) => {
                  const n = i + 1, w = Math.min(viewerWidth - 32, 800), s = pageScale(n);
                  return (
                    <div key={i} className="relative mb-6 last:mb-0">
                      <Page pageNumber={n} width={w} renderTextLayer={false} onLoadSuccess={(p) => onPageLoad(n, p)} className="border border-gray-200 rounded-lg shadow-sm" />
                      {pageDims[n] && (
                        <div
                          onClick={(e) => handleOverlayClick(e, n)}
                          className="absolute top-0 left-0 w-full rounded-lg"
                          style={{ height: pageDims[n].height * s, cursor: placing ? 'crosshair' : 'default', zIndex: 10, backgroundColor: placing ? 'rgba(59,130,246,.06)' : 'transparent' }}
                        />
                      )}
                      {placement?.page === n && (
                        <div
                          className="absolute border-2 border-blue-500 bg-blue-100/60 rounded"
                          style={{ top: placement.y * s, left: placement.x * s, width: placement.width * s, height: placement.height * s, zIndex: 20 }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-xs font-medium text-blue-700 bg-white/80 px-2 py-1 rounded">Signature</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </Document>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
