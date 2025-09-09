import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
import SignatureModal from '../components/SignatureModal';
import logService from '../services/logService';
import useResponsive from '../hooks/useResponsive';
import useOtp from '../hooks/useOtp';
import usePdfViewer from '../hooks/usePdfViewer';
import SignNavbar from '../components/SignNavbar';
import SignSidebar from '../components/SignSidebar';
import PdfViewer from '../components/PdfViewer';

export default function DocumentSign() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isGuest = Boolean(token);
  const navigate = useNavigate();

  const { isMobile, sidebarOpen, toggleSidebar, setSidebarOpen } = useResponsive();
  const { viewerRef, viewerWidth, numPages, pageDims, onDocumentLoad, onPageLoadSuccess, reset } = usePdfViewer();

  const [loading, setLoading] = useState(true);
  const [envelope, setEnvelope] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  const [isAlreadySigned, setIsAlreadySigned] = useState(false);
  const { otp, setOtp, otpSent, otpVerified, sendingOtp, verifyingOtp, otpError, otpStatus, cooldownUntil, handleSendOtp, handleVerifyOtp } = useOtp(id, token, isAlreadySigned);

  const [signing, setSigning] = useState(false);
  const [signatureData, setSignatureData] = useState({});
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [savedSelectedIds, setSavedSelectedIds] = useState({});

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
    if (!blob || !(blob instanceof Blob) || blob.size === 0) throw new Error('Fichier PDF vide ou invalide');
    return URL.createObjectURL(blob);
  };

  const loadGuestPdfForDoc = async (docId, fallbackUrl) => {
    const docSpecificUrl = signatureService.getDecryptedDocumentUrl(id, token);
    try { return await fetchPdfBlobWithToken(docSpecificUrl); }
    catch (e1) {
      if (!fallbackUrl) throw e1;
      try { return await fetchPdfBlobWithToken(fallbackUrl); }
      catch (e2) { throw new Error(`Impossible de charger le PDF: ${e1.message}`); }
    }
  };

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
          if (already) { setIsAlreadySigned(true); }
          if (data.documents?.length) setSelectedDoc(data.documents[0]);
          if (already) {
            const url = signatureService.getDecryptedDocumentUrl(id, token);
            try { setPdfUrl(await fetchPdfBlobWithToken(url)); } catch (e) { toast.error(`Impossible de charger le PDF : ${e.message}`); }
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
            try { setPdfUrl(await signatureService.fetchDocumentBlob(id, first.id)); }
            catch { toast.error('Impossible de charger le PDF'); }
          } else {
            const { download_url } = await signatureService.downloadEnvelope(id);
            setPdfUrl(download_url);
          }
        }
      } catch (err) {
        logService.error(err);
        toast.error(err?.response?.data?.error || 'Impossible de charger la page de signature');
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, token, isGuest, navigate]);

  useEffect(() => {
    if (!isGuest) signatureService.listSavedSignatures().then(setSavedSignatures).catch(() => {});
  }, [isGuest]);

  const prevUrlRef = useRef(null);
  useEffect(() => {
    const prev = prevUrlRef.current; prevUrlRef.current = pdfUrl;
    return () => { try { if (prev && typeof prev === 'string' && prev.startsWith('blob:')) URL.revokeObjectURL(prev); } catch {} };
  }, [pdfUrl]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      reset();
      if (!selectedDoc) return;
      try {
        let blobUrl;
        if (isGuest) {
          if (!otpVerified) return;
          const fallback = envelope?.document_url || signatureService.getDecryptedDocumentUrl(id, token);
          blobUrl = await loadGuestPdfForDoc(selectedDoc.id, fallback);
        } else {
          blobUrl = await signatureService.fetchDocumentBlob(id, selectedDoc.id);
        }
        if (!alive) return;
        setPdfUrl(blobUrl);
      } catch (e) {
        if (!alive) return;
        logService.error('Erreur chargement doc:', e);
        toast.error(`Impossible de charger ce PDF: ${e.message}`);
      }
    };
    load();
    return () => { alive = false; };
  }, [selectedDoc, otpVerified, envelope, id, token, isGuest, reset]);

  const currentFields = useMemo(() => (envelope?.fields || []).filter(f => (selectedDoc ? f.document_id === selectedDoc.id : !f.document_id)), [envelope, selectedDoc]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedField, setSelectedField] = useState(null);

  const openFieldModal = (field) => {
    if (isAlreadySigned) return toast.info('Document déjà signé');
    if (!field.editable) return toast.info('Champ non éditable');
    setSelectedField(field);
    setModalOpen(true);
  };
  const closeModal = () => setModalOpen(false);
  const handleModalConfirm = (dataUrl, savedId) => {
    if (!selectedField || !dataUrl) return toast.error('Veuillez fournir une signature');
    setSignatureData((p) => ({ ...p, [selectedField.id]: dataUrl }));
    if (savedId) setSavedSelectedIds((p) => ({ ...p, [selectedField.id]: savedId }));
    setEnvelope((e) => ({
      ...e,
      fields: e.fields.map((f) => (f.id === selectedField.id ? { ...f, signed: true, signature_data: dataUrl } : f))
    }));
    toast.success('Signature ajoutée');
    closeModal();
  };

  const toBase64 = (val) => { if (typeof val !== 'string') return ''; const m = val.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/); return m ? m[2] : val; };
  const normalizeAllSignatures = (sigMap) => Object.fromEntries(Object.entries(sigMap || {}).map(([k, v]) => [k, toBase64(v)]));
  const canSign = () => {
    if (!envelope || isAlreadySigned) return false;
    return (envelope.fields || []).filter(f => f.editable).every(f => f.signed);
  };
  const handleSign = async () => {
    if (signing) return; if (!canSign()) return toast.error('Veuillez compléter toutes vos signatures');
    setSigning(true);
    try {
      const signedFields = envelope.fields.reduce((acc, f) => { acc[f.id] = { ...f, signed: f.signed }; return acc; }, {});
      const normalizedSigData = normalizeAllSignatures(signatureData);
      await signatureService.sign(id, { signature_data: normalizedSigData, signed_fields: signedFields }, isGuest ? token : undefined);
      toast.success('Document signé');
      if (isGuest) navigate(`/signature/guest/success?id=${id}&token=${token}`, { state: { id, token } });
      else navigate('/signature/success', { state: { id } });
    } catch (e) { logService.error(e); toast.error(e?.response?.data?.error || 'Erreur lors de la signature'); }
    finally { setSigning(false); }
  };

  const handleSelectDoc = (doc) => {
    if (selectedDoc?.id !== doc.id) setSelectedDoc(doc);
    if (isMobile) setSidebarOpen(false);
  };

  if (loading) return <div className="p-6 text-center">Chargement…</div>;
  if (!envelope) return <div className="p-6 text-center text-red-600">Document introuvable.</div>;

  return (
    <div className="h-screen flex flex-col">
      <SignNavbar
        sidebarOpen={sidebarOpen}
        toggleSidebar={toggleSidebar}
        documents={documents}
        selectedDoc={selectedDoc}
        setSelectedDoc={setSelectedDoc}
        isGuest={isGuest}
        isAlreadySigned={isAlreadySigned}
        otpSent={otpSent}
        otpVerified={otpVerified}
        sendingOtp={sendingOtp}
        verifyingOtp={verifyingOtp}
        cooldownUntil={cooldownUntil}
        handleSendOtp={handleSendOtp}
        handleVerifyOtp={handleVerifyOtp}
        canSign={canSign}
        handleSign={handleSign}
        signing={signing}
        envelope={envelope}
      />

      <div className="flex-1 flex overflow-hidden">
        {isMobile && (
          <div className={`fixed inset-0 z-40 ${sidebarOpen ? '' : 'pointer-events-none'}`}>
            <div className={`absolute inset-0 bg-black/50 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
            <aside className={`absolute inset-y-0 left-0 w-full max-w-sm bg-white border-r shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
              <SignSidebar
                documents={documents}
                selectedDoc={selectedDoc}
                onSelectDoc={handleSelectDoc}
                isGuest={isGuest}
                isAlreadySigned={isAlreadySigned}
                otp={otp}
                setOtp={setOtp}
                otpSent={otpSent}
                otpVerified={otpVerified}
                sendingOtp={sendingOtp}
                verifyingOtp={verifyingOtp}
                cooldownUntil={cooldownUntil}
                handleSendOtp={handleSendOtp}
                handleVerifyOtp={handleVerifyOtp}
                otpError={otpError}
                otpStatus={otpStatus}
              />
            </aside>
          </div>
        )}
        {!isMobile && (
          <aside className="w-80 max-w-xs bg-white border-r overflow-auto">
            <SignSidebar
              documents={documents}
              selectedDoc={selectedDoc}
              onSelectDoc={handleSelectDoc}
              isGuest={isGuest}
              isAlreadySigned={isAlreadySigned}
              otp={otp}
              setOtp={setOtp}
              otpSent={otpSent}
              otpVerified={otpVerified}
              sendingOtp={sendingOtp}
              verifyingOtp={verifyingOtp}
              cooldownUntil={cooldownUntil}
              handleSendOtp={handleSendOtp}
              handleVerifyOtp={handleVerifyOtp}
              otpError={otpError}
              otpStatus={otpStatus}
            />
          </aside>
        )}

        <main className="flex-1 overflow-auto bg-gray-100" ref={viewerRef} style={{ scrollbarGutter: 'stable both-edges' }}>
          <div className="p-3 md:p-6">
            <PdfViewer
              isGuest={isGuest}
              otpVerified={otpVerified}
              pdfUrl={pdfUrl}
              numPages={numPages}
              pageDims={pageDims}
              onDocumentLoad={onDocumentLoad}
              onPageLoadSuccess={onPageLoadSuccess}
              currentFields={currentFields}
              openFieldModal={openFieldModal}
              isMobile={isMobile}
              viewerWidth={viewerWidth}
            />
          </div>
        </main>
      </div>

      <SignatureModal
        isOpen={modalOpen}
        onClose={closeModal}
        onConfirm={handleModalConfirm}
        savedSignatures={isGuest ? [] : savedSignatures}
        initialDataUrl={selectedField ? signatureData[selectedField.id] : ''}
        initialSavedId={selectedField ? savedSelectedIds[selectedField.id] : null}
      />
    </div>
  );
}
