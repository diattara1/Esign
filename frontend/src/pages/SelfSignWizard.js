// src/pages/SelfSignWizard.js
import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';
import signatureService from '../services/signatureService';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function SelfSignWizard() {
  const [files, setFiles] = useState([]);           // FileList -> Array<File>
  const [pdfUrl, setPdfUrl] = useState(null);       // preview du 1er PDF
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({});
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);

  const [placing, setPlacing] = useState(false);
  const [placement, setPlacement] = useState(null); // {page,x,y,width,height}
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
    // preview du 1er
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
    toast.success(`Zone posée p.${pageNumber}`);
  };

  const submit = async () => {
    if (!files.length) return toast.error('Ajoute au moins un PDF');
    if (!placement) return toast.error('Définis la zone de signature');
    if (!sigFile) return toast.error('Ajoute une image de signature (PNG transparent recommandé)');

    const fd = new FormData();
    files.forEach(f => fd.append('files[]', f));
    fd.append('placements', JSON.stringify([placement]));
    fd.append('signature_image', sigFile);

    try {
       if (files.length === 1) {
        // mode direct
        fd.append('sync', 'true');
        const blob = await signatureService.selfSign(fd, { sync: true });
        const url = URL.createObjectURL(blob);
        const base = (files[0].name || 'document').replace(/\.pdf$/i,'');
        const a = document.createElement('a');
        a.href = url;
        a.download = `${base}_signed.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Document signé et téléchargé');
        return;
      }

      // sinon: batch
      const job = await signatureService.selfSign(fd);
      toast.success('Job lancé');
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

await poll();                 // 👉 un premier poll immédiat
intervalId = setInterval(poll, 2000)

      // polling simple (toutes les 2s)
      const interval = setInterval(async () => {
        const j = await signatureService.getBatchJob(job.id);
        if (j.status === 'completed' || j.status === 'partial' || j.status === 'failed') {
          clearInterval(interval);
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
      }, 2000);
    } catch (e) {
     console.error(e);
     const msg = e?.response?.data?.error || 'Erreur au lancement du job';
     toast.error(msg);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-1/3 p-6 bg-white border-r overflow-auto">
        <h1 className="text-2xl font-bold mb-4">Signer maintenant</h1>

        <div className="mb-4">
          <label className="block font-medium mb-1">PDF(s)</label>
          <input type="file" accept="application/pdf" multiple onChange={onFiles} />
          <p className="text-xs text-gray-500 mt-1">Sélectionne 1 ou plusieurs PDF</p>
        </div>

        <div className="mb-4">
          <label className="block font-medium mb-1">Signature (PNG)</label>
          <input type="file" accept="image/*" onChange={e => setSigFile(e.target.files?.[0] || null)} />
          <p className="text-xs text-gray-500 mt-1">Transparent recommandé pour un rendu propre</p>
        </div>

        <div className="mb-4">
          <button
            onClick={() => setPlacing(true)}
            className={`px-3 py-2 rounded ${placing ? 'bg-yellow-600' : 'bg-yellow-500'} text-white`}
          >
            {placement ? 'Redéfinir la zone' : 'Définir la zone'}
          </button>
          {placement && (
            <div className="mt-2 text-sm text-green-700">
              p.{placement.page} x {Math.round(placement.x)} y {Math.round(placement.y)} w {Math.round(placement.width)} h {Math.round(placement.height)}
            </div>
          )}
        </div>

        <button
          onClick={submit}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          Lancer la signature
        </button>
      </div>

      {/* Viewer */}
      <div className="flex-1 p-4 overflow-auto bg-gray-50" ref={viewerRef}>
        {!pdfUrl ? (
          <div className="text-gray-500">Ajoute au moins un PDF pour prévisualiser</div>
        ) : (
          <Document file={pdfUrl} onLoadSuccess={onDocLoad} loading={<div>Chargement...</div>}>
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="relative mb-6">
                <Page
                  pageNumber={i + 1}
                  width={viewerWidth || 600}
                  renderTextLayer={false}
                  onLoadSuccess={p => onPageLoad(i + 1, p)}
                />
                {pageDims[i + 1] && (
                  <div
                    onClick={e => handleOverlayClick(e, i + 1)}
                    className="absolute top-0 left-0 w-full"
                    style={{
                      height: pageDims[i + 1].height * ((viewerWidth || 600) / (pageDims[i + 1].width || 600)),
                      cursor: placing ? 'crosshair' : 'default',
                      zIndex: 10,
                      backgroundColor: placing ? 'rgba(255, 255, 0, 0.08)' : 'transparent'
                    }}
                  />
                )}
                {placement?.page === i + 1 && (
                  <div
                    className="absolute border-2 border-green-500 bg-green-100/60"
                    style={{
                      top: placement.y * ((viewerWidth || 600) / (pageDims[i + 1]?.width || 1)),
                      left: placement.x * ((viewerWidth || 600) / (pageDims[i + 1]?.width || 1)),
                      width: placement.width * ((viewerWidth || 600) / (pageDims[i + 1]?.width || 1)),
                      height: placement.height * ((viewerWidth || 600) / (pageDims[i + 1]?.width || 1)),
                      zIndex: 20
                    }}
                  />
                )}
              </div>
            ))}
          </Document>
        )}
      </div>
    </div>
  );
}
