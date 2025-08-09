import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function DocumentWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState(null);
  const [flowType, setFlowType] = useState('sequential');
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [recipients, setRecipients] = useState([
    { email: '', full_name: '', order: 1, signature_position: null }
  ]);
  const [placingIdx, setPlacingIdx] = useState(null);
  const [pdfError, setPdfError] = useState(null);
  const [pageDimensions, setPageDimensions] = useState({});
  const pdfWrapper = useRef();

  useEffect(() => {
    signatureService.getEnvelope(id)
      .then(env => {
        setEnvelope(env);
        setFlowType(env.flow_type || 'sequential');
      })
      .then(() => signatureService.downloadEnvelope(id))
      .then(res => setPdfUrl(res.download_url))
      .catch(() => toast.error('Impossible de charger le PDF'));
  }, [id]);

  function onDocumentLoad({ numPages }) {
    setNumPages(numPages);
    setPdfError(null);
  }

  function onDocumentError(error) {
    console.error('PDF Error:', error);
    setPdfError(error.message);
    toast.error('Erreur lors du chargement du PDF');
  }

  function onPageLoadSuccess(pageNumber, page) {
    const viewport = page.getViewport({ scale: 1 });
    setPageDimensions(prev => ({
      ...prev,
      [pageNumber]: { width: viewport.width, height: viewport.height }
    }));
  }

  const handlePdfClick = (e, pageNumber) => {
    if (placingIdx === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const width = 150;
    const height = 50;
    const containerWidth = pdfWrapper.current?.clientWidth || 600;
    const viewport = pageDimensions[pageNumber] || { width: 600, height: 800 };
    const scale = containerWidth / viewport.width;
    const normalizedX = x / scale;
    const normalizedY = y / scale;
    const normalizedWidth = width / scale;
    const normalizedHeight = height / scale;

    const pos = {
      page: pageNumber,
      x: normalizedX,
      y: normalizedY,
      width: normalizedWidth,
      height: normalizedHeight
    };

    const copy = [...recipients];
    copy[placingIdx].signature_position = pos;
    setRecipients(copy);
    toast.success(`Position définie pour destinataire #${placingIdx + 1}`);
    setPlacingIdx(null);
  };

  const addRecipient = () => {
    setRecipients(prev => [
      ...prev,
      { email: '', full_name: '', order: prev.length + 1, signature_position: null }
    ]);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (recipients.some(r => !r.signature_position)) {
      toast.error('Tous les destinataires doivent avoir une position de signature définie');
      return;
    }
    try {
      const fields = recipients.map((r, idx) => ({
        recipient_id: idx + 1,
        field_type: 'signature',
        page: r.signature_position.page,
        position: {
          x: r.signature_position.x,
          y: r.signature_position.y,
          width: r.signature_position.width,
          height: r.signature_position.height
        },
        name: `Signature ${r.full_name || `Destinataire ${idx + 1}`}`,
        required: true
      }));

      await signatureService.updateEnvelope(id, {
        recipients,
        fields,
        flow_type: flowType
      });
      await signatureService.sendEnvelope(id);
      toast.success('Enveloppe envoyée');
      navigate('/signature/list');
    } catch {
      toast.error("Échec de l'envoi");
    }
  };

  if (!envelope || !pdfUrl) return <div>Chargement…</div>;

  if (pdfError) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Erreur PDF</h2>
          <p className="text-gray-600 mb-4">{pdfError}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Recharger la page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <div className="w-1/3 p-6 bg-gray-50 overflow-auto border-r">
        <h2 className="text-2xl font-semibold mb-4">Destinataires</h2>

        <div className="mb-6">
          <span className="font-semibold">Type de signature :</span>
          <label className="ml-4">
            <input
              type="radio"
              name="flowType"
              value="sequential"
              checked={flowType === 'sequential'}
              onChange={() => setFlowType('sequential')}
              className="mr-1"
            />
            Séquentielle
          </label>
          <label className="ml-4">
            <input
              type="radio"
              name="flowType"
              value="parallel"
              checked={flowType === 'parallel'}
              onChange={() => setFlowType('parallel')}
              className="mr-1"
            />
            Parallèle
          </label>
        </div>

        {recipients.map((r, idx) => (
          <div key={idx} className="bg-white p-4 rounded shadow mb-4">
            <label className="block mb-2">
              Email
              <input
                type="email"
                value={r.email}
                onChange={e => {
                  const c = [...recipients];
                  c[idx].email = e.target.value;
                  setRecipients(c);
                }}
                className="w-full border px-2 py-1 mt-1"
              />
            </label>
            <label className="block mb-2">
              Nom
              <input
                type="text"
                value={r.full_name}
                onChange={e => {
                  const c = [...recipients];
                  c[idx].full_name = e.target.value;
                  setRecipients(c);
                }}
                className="w-full border px-2 py-1 mt-1"
              />
            </label>
            <button
              type="button"
              onClick={() => setPlacingIdx(idx)}
              className={`mt-2 px-3 py-1 rounded ${
                placingIdx === idx ? 'bg-yellow-600' : 'bg-yellow-500'
              } text-white`}
            >
              {r.signature_position ? 'Redéfinir position' : 'Définir position'}
            </button>
            {placingIdx === idx && (
              <p className="text-sm text-blue-600 mt-1">
                Cliquez sur le PDF pour positionner la signature
              </p>
            )}
            {r.signature_position && (
              <p className="text-sm text-green-700 mt-1">
                Page {r.signature_position.page}, x {Math.round(r.signature_position.x)}, y {Math.round(r.signature_position.y)}
              </p>
            )}
          </div>
        ))}
        <button
          onClick={addRecipient}
          className="w-full bg-gray-500 text-white py-2 rounded mb-4"
        >
          + Ajouter un destinataire
        </button>
        <button
          onClick={handleSubmit}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          Envoyer l'enveloppe
        </button>
      </div>

      <div className="flex-1 p-4 overflow-auto pdf-container" ref={pdfWrapper}>
        <Document
          file={pdfUrl}
          onLoadSuccess={onDocumentLoad}
          onLoadError={onDocumentError}
          loading={<div>Chargement du PDF...</div>}
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div key={i} className="relative mb-6">
              <Page
                pageNumber={i + 1}
                width={pdfWrapper.current?.clientWidth || 600}
                loading={<div>Chargement de la page {i + 1}...</div>}
                onLoadSuccess={(page) => onPageLoadSuccess(i + 1, page)}
                renderTextLayer={false}
              />

              {pageDimensions[i + 1] && (
                <div
                  onClick={e => handlePdfClick(e, i + 1)}
                  className="absolute top-0 left-0 w-full"
                  style={{
                    height: pageDimensions[i + 1].height * (pdfWrapper.current?.clientWidth / pageDimensions[i + 1].width),
                    cursor: placingIdx !== null ? 'crosshair' : 'default',
                    zIndex: 10,
                    backgroundColor: placingIdx !== null ? 'rgba(255, 255, 0, 0.1)' : 'transparent'
                  }}
                  title={placingIdx !== null ? 'Cliquez pour positionner la signature' : ''}
                />
              )}

            
              {/* Affichage des zones de signature */}
              {recipients.map((recipient, recipientIdx) => (
                recipient.signature_position?.page === i + 1 && (
                  <div
                    key={recipientIdx}
                    className="absolute border-2 border-blue-500 bg-blue-100 bg-opacity-50 flex items-center justify-center text-xs font-semibold"
                    style={{
                      top: recipient.signature_position.y * (pdfWrapper.current?.clientWidth / pageDimensions[i + 1]?.width || 1),
                      left: recipient.signature_position.x * (pdfWrapper.current?.clientWidth / pageDimensions[i + 1]?.width || 1),
                      width: recipient.signature_position.width * (pdfWrapper.current?.clientWidth / pageDimensions[i + 1]?.width || 1),
                      height: recipient.signature_position.height * (pdfWrapper.current?.clientWidth / pageDimensions[i + 1]?.width || 1),
                      zIndex: 5
                    }}
                  >
                    {recipient.full_name || `Destinataire ${recipientIdx + 1}`}
                  </div>
                )
              ))}

              {placingIdx !== null && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="text-center mt-2 text-sm text-blue-600 font-semibold">
                    Mode placement activé - Cliquez sur le PDF
                  </div>
                </div>
              )}
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}