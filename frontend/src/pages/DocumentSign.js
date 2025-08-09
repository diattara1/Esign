// src/pages/DocumentSign.js
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Document, Page } from 'react-pdf';
import signatureService from '../services/signatureService';
import SignaturePadComponent from '../components/SignaturePadComponent';
import Modal from 'react-modal';

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const DocumentSign = () => {
  // 1) On ne prend plus token dans useParams() mais dans la query string
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isGuest = Boolean(token);
  
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [envelope, setEnvelope] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [iframeError, setIframeError] = useState(false);
  const [isAlreadySigned, setIsAlreadySigned] = useState(false);
  const [signing, setSigning] = useState(false);

  // OTP (guest)
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // PDF rendering
  const [numPages, setNumPages] = useState(0);
  const [pageDimensions, setPageDimensions] = useState({});
  const pdfWrapper = useRef();

  // Signature modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState(null);
  const [signatureData, setSignatureData] = useState({});
  const [mode, setMode] = useState('draw');

  // --- Chargement de l'enveloppe ---
  useEffect(() => {
    const init = async () => {
      try {
        let data;
        if (isGuest) {
          data = await signatureService.getGuestEnvelope(id, token);
          setEnvelope(data);
          // si déjà signé
          const me = data.fields.find(f => f.recipient_id === data.recipient_id);
          if (me?.signed) {
            setIsAlreadySigned(true);
            setOtpVerified(true);
            toast.info('Vous avez déjà signé ce document');
            await fetchPdfBlob(data.document_url);
          }
        } else {
          data = await signatureService.getAuthenticatedEnvelope(id);
          setEnvelope(data);
          const { download_url } = await signatureService.downloadEnvelope(id);
          setPdfUrl(download_url);
          setOtpVerified(true);
          // si déjà signé
          const mine = data.fields
            .filter(f => f.recipient_id === data.recipient_id)
            .every(f => f.signed);
          if (mine) setIsAlreadySigned(true);
        }
      } catch (err) {
        console.error('Erreur init :', err);
        toast.error(err.response?.data?.error || 'Impossible de charger la page de signature');
        navigate('/'); // redirige vers l'accueil public
        return;
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, token, isGuest, navigate]);

  // --- Chargement du PDF pour invités ---
  const fetchPdfBlob = async (url) => {
    try {
      const res = await fetch(url, {
        headers: { 'X-Signature-Token': token }
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const blob = await res.blob();
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('Erreur PDF :', err);
      setIframeError(true);
      toast.error(`Impossible de charger le PDF : ${err.message}`);
    }
  };

  // --- Handlers OTP invité ---
  const handleSendOtp = async () => {
    if (isAlreadySigned) return toast.info('Déjà signé');
    setSendingOtp(true);
    try {
      await signatureService.sendOtp(id, token);
      setOtpSent(true);
      toast.success('Code OTP envoyé');
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || 'Erreur envoi OTP');
    } finally {
      setSendingOtp(false);
    }
  };
  const handleVerifyOtp = async () => {
    setVerifyingOtp(true);
    try {
      await signatureService.verifyOtp(id, otp, token);
      setOtpVerified(true);
      toast.success('OTP vérifié');
      await fetchPdfBlob(envelope.document_url);
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.error || 'OTP invalide');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // --- Callbacks PDF ---
  const onDocumentLoad = ({ numPages }) => setNumPages(numPages);
  const onDocumentError = (err) => {
    console.error('PDF error:', err);
    setIframeError(true);
    toast.error('Erreur chargement PDF');
  };
  const onPageLoadSuccess = (num, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDimensions(d => ({ ...d, [num]: { width: vp.width, height: vp.height } }));
  };

  // --- Modal signature ---
  const openFieldModal = (field) => {
    if (isAlreadySigned) return toast.info('Document déjà signé');
    if (!field.editable) return toast.info('Champ non éditable');
    setSelectedField(field);
    setMode('draw');
    setModalOpen(true);
  };
  const handleModalConfirm = () => {
    const dataUrl = signatureData[selectedField.id];
    if (!dataUrl) return toast.error('Veuillez signer le champ');
    setEnvelope(e => ({
      ...e,
      fields: e.fields.map(f =>
        f.id === selectedField.id ? { ...f, signed: true, signature_data: dataUrl } : f
      )
    }));
    setModalOpen(false);
    toast.success('Signature ajoutée');
  };

  // --- Envoi final de la signature ---
  const canSign = () => {
    if (!envelope || isAlreadySigned) return false;
    return envelope.fields.filter(f => f.editable).every(f => f.signed);
  };
  const handleSign = async () => {
    if (signing) return;
    if (!canSign()) return toast.error('Veuillez compléter toutes les signatures');
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
      navigate('/signature/success');
    } catch (e) {
      console.error('Erreur signature :', e);
      toast.error(e.response?.data?.error || 'Erreur lors de la signature');
    } finally {
      setSigning(false);
    }
  };

  // --- Garde-fous pour éviter les crashs en render ---
  if (loading) {
    return <div className="p-6 text-center">Chargement…</div>;
  }
  if (!envelope) {
    return <div className="p-6 text-center text-red-600">Document introuvable.</div>;
  }

  // largeur du container PDF (peut être 0 au début)
  const wrapperWidth = pdfWrapper.current?.clientWidth || 0;

  return (
    <div className="flex h-screen">
      <div className="w-1/3 bg-white border-r p-6 overflow-auto">
        <h1 className="text-2xl font-bold mb-6">
          {isAlreadySigned ? 'Document déjà signé :' : 'Signer le document :'} {envelope.title}
        </h1>

        {/* Guest OTP */}
        {isGuest && !otpSent && !otpVerified && !isAlreadySigned && (
          <button
            onClick={handleSendOtp}
            disabled={sendingOtp}
            className="w-full bg-blue-500 text-white p-2 rounded mb-4 disabled:opacity-50"
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
            <button
              onClick={handleVerifyOtp}
              disabled={verifyingOtp}
              className="w-full bg-green-500 text-white p-2 rounded disabled:opacity-50"
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
                : 'bg-gray-400 text-gray-600 cursor-not-allowed'
            }`}
          >
            {signing ? 'Signature en cours…' : 'Signer le document'}
          </button>
        )}

        {isAlreadySigned && (
          <p className="text-green-600">Vous avez déjà signé ce document.</p>
        )}
      </div>

      <div className="flex-1 p-4 overflow-auto" ref={pdfWrapper}>
        {((!isGuest) || otpVerified) && pdfUrl && !iframeError ? (
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoad}
            onLoadError={onDocumentError}
            loading={<div>Chargement PDF…</div>}
          >
            {Array.from({ length: numPages }, (_, i) => (
              <div key={i} className="relative mb-4">
                <Page
                  pageNumber={i + 1}
                  width={wrapperWidth}
                  onLoadSuccess={page => onPageLoadSuccess(i + 1, page)}
                  renderTextLayer={false}
                />
                {envelope.fields
                  .filter(f => f.page === i + 1)
                  .map(field => (
                    <div
                      key={field.id}
                      onClick={field.editable ? () => openFieldModal(field) : undefined}
                      title={field.editable ? 'Cliquer pour signer' : 'Champ non éditable'}
                      className={`absolute flex items-center justify-center text-xs font-semibold border-2 ${
                        field.signed
                          ? 'border-green-500 bg-green-100'
                          : 'border-red-500 bg-red-100'
                      } ${field.editable ? 'cursor-pointer hover:bg-opacity-80' : ''}`}
                      style={{
                        top: field.position.y * (wrapperWidth / (pageDimensions[i + 1]?.width || 1)),
                        left: field.position.x * (wrapperWidth / (pageDimensions[i + 1]?.width || 1)),
                        width:
                          field.position.width * (wrapperWidth / (pageDimensions[i + 1]?.width || 1)),
                        height:
                          field.position.height * (wrapperWidth / (pageDimensions[i + 1]?.width || 1)),
                        zIndex: 10,
                      }}
                    >
                      {field.signed ? (() => {
  // 1) on récupère la chaîne brute
  const raw = field.signature_data;
  // 2) on extrait "data:image/..." jusqu'au prochain ' ou "
  const match = raw.match(/data:image\/[^'"]+/);
  // 3) si on a trouvé, c'est notre URL Base64, sinon chaîne vide
  const imgSrc = match ? match[0] : '';
  return (
    <img
      src={imgSrc}
      alt="Signature"
      className="w-full h-full object-contain"
    />
  );
})() : (
  <span className={field.editable ? 'text-black' : 'text-gray-500'}>
    {field.name}
  </span>
)}

                    </div>
                  ))}
              </div>
            ))}
          </Document>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-600">
            {!otpVerified && isGuest
              ? 'Veuillez vérifier votre OTP'
              : 'PDF non disponible'}
          </div>
        )}

        <Modal
          isOpen={modalOpen}
          onRequestClose={() => setModalOpen(false)}
          className="absolute bg-white p-6 mx-auto mt-20 max-w-lg rounded shadow-lg"
          overlayClassName="fixed inset-0 bg-black bg-opacity-50"
        >
          <h2 className="text-xl mb-4">Signer le champ</h2>
          <div className="flex mb-4">
            <button
              onClick={() => setMode('draw')}
              className={`flex-1 p-2 ${mode === 'draw' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Dessiner
            </button>
            <button
              onClick={() => setMode('upload')}
              className={`flex-1 p-2 ${mode === 'upload' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Uploader
            </button>
          </div>
          <div className="mb-4">
            {mode === 'draw' ? (
              <SignaturePadComponent
                canvasProps={{ width: 400, height: 150 }}
                onEnd={dataUrl =>
                  setSignatureData(d => ({ ...d, [selectedField.id]: dataUrl }))
                }
              />
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={e => {
                  const file = e.target.files[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = evt =>
                      setSignatureData(d => ({ ...d, [selectedField.id]: evt.target.result }));
                    reader.readAsDataURL(file);
                  }
                }}
              />
            )}
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setModalOpen(false)}
              className="mr-2 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Annuler
            </button>
            <button
              onClick={handleModalConfirm}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Valider
            </button>
          </div>
        </Modal>
      </div>
    </div>
  );
};

export default DocumentSign;
