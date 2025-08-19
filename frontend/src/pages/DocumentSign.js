// src/pages/DocumentSign.js
// Signature multi-docs, PDF stable (pas de zoom), invité/auth OK,
// modal au-dessus de tout, et deux modes: "dessiner" et "importer".
// MISE À JOUR: Redirection selon le type d'utilisateur

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Document, Page, pdfjs } from 'react-pdf';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils'; // ✅ axios (baseURL)
import SignaturePadComponent from '../components/SignaturePadComponent';
import Modal from 'react-modal';
import Countdown from '../components/Countdown';

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
  const [expired, setExpired] = useState(false);
  const [savedSelectedId, setSavedSelectedId] = useState(null);
  // viewer stable (évite le zoom/rétrécissement)
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
  const [savedSignatures, setSavedSignatures] = useState([]);

  // --- helpers invités (auth par header token) ---
  const toAbsolute = (url) => {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/${url.replace(/^\//, '')}`;
  };

  const fetchPdfBlobWithToken = async (url) => {
    const headers = token ? { 'X-Signature-Token': token } : {};
    const abs = toAbsolute(url);
    const res = await api.get(abs, { responseType: 'blob', headers });
    const blob = res?.data;
    if (!blob || !(blob instanceof Blob) || blob.size === 0) {
      throw new Error('Fichier PDF vide ou invalide');
    }
    return URL.createObjectURL(blob);
  };

  const loadGuestPdfForDoc = async (docId, fallbackUrl) => {
    const docSpecificUrl = signatureService.getDecryptedDocumentUrl(id, token);
    try {
      return await fetchPdfBlobWithToken(docSpecificUrl);
    } catch (e1) {
      if (!fallbackUrl) throw e1;
      try {
        return await fetchPdfBlobWithToken(fallbackUrl);
      } catch (e2) {
        throw new Error(`Impossible de charger le PDF: ${e1.message}`);
      }
    }
  };

  // INIT (charge l'enveloppe et choisit le 1er document)
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

          if (already) {
            const url = signatureService.getDecryptedDocumentUrl(id, token);
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
  }, [id, token, isGuest, navigate]);

  // Load saved signatures for authenticated users
  useEffect(() => {
    if (isGuest) return;
    signatureService
      .listSavedSignatures()
      .then(setSavedSignatures)
      .catch(() => {});
  }, [isGuest]);

  // Révocation différée de l'URL blob
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
  }, [pdfUrl]);

  // Changement de document → charger le nouveau PDF
  useEffect(() => {
    let alive = true;

    const load = async () => {
      setNumPages(0);
      setPageDimensions({});

      if (!selectedDoc) return;

      try {
        let blobUrl;
        if (isGuest) {
          if (!otpVerified) return;
          const fallback = envelope?.document_url ||
            signatureService.getDecryptedDocumentUrl(id, token);
          blobUrl = await loadGuestPdfForDoc(selectedDoc.id, fallback);
        } else {
          blobUrl = await signatureService.fetchDocumentBlob(id, selectedDoc.id);
        }

        if (!alive) return;
        setPdfUrl(blobUrl);
      } catch (e) {
        if (!alive) return;
        console.error('Erreur lors du chargement du document:', e);
        toast.error(`Impossible de charger ce PDF: ${e.message}`);
      }
    };

    load();
    return () => { alive = false; };
  }, [selectedDoc, otpVerified, envelope, id, token, isGuest]);

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

      await new Promise(resolve => setTimeout(resolve, 400));

      try {
        let blobUrl;
        if (selectedDoc?.id) {
          const fallback = envelope?.document_url ||
            signatureService.getDecryptedDocumentUrl(id, token);
          blobUrl = await loadGuestPdfForDoc(selectedDoc.id, fallback);
        } else {
          const fallbackUrl = signatureService.getDecryptedDocumentUrl(id, token);
          blobUrl = await fetchPdfBlobWithToken(fallbackUrl);
        }
        if (blobUrl) setPdfUrl(blobUrl);
      } catch (pdfError) {
        console.error('Erreur lors du rechargement du PDF:', pdfError);
        toast.error('PDF vérifié mais erreur de chargement. Veuillez rafraîchir la page.');
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

  // PDF callbacks
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
  setMode('draw');
  setUploadPreview(signatureData[field.id] || null);
  setSavedSelectedId(null); // <—
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

  // Utilitaire: dataURL -> base64 pur
  const toBase64 = (val) => {
    if (typeof val !== 'string') return '';
    const m = val.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    return m ? m[2] : val;
  };

  const normalizeAllSignatures = (sigMap) =>
    Object.fromEntries(
      Object.entries(sigMap || {}).map(([k, v]) => [k, toBase64(v)])
    );

  // 🔥 MODIFICATION PRINCIPALE : Redirection selon le type d'utilisateur
  const handleSign = async () => {
    if (signing) return;
    if (!canSign()) return toast.error('Veuillez compléter toutes vos signatures');
    setSigning(true);
    try {
      const signedFields = envelope.fields.reduce((acc, f) => {
        acc[f.id] = { ...f, signed: f.signed };
        return acc;
      }, {});
      const normalizedSigData = normalizeAllSignatures(signatureData);
      await signatureService.sign(
        id,
        { signature_data: normalizedSigData, signed_fields: signedFields },
        isGuest ? token : undefined
      );
      
      toast.success('Document signé');
      
      // 🎯 Redirection selon le type d'utilisateur
      if (isGuest) {
        // Pour les invités : redirection vers la page de confirmation invité avec token
        navigate(`/signature/guest/success?id=${id}&token=${token}`, { 
          state: { id, token } 
        });
      } else {
        // Pour les utilisateurs connectés : redirection vers la page de confirmation standard
        navigate('/signature/success', { 
          state: { id } 
        });
      }
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

  const renderPdfViewer = () => {
    const canShowPdf = ((!isGuest) || otpVerified) && pdfUrl;

    if (!canShowPdf) {
      if (isGuest && !otpVerified) {
        return (
          <div className="text-center text-gray-600 p-8">
            <p className="text-lg mb-4">📄 PDF protégé</p>
            <p>Veuillez d'abord vérifier votre code OTP pour accéder au document.</p>
          </div>
        );
      } else {
        return (
          <div className="text-center text-gray-600 p-8">
            <p className="text-lg mb-4">⏳ Chargement du document...</p>
            <p>Veuillez patienter pendant le chargement du PDF.</p>
          </div>
        );
      }
    }

    return (
      <Document
        key={String(pdfUrl || 'empty')}
        file={pdfUrl}
        onLoadSuccess={onDocumentLoad}
        onLoadError={onDocumentError}
        loading={
          <div className="text-center p-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Chargement PDF…</p>
          </div>
        }
        error={
          <div className="text-center text-red-600 p-8">
            <p className="text-lg mb-4">❌ Erreur de chargement</p>
            <p className="mb-4">Impossible de charger le document PDF.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Recharger la page
            </button>
          </div>
        }
      >
        {numPages > 0 && Array.from({ length: numPages }, (_, i) => (
          <div key={i} className="relative mb-4">
            <Page
              pageNumber={i + 1}
              width={viewerWidth || 600}
              onLoadSuccess={page => onPageLoadSuccess(i + 1, page)}
              renderTextLayer={false}
              loading={<div className="h-96 bg-gray-100 animate-pulse rounded"></div>}
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
    );
  };

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
                      setSelectedDoc(doc);
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
        {renderPdfViewer()}
      </div>

      {/* MODAL — seulement "Dessiner" et "Importer" */}
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
          {!isGuest && savedSignatures.length > 0 && (
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'saved'}
                onChange={() => setMode('saved')}
              />
              <span>Mes signatures</span>
            </label>
          )}
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
        ) : mode === 'upload' ? (
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
        ) : (
         <div className="grid grid-cols-2 gap-2 max-h-64 overflow-auto">
  {savedSignatures.map(sig => (
    <div
      key={sig.id}
      className={`relative border p-1 cursor-pointer flex items-center justify-center rounded
        ${savedSelectedId === sig.id
          ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50'
          : 'hover:bg-gray-50'}`}
      onClick={() => {
        if (!selectedField) return;
        const url = sig.data_url || toAbsolute(sig.image_url);
        setSignatureData(prev => ({ ...prev, [selectedField.id]: url }));
        setUploadPreview(url);
        setSavedSelectedId(sig.id); // <— mémorise la sélection
      }}
      aria-selected={savedSelectedId === sig.id}
    >
      <img
        src={sig.data_url || toAbsolute(sig.image_url)}
        alt="saved"
        className="max-h-20"
      />
      {savedSelectedId === sig.id && (
        <span className="absolute top-1 right-1 text-[10px] px-1 rounded bg-blue-600 text-white">
          Choisie
        </span>
      )}
    </div>
  ))}
  {savedSignatures.length === 0 && <p>Aucune signature enregistrée.</p>}
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