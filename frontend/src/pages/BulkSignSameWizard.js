// src/pages/BulkSignSameWizard.js
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import { FiLayers, FiDownload, FiMove, FiFile } from 'react-icons/fi';
import signatureService from '../services/signatureService';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function BulkSignSameWizard() {
  const [files, setFiles] = useState([]);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null);
  const [sigFile, setSigFile] = useState(null);

  useLayoutEffect(() => {
    const measure = () => setViewerWidth(viewerRef.current?.clientWidth || 600);
    measure();
    const ro = new ResizeObserver(measure);
    if (viewerRef.current) ro.observe(viewerRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const onFiles = e => {
    const arr = Array.from(e.target.files || []);
    setFiles(arr);
    setPlacement(null);
    
    // Prévisualiser le premier PDF
    if (arr[0]) {
      const url = URL.createObjectURL(arr[0]);
      setPdfUrl(url);
    } else {
      setPdfUrl(null);
    }
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
    toast.success(`Zone définie sur la page ${pageNumber} (sera appliquée sur tous les documents)`);
  };

  const submit = async () => {
    if (!files.length) return toast.error('Ajoute au moins un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigFile) return toast.error('Ajoute une image de signature');

    const fd = new FormData();
    files.forEach(f => fd.append('files', f));
    fd.append('mode', 'bulk_same_spot');
    fd.append('placements', JSON.stringify([placement]));
    fd.append('signature_image', sigFile);

    try {
      const job = await signatureService.createBatchSign(fd);
      toast.success('Job de signature lancé');

      let intervalId = null;

      const poll = async () => {
        try {
          const j = await signatureService.getBatchJob(job.id);
          if (j.status === 'completed' || j.status === 'partial' || j.status === 'failed') {
            if (intervalId) clearInterval(intervalId);
            if (j.result_zip) {
              const { url } = await signatureService.downloadBatchZip(j.id);
              const a = document.createElement('a');
              a.href = url;
              a.download = `batch_${j.id}.zip`;
              a.click();
              URL.revokeObjectURL(url);
            }
            toast.info(`Terminé: ${j.done}/${j.total}, échecs: ${j.failed}`);
          }
        } catch (e) {
          if (intervalId) clearInterval(intervalId);
          console.error(e);
          toast.error('Erreur de suivi du job');
        }
      };

      await poll();
      intervalId = setInterval(poll, 2000);

    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'Erreur au lancement du job';
      toast.error(msg);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-full lg:w-1/3 p-4 lg:p-6 bg-white border-r border-gray-200 overflow-auto">
        <div className="flex items-center mb-4">
          <FiLayers className="w-6 h-6 text-blue-600 mr-3" />
          <h1 className="text-xl lg:text-2xl font-bold text-gray-800">
            Signature masse 
          </h1>
        </div>
        
        <p className="text-sm text-gray-600 mb-6">
          Signe plusieurs documents à la même position. Définis une zone sur le premier document, 
          elle sera appliquée automatiquement sur tous les autres.
        </p>

        {/* Upload PDF */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">PDF(s)</label>
          <input 
            type="file" 
            accept="application/pdf" 
            multiple 
            onChange={onFiles}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="text-xs text-gray-500 mt-1">
            Sélectionne plusieurs PDF qui auront la signature au même endroit
          </p>
        </div>

        {/* Files List */}
        {files.length > 0 && (
          <div className="mb-6">
            <label className="block font-medium mb-2 text-gray-700">
              Documents sélectionnés ({files.length})
            </label>
            <div className="bg-gray-50 rounded-lg p-3 max-h-32 overflow-y-auto">
              {files.map((file, index) => (
                <div key={index} className="flex items-center text-sm text-gray-700 mb-1 last:mb-0">
                  <FiFile className="w-4 h-4 mr-2 text-blue-500" />
                  <span className="truncate">
                    {file.name.length > 30 ? file.name.substring(0, 30) + '...' : file.name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signature Upload */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">Signature (PNG)</label>
          <input 
            type="file" 
            accept="image/*" 
            onChange={e => setSigFile(e.target.files?.[0] || null)}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
          />
          <p className="text-xs text-gray-500 mt-1">
            PNG avec fond transparent recommandé
          </p>
        </div>

        {/* Signature Zone */}
        <div className="mb-6">
          <label className="block font-medium mb-2 text-gray-700">Zone de signature</label>
          
          {placement ? (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-3">
              <div className="text-sm text-green-800">
                <div className="font-medium">Zone définie ✓</div>
                <div className="text-xs mt-1">
                  Page {placement.page} 
                 
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-3">
              <div className="text-sm text-yellow-800">
                Aucune zone définie. Clique sur "Définir la zone" puis sur le document.
              </div>
            </div>
          )}

          <button
            onClick={() => setPlacing(true)}
            disabled={!files.length}
            className={`w-full px-4 py-2 rounded-lg text-white font-medium transition-all duration-200 ${
              placing
                ? 'bg-yellow-600 hover:bg-yellow-700'
                : 'bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400'
            }`}
          >
            {placing ? (
              <>
                <FiMove className="inline w-4 h-4 mr-2" />
                Clique sur le PDF pour placer
              </>
            ) : placement ? (
              'Redéfinir la zone'
            ) : (
              'Définir la zone'
            )}
          </button>
        </div>

        

        {/* Summary */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-medium text-blue-800 mb-2">Résumé</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <div>Documents: {files.length}</div>
            <div>Zone définie: {placement ? '✓' : '✗'}</div>
            <div>Signature: {sigFile ? '✓' : '✗'}</div>
          </div>
          {placement && (
            <div className="mt-2 text-xs text-blue-600">
              La signature sera appliquée à la page {placement.page} de chaque document
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={submit}
          disabled={!files.length || !placement || !sigFile}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-105 disabled:transform-none disabled:cursor-not-allowed"
        >
          <FiDownload className="inline w-4 h-4 mr-2" />
          Lancer la signature
        </button>
      </div>

      {/* PDF Viewer */}
      <div className="flex-1 p-4 overflow-auto" ref={viewerRef}>
        {!pdfUrl ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <FiLayers className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">Ajoute des PDF pour commencer</p>
              <p className="text-sm">Tous les documents auront la signature au même endroit</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
              <h2 className="font-medium text-gray-800">
                Aperçu du premier document
              </h2>
              <p className="text-sm text-gray-600">
                Définis la zone de signature qui sera appliquée sur tous les {files.length} document(s)
              </p>
            </div>
            
            <div className="p-4">
              <Document 
                file={pdfUrl} 
                onLoadSuccess={onDocLoad} 
                loading={
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                }
              >
                {Array.from({ length: numPages }, (_, i) => (
                  <div key={i} className="relative mb-6 last:mb-0">
                    <Page
                      pageNumber={i + 1}
                      width={Math.min(viewerWidth - 32, 800)}
                      renderTextLayer={false}
                      onLoadSuccess={p => onPageLoad(i + 1, p)}
                      className="border border-gray-200 rounded-lg shadow-sm"
                    />
                    
                    {/* Overlay pour placement */}
                    {pageDims[i + 1] && (
                      <div
                        onClick={e => handleOverlayClick(e, i + 1)}
                        className="absolute top-0 left-0 w-full rounded-lg"
                        style={{
                          height: pageDims[i + 1].height * (Math.min(viewerWidth - 32, 800) / (pageDims[i + 1].width || 800)),
                          cursor: placing ? 'crosshair' : 'default',
                          zIndex: 10,
                          backgroundColor: placing ? 'rgba(59, 130, 246, 0.05)' : 'transparent'
                        }}
                      />
                    )}
                    
                    {/* Affichage de la zone de signature */}
                    {placement?.page === i + 1 && (
                      <div
                        className="absolute border-2 border-blue-500 bg-blue-100/60 rounded"
                        style={{
                          top: placement.y * (Math.min(viewerWidth - 32, 800) / (pageDims[i + 1]?.width || 1)),
                          left: placement.x * (Math.min(viewerWidth - 32, 800) / (pageDims[i + 1]?.width || 1)),
                          width: placement.width * (Math.min(viewerWidth - 32, 800) / (pageDims[i + 1]?.width || 1)),
                          height: placement.height * (Math.min(viewerWidth - 32, 800) / (pageDims[i + 1]?.width || 1)),
                          zIndex: 20
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xs font-medium text-blue-700 bg-white/80 px-2 py-1 rounded">
                            Signature
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </Document>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}