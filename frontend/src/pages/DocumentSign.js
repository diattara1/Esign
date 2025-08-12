// src/pages/DocumentSign.js
// Signature multi-docs, PDF stable (pas de zoom), invité/auth OK,
// modal au-dessus de tout, et deux modes: "dessiner" et "importer".

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Document, Page, pdfjs } from 'react-pdf';
import signatureService from '../services/signatureService';
import SignaturePadComponent from '../components/SignaturePadComponent';
import Modal from 'react-modal';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const DocumentSign = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isGuest = Boolean(token);

  const navigate = useNavigate();

  // viewer stable (évite le zoom/retrécissement)
  const pdfWrapper = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  useLayoutEffect(() => {
    if (!pdfWrapper.current) return;
    const measure = () => setViewerWidth(pdfWrapper.current.clientWidth || 0);
    measure();
    let ro;
    if (window.ResizeObserver) {
      ro = new ResizeObserver(measure);
      ro.observe(pdfWrapper.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, []);

  // données
  const [loading, setLoading] = useState(true);
  const [envelope, setEnvelope] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // rendu PDF
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState({}); // {pageNum:{width,height}}

  // état signature
  const [isAlreadySigned, setIsAlreadySigned] = useState(false);
  const [signing, setSigning] = useState(false);

  // OTP (invité)
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState(null);

  // modes: "draw" | "upload"
  const [mode, setMode] = useState('draw');
  const [signatureData, setSignatureData] = useState({}); // {fieldId: dataURL}
  const [uploadPreview, setUploadPreview] = useState(null);

  // --- helpers invités (auth par header token) ---
  const fetchPdfBlobWithToken = async (url) => {
    const res = await fetch(url, { headers: token ? { 'X-Signature-Token': token } : {} });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) msg = j.error;
      } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  };

  const loadGuestPdfForDoc = async (docId, fallbackUrl) => {
    const tryUrl = `/api/signature/envelopes/${id}/documents/${docId}/file/`;
    try {
      const blobUrl = await fetchPdfBlobWithToken(tryUrl);
      return blobUrl;
    } catch {
      if (!fallbackUrl) throw new Error('Aucune URL de fallback');
      const blobUrl = await fetchPdfBlobWithToken(fallbackUrl);
      return blobUrl;
    }
  };

  // INIT (charge l’enveloppe et choisit le 1er document)
  useEffect(() => {
    const init = async () => {
      try {
        let data;
        if (isGuest) {
          data = await signatureService.getGuestEnvelope(id, token);
          setEnvelope(data);
          setDocuments(data.documents || []);
          const mine = (data.fields || []).filter(f => f.recipient_id === data.recipient_id);
          const already = mine.length && mine.every(f => f.signed);
          if (already) {
            setIsAlreadySigned(true);
            setOtpVerified(true);
          }
          if (data.documents?.length) setSelectedDoc(data.documents[0]);

          // si déjà signé, on peut charger directement un PDF lisible
          if (already) {
            const url = data.documents?.[0]?.file_url || data.document_url;
            try {
              const blobUrl = await fetchPdfBlobWithToken(url);
              setPdfUrl(blobUrl);
            } catch (e) {
              toast.error(`Impossible de charger le PDF : ${e.message}`);
            }
          }
        } else {
          data = await signatureService.getAuthenticatedEnvelope(id);
          setEnvelope(data);
          setDocuments(data.documents || []);
          const mine = (data.fields || []).filter(f => f.recipient_id === data.recipient_id);
          if (mine.length && mine.every(f => f.signed)) setIsAlreadySigned(true);

          if (data.documents?.length) {
            const first = data.documents[0];
            setSelectedDoc(first);
            try {
              const blobUrl = await signatureService.fetchDocumentBlob(id, first.id);
              setPdfUrl(blobUrl);
            } catch {
              toast.error('Impossible de charger le PDF');
            }
          } else {
            const { download_url } = await signatureService.downloadEnvelope(id);
            setPdfUrl(download_url);
          }
          setOtpVerified(true);
        }
      } catch (err) {
        console.error(err);
        toast.error(err?.response?.data?.error || 'Impossible de charger la page de signature');
        navigate('/');
        return;
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, token, isGuest, navigate]); // logiques initiales conservées :contentReference[oaicite:1]{index=1}

  // ✅ Révocation différée de l'URL blob (comme dans Workflow)
  const prevUrlRef = useRef(null);
  useEffect(() => {
    const prev = prevUrlRef.current;
    prevUrlRef.current = pdfUrl;
    return () => {
      try {
        if (prev && typeof prev === 'string' && prev.startsWith('blob:')) {
          URL.revokeObjectURL(prev);
        }
      } catch {}
    };
  }, [pdfUrl]); // pattern identique à DocumentWorkflow :contentReference[oaicite:2]{index=2}

  // ✅ Changement de document → charger le nouveau PDF
  useEffect(() => {
    let alive = true;

    const load = async () => {
      // reset doux : on laisse l'ancien pdfUrl afficher, on mettra à jour d'un coup
      setNumPages(0);
      setPageDimensions({});

      if (!selectedDoc) return;

      try {
        let blobUrl;
        if (isGuest) {
          blobUrl = await loadGuestPdfForDoc(selectedDoc.id, envelope?.document_url);
        } else {
          blobUrl = await signatureService.fetchDocumentBlob(id, selectedDoc.id);
        }
        if (!alive) return;
        setPdfUrl(blobUrl);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        toast.error('Impossible de charger ce PDF');
      }
    };

    load();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDoc]); // fix de la course et du remount :contentReference[oaicite:3]{index=3}

  // OTP
  const handleSendOtp = async () => {
    if (isAlreadySigned) return toast.info('Déjà signé');
    setSendingOtp(true);
    try {
      await signatureService.sendOtp(id, token);
      setOtpSent(true);
      toast.success('Code OTP envoyé');
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || 'Erreur envoi OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    setVerifyingOtp(true);
    try {
      await signatureService.verifyOtp(id, otp, token);
      setOtpVerified(true);
      setOtpError('');
      toast.success('OTP vérifié');

      const fallback = envelope?.document_url;
      if (selectedDoc?.id) {
        const blobUrl = await loadGuestPdfForDoc(selectedDoc.id, fallback);
        setPdfUrl(blobUrl);
      } else if (fallback) {
        const blobUrl = await fetchPdfBlobWithToken(fallback);
        setPdfUrl(blobUrl);
      }
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.error || 'OTP invalide';
      setOtpError(msg);
      toast.error(msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  // PDF callbacks stables
  const onDocumentLoad = ({ numPages }) => setNumPages(numPages);
  const onDocumentError = (err) => {
    console.error('PDF error:', err);
    toast.error('Erreur chargement PDF');
  };
  const onPageLoadSuccess = (num, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDimensions(prev => {
      const old = prev[num];
      if (old && old.width === vp.width && old.height === vp.height) return prev;
      return { ...prev, [num]: { width: vp.width, height: vp.height } };
    });
  };

  // champs du doc courant
  const currentFields = (envelope?.fields || []).filter(f => {
    if (selectedDoc) return f.document_id === selectedDoc.id;
    return !f.document_id;
  });

  // modal ouverture
  const openFieldModal = (field) => {
    if (isAlreadySigned) return toast.info('Document déjà signé');
    if (!field.editable) return toast.info('Champ non éditable');
    setSelectedField(field);
    setMode('draw'); // par défaut "Dessiner"
    const existing = signatureData[field.id];
    setUploadPreview(existing || null);
    setModalOpen(true);
  };

  // validation du modal
  const handleModalConfirm = () => {
    const dataUrl = signatureData[selectedField.id];
    if (!dataUrl) return toast.error('Veuillez fournir une signature');
    setEnvelope(e => ({
      ...e,
      fields: e.fields.map(f => (f.id === selectedField.id
        ? { ...f, signed: true, signature_data: dataUrl }
        : f))
    }));
    setModalOpen(false);
    toast.success('Signature ajoutée');
  };

  // peut-on signer ?
  const canSign = () => {
    if (!envelope || isAlreadySigned) return false;
    return envelope.fields.filter(f => f.editable).every(f => f.signed);
  };

  const handleSign = async () => {
    if (signing) return;
    if (!canSign()) return toast.error('Veuillez compléter toutes vos signatures');
    setSigning(true);
    try {
      const signedFields = envelope.fields.reduce((acc, f) => {
        acc[f.id] = { ...f, signed: f.signed };
        return acc;
      }, {});
      await signatureService.sign(
        id,
        { signature_data: signatureData, signed_fields: signedFields },
        isGuest ? token : undefined
      );
      toast.success('Document signé');
      navigate('/signature/success', { state: { id } });
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || 'Erreur lors de la signature');
    } finally {
      setSigning(false);
    }
  };

  // gestion upload image → dataURL
  const handleUploadChange = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Veuillez importer une image (PNG/JPG/SVG)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setUploadPreview(dataUrl);
      if (selectedField) {
        setSignatureData(prev => ({ ...prev, [selectedField.id]: dataUrl }));
      }
    };
    reader.readAsDataURL(file);
  };

  // UI
  if (loading) return <div className="p-6 text-center">Chargement…</div>;
  if (!envelope) return <div className="p-6 text-center text-red-600">Document introuvable.</div>;

  return (
    <div className="flex h-screen">
      {/* sidebar */}
      <div className="w-80 bg-white border-r p-6 overflow-auto">
        <h1 className="text-2xl font-bold mb-4">
          {isAlreadySigned ? 'Document déjà signé :' : 'Signer le document :'} {envelope.title}
        </h1>

        {/* docs */}
        <div className="mb-4">
          <div className="font-semibold mb-2">Documents</div>
          {documents.length === 0 ? (
            <div className="text-sm text-gray-500">Aucun</div>
          ) : (
            <ul className="space-y-1">
              {documents.map(doc => (
                <li key={doc.id}>
                  <button
                    className={`w-full text-left px-2 py-1 rounded ${
                      selectedDoc?.id === doc.id ? 'bg-blue-100' : 'hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      if (selectedDoc?.id === doc.id) return;
                      setSelectedDoc(doc); // le useEffect ci-dessus s’occupe du chargement PDF + reset
                    }}
                  >
                    {doc.name || `Document ${doc.id}`}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* OTP invité */}
        {isGuest && !otpSent && !otpVerified && !isAlreadySigned && (
          <button
            onClick={handleSendOtp}
            disabled={sendingOtp}
            className="w-full bg-blue-600 text-white p-2 rounded mb-4 disabled:opacity-50"
          >
            {sendingOtp ? 'Envoi…' : 'Envoyer OTP'}
          </button>
        )}
        {isGuest && otpSent && !otpVerified && (
          <>
            <input
              type="text"
              value={otp}
              onChange={e => setOtp(e.target.value)}
              placeholder="Entrez le code OTP"
              className="w-full border p-2 rounded mb-2"
            />
            {otpError && <p className="text-red-600 text-sm mb-2">{otpError}</p>}
            <button
              onClick={handleVerifyOtp}
              disabled={verifyingOtp}
              className="w-full bg-green-600 text-white p-2 rounded disabled:opacity-50"
            >
              {verifyingOtp ? 'Vérification…' : 'Vérifier OTP'}
            </button>
          </>
        )}

        {/* Bouton signer */}
        {(otpVerified || !isGuest) && !isAlreadySigned && (
          <button
            onClick={handleSign}
            disabled={!canSign() || signing}
            className={`w-full p-2 rounded mb-4 ${
              canSign() && !signing
                ? 'bg-green-700 text-white hover:bg-green-800'
                : 'bg-gray-300 text-gray-600 cursor-not-allowed'
            }`}
          >
            {signing ? 'Signature en cours…' : 'Signer le document'}
          </button>
        )}

        {isAlreadySigned && <p className="text-green-600">Vous avez déjà signé ce document.</p>}
      </div>

      {/* viewer PDF */}
      <div
        className="flex-1 p-4 overflow-y-scroll"
        ref={pdfWrapper}
        style={{ scrollbarGutter: 'stable' }}
      >
        {((!isGuest) || otpVerified) && pdfUrl ? (
          <Document
            // 🔑 clé basée sur l'URL → remount propre à chaque nouveau blob/URL
            key={String(pdfUrl || 'empty')} 
            file={pdfUrl}
            onLoadSuccess={onDocumentLoad}
            onLoadError={onDocumentError}
            loading={<div>Chargement PDF…</div>}
          >
            {numPages > 0 && Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="relative mb-4">
                <Page
                  pageNumber={i + 1}
                  width={viewerWidth || 600}
                  onLoadSuccess={page => onPageLoadSuccess(i + 1, page)}
                  renderTextLayer={false}
                />
                {currentFields
                  .filter(f => f.page === i + 1)
                  .map(field => {
                    const scale = (viewerWidth || 600) / (pageDimensions[i + 1]?.width || 1);
                    return (
                      <div
                        key={field.id}
                        onClick={field.editable ? () => openFieldModal(field) : undefined}
                        title={field.editable ? 'Cliquer pour signer' : 'Champ non éditable'}
                        className={`absolute flex items-center justify-center text-xs font-semibold border-2 ${
                          field.signed ? 'border-green-500 bg-green-100' : 'border-red-500 bg-red-100'
                        } ${field.editable ? 'cursor-pointer hover:bg-opacity-80' : ''}`}
                        style={{
                          top: field.position.y * scale,
                          left: field.position.x * scale,
                          width: field.position.width * scale,
                          height: field.position.height * scale,
                          zIndex: 10,
                        }}
                      >
                        {field.signed ? (() => {
                          const raw = field.signature_data;
                          const match = raw?.match(/data:image\/[^'"]+/);
                          const src = match ? match[0] : '';
                          return src
                            ? <img src={src} alt="signature" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                            : 'Signé';
                        })() : 'Signer'}
                      </div>
                    );
                  })}
              </div>
            ))}
          </Document>
        ) : (
          <div className="text-center text-gray-600">
            {isGuest && !otpVerified
              ? 'PDF indisponible : vérifiez d’abord l’OTP'
              : 'PDF indisponible'}
          </div>
        )}
      </div>

      {/* MODAL – seulement "Dessiner" et "Importer" */}
      <Modal
        isOpen={modalOpen}
        onRequestClose={() => setModalOpen(false)}
        contentLabel="Signer le champ"
        ariaHideApp={false}
        style={{
          overlay: {
            zIndex: 10000,
            backgroundColor: 'rgba(0,0,0,0.5)'
          },
          content: {
            zIndex: 10001,
            inset: '10% 20%',
            borderRadius: '12px',
            padding: '16px'
          }
        }}
      >
        <h2 className="text-lg font-semibold mb-3">Ajouter une signature</h2>

        <div className="flex items-center gap-4 mb-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === 'draw'}
              onChange={() => setMode('draw')}
            />
            <span>Dessiner</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="mode"
              checked={mode === 'upload'}
              onChange={() => setMode('upload')}
            />
            <span>Importer</span>
          </label>
        </div>

        {/* Contenu selon mode */}
        {mode === 'draw' ? (
          <SignaturePadComponent
            mode="draw"
            onChange={(dataUrl) => {
              if (!selectedField) return;
              setSignatureData(prev => ({ ...prev, [selectedField.id]: dataUrl }));
            }}
            onEnd={(dataUrl) => {
              if (!selectedField) return;
              setSignatureData(prev => ({ ...prev, [selectedField.id]: dataUrl }));
            }}
            initialValue={signatureData[selectedField?.id]}
          />
        ) : (
          <div className="space-y-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleUploadChange}
              className="block w-full text-sm"
            />
            {uploadPreview ? (
              <div className="border rounded p-2 inline-block">
                <img
                  src={uploadPreview}
                  alt="Aperçu signature"
                  style={{ maxWidth: 320, maxHeight: 160 }}
                />
              </div>
            ) : (
              <p className="text-sm text-gray-600">Choisissez une image (PNG/JPG/SVG) de votre signature.</p>
            )}
            {uploadPreview && (
              <button
                type="button"
                onClick={() => {
                  setUploadPreview(null);
                  if (selectedField) {
                    setSignatureData(prev => {
                      const copy = { ...prev };
                      delete copy[selectedField.id];
                      return copy;
                    });
                  }
                }}
                className="px-3 py-1 rounded bg-gray-200 text-gray-800"
              >
                Effacer
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded bg-gray-200">
            Annuler
          </button>
          <button onClick={handleModalConfirm} className="px-4 py-2 rounded bg-green-600 text-white">
            Valider
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default DocumentSign;
