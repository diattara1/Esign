// DocumentSign.js — version responsive avec navbar dynamique (bouton "Signer")
// - Page et PDF 100% responsives (aligné sur le comportement SelfSign)
// - Navbar sticky avec bouton Signer dynamique (état, OTP, loading)
// - Sidebar devient un drawer sur mobile

import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import useIsMobile from '../hooks/useIsMobile';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Document, Page } from 'react-pdf';
import signatureService from '../services/signatureService';
import { api } from '../services/apiUtils';
import SignatureModal from '../components/SignatureModal';
import { fileToPngDataURL, blobToPngDataURL, savedSignatureImageUrl, fetchSavedSignatureAsDataURL } from '../utils/signatureUtils';
import logService from '../services/logService';
import sanitize from '../utils/sanitize';
import { FiMenu, FiX, FiShield, FiCheckCircle, FiAlertCircle, FiFileText } from 'react-icons/fi';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

const MAX_OTP_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 30;

export default function DocumentSign() {
  const { publicId: id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isGuest = Boolean(token);
  const navigate = useNavigate();

  // ---------------------------- Responsive state ----------------------------
  const isMobile = useIsMobile(1024);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const toggleSidebar = () => setSidebarOpen((o) => !o);

  useEffect(() => {
    if (!isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = sidebarOpen ? 'hidden' : prev || '';
    return () => { document.body.style.overflow = prev; };
  }, [isMobile, sidebarOpen]);

  // Mesure largeur viewer pour l'échelle PDF
  const viewerRef = useRef(null);
  const [viewerWidth, setViewerWidth] = useState(0);
  const recomputeWidth = () => setViewerWidth(viewerRef.current?.getBoundingClientRect().width || 0);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(recomputeWidth);
    if (viewerRef.current) ro.observe(viewerRef.current);
    recomputeWidth();
    window.addEventListener('resize', recomputeWidth);
    return () => { ro.disconnect(); window.removeEventListener('resize', recomputeWidth); };
  }, []);

  // ------------------------------ Données API ------------------------------
  const [loading, setLoading] = useState(true);
  const [envelope, setEnvelope] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // PDF pages
  const [numPages, setNumPages] = useState(0);
  const [pageDims, setPageDims] = useState({}); // {n:{width,height}}

  // État signature globale
  const [isAlreadySigned, setIsAlreadySigned] = useState(false);
  const [signing, setSigning] = useState(false);

  // OTP invité
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(MAX_OTP_ATTEMPTS);
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const [otpStatus, setOtpStatus] = useState('');

  useEffect(() => {
    if (!cooldownUntil) return;
    const t = setInterval(() => {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownUntil(null); setOtpAttempts(MAX_OTP_ATTEMPTS); setOtpStatus('');
      } else setOtpStatus(`Réessayez dans ${remaining}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  // Signatures locales par champ
  const [signatureData, setSignatureData] = useState({}); // {fieldId: dataURL}
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [savedSelectedIds, setSavedSelectedIds] = useState({});

  // Helpers URL absolue + PDF invité
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

  // ------------------------------- Chargement ------------------------------
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
          if (already) { setIsAlreadySigned(true); setOtpVerified(true); }
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
          setOtpVerified(true);
        }
      } catch (err) {
        logService.error(err); toast.error(err?.response?.data?.error || 'Impossible de charger la page de signature'); navigate('/');
      } finally { setLoading(false); }
    };
    init();
  }, [id, token, isGuest, navigate]);

  useEffect(() => { if (!isGuest) signatureService.listSavedSignatures().then(setSavedSignatures).catch(()=>{}); }, [isGuest]);

  const prevUrlRef = useRef(null);
  useEffect(() => {
    const prev = prevUrlRef.current; prevUrlRef.current = pdfUrl;
    return () => { try { if (prev && typeof prev === 'string' && prev.startsWith('blob:')) URL.revokeObjectURL(prev); } catch {} };
  }, [pdfUrl]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setNumPages(0); setPageDims({});
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
        if (!alive) return; setPdfUrl(blobUrl);
      } catch (e) {
        if (!alive) return; logService.error('Erreur chargement doc:', e); toast.error(`Impossible de charger ce PDF: ${e.message}`);
      }
    };
    load();
    return () => { alive = false; };
  }, [selectedDoc, otpVerified, envelope, id, token, isGuest]);

  // ------------------------------- OTP actions -----------------------------
  const handleSendOtp = async () => {
    if (isAlreadySigned) return toast.info('Déjà signé');
    setSendingOtp(true);
    try { await signatureService.sendOtp(id, token); setOtpSent(true); toast.success('Code OTP envoyé'); }
    catch (e) { logService.error(e); toast.error(e?.response?.data?.error || 'Erreur envoi OTP'); }
    finally { setSendingOtp(false); }
  };
  const handleVerifyOtp = async () => {
    if (cooldownUntil && cooldownUntil > Date.now()) return;
    setVerifyingOtp(true);
    try {
      await signatureService.verifyOtp(id, otp, token);
      setOtpVerified(true); setOtpError(''); setOtpStatus(''); setOtpAttempts(MAX_OTP_ATTEMPTS); setCooldownUntil(null); toast.success('OTP vérifié');
      await new Promise(r => setTimeout(r, 400));
      try {
        let blobUrl;
        if (selectedDoc?.id) {
          const fallback = envelope?.document_url || signatureService.getDecryptedDocumentUrl(id, token);
          blobUrl = await loadGuestPdfForDoc(selectedDoc.id, fallback);
        } else {
          const fallbackUrl = signatureService.getDecryptedDocumentUrl(id, token);
          blobUrl = await fetchPdfBlobWithToken(fallbackUrl);
        }
        if (blobUrl) setPdfUrl(blobUrl);
      } catch (pdfError) { logService.error('Erreur rechargement PDF:', pdfError); toast.error('PDF vérifié mais erreur de chargement. Rafraîchissez.'); }
    } catch (e) {
      logService.error(e);
      const msg = e?.response?.data?.error || 'OTP invalide';
      setOtpError(msg); const remaining = otpAttempts - 1; setOtpAttempts(remaining);
      if (remaining <= 0) { setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000); setOtpStatus(`Trop d\'échecs. Réessayez dans ${COOLDOWN_SECONDS}s`); }
      else setOtpStatus(`Il reste ${remaining} tentative(s).`);
      toast.error(msg);
    } finally { setVerifyingOtp(false); }
  };

  // ----------------------------- PDF callbacks -----------------------------
  const onDocumentLoad = ({ numPages }) => {
    setNumPages(numPages);
    recomputeWidth();
  };
  const onPageLoadSuccess = (num, page) => {
    const vp = page.getViewport({ scale: 1 });
    setPageDims((d) => (d[num]?.width === vp.width && d[num]?.height === vp.height ? d : { ...d, [num]: { width: vp.width, height: vp.height } }));
    recomputeWidth();
  };

  // Champs du doc courant
  const currentFields = useMemo(() => (envelope?.fields || []).filter(f => (selectedDoc ? f.document_id === selectedDoc.id : !f.document_id)), [envelope, selectedDoc]);

  // ---------------------------- Modal signature ----------------------------
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

  // --------------------------- Bouton signer (API) --------------------------
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

  const OtpActions = ({ variant = 'inline' }) => {
    if (!isGuest || isAlreadySigned || otpVerified) return null;

    const inCooldown = Boolean(cooldownUntil && cooldownUntil > Date.now());
    const showInputArea = variant === 'inline' || otpSent;
    const errorId = otpError ? `otp-error-${variant}` : undefined;
    const statusId = otpStatus ? `otp-status-${variant}` : undefined;
    const describedBy = [errorId, statusId].filter(Boolean).join(' ') || undefined;

    const sendButton = (
      <button
        type="button"
        onClick={handleSendOtp}
        disabled={sendingOtp}
        className={`w-full ${variant === 'inline' ? 'sm:w-auto' : ''} bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50`}
      >
        {sendingOtp ? 'Envoi…' : otpSent ? 'Renvoyer OTP' : 'Envoyer OTP'}
      </button>
    );

    const inputField = showInputArea ? (
      <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        value={otp}
        onChange={(e) => setOtp(e.target.value)}
        placeholder="Code OTP"
        className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
        disabled={inCooldown}
        aria-describedby={describedBy}
      />
    ) : null;

    const statusBlock = (otpError || otpStatus) ? (
      <div role="status" aria-live="polite" className={`text-sm ${variant === 'inline' ? 'mt-2 text-center sm:text-left' : ''}`}>
        {otpError && <p id={errorId} className="text-red-600">{otpError}</p>}
        {otpStatus && <p id={statusId} className="text-gray-600">{otpStatus}</p>}
      </div>
    ) : null;

    const verifyButton = showInputArea ? (
      <button
        type="button"
        onClick={handleVerifyOtp}
        disabled={verifyingOtp || inCooldown || !otpSent}
        className={`w-full ${variant === 'inline' ? 'sm:w-auto' : ''} bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50`}
      >
        {verifyingOtp ? 'Vérification…' : 'Vérifier'}
      </button>
    ) : null;

    if (variant === 'sidebar') {
      return (
        <div className="space-y-3">
          {sendButton}
          {showInputArea && (
            <>
              {inputField}
              {statusBlock}
              {verifyButton}
            </>
          )}
          {!showInputArea && statusBlock}
        </div>
      );
    }

    return (
      <div className="bg-white border border-blue-100 rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex flex-col items-center text-gray-700 gap-3">
          <FiShield className="w-8 h-8 text-blue-600" />
          <div className="space-y-1 text-center">
            <p className="text-lg font-semibold text-gray-900">Ce document est protégé</p>
            <p className="text-sm text-gray-600">Envoyez-vous un code OTP puis saisissez-le pour afficher le PDF.</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:self-stretch sm:flex-shrink-0">
            {sendButton}
          </div>
          <div className="flex-1 w-full">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="flex-1">
                {inputField}
                {statusBlock}
              </div>
              {verifyButton}
            </div>
          </div>
        </div>
     
      </div>
    );
  };

  const showInlineOtp = isGuest && !isAlreadySigned && !otpVerified;
const navOffset = isGuest ? 'top-0' : 'top-16';
  // ----------------------------- PDF RENDERER ------------------------------
  const renderPdfViewer = () => {
    if (showInlineOtp) {
      return (
        <div className="flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-xl">
            <OtpActions variant="inline" />
          </div>
        </div>
      );
    }

    if (!pdfUrl) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-gray-600">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
          Chargement du document…
        </div>
      );
    }

    return (
      <div className="relative min-h-[200px]">
        {!numPages && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
            Chargement du document…
          </div>
        )}
        <Document
          key={String(pdfUrl || 'empty')}
          file={pdfUrl}
          onLoadSuccess={onDocumentLoad}
          loading={null}
          error={<div className="text-center text-red-600 p-8">Erreur de chargement PDF.</div>}
        >
          {numPages > 0 && Array.from({ length: numPages }, (_, i) => {
            const n = i + 1;
            const padding = isMobile ? 24 : 48; // SelfSign-like
            const pageMaxWidth = Math.max(0, Math.min(viewerWidth - padding, 900));
            const s = pageMaxWidth / (pageDims[n]?.width || 1);
            const fields = currentFields.filter((f) => f.page === n);

            return (
              <div key={n} className="relative mb-6">
                <div className="relative" style={{ width: '100%', maxWidth: pageMaxWidth, margin: '0 auto' }}>
                  <Page
                    pageNumber={n}
                    width={pageMaxWidth}
                    renderTextLayer={false}
                    renderAnnotationLayer={false}
                    onLoadSuccess={(p) => onPageLoadSuccess(n, p)}
                    className="border border-gray-200 rounded-lg shadow-sm"
                  />
                  {/* Overlay centré pour les champs */}
                  {pageDims[n] && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: pageMaxWidth, height: pageDims[n].height * s }}>
                      {fields.map((field) => (
                        <button
                          key={field.id}
                          onClick={field.editable ? () => openFieldModal(field) : undefined}
                          title={field.editable ? 'Cliquer pour signer' : 'Champ non éditable'}
                          className={`absolute flex items-center justify-center text-[11px] font-semibold border-2 rounded ${field.signed ? 'border-green-500 bg-green-100' : 'border-red-500 bg-red-100 hover:bg-red-200'} ${field.editable ? 'focus:outline-none focus:ring-2 focus:ring-blue-500' : ''}`}
                          style={{
                            top: field.position.y * pageDims[n].height * s,
                            left: field.position.x * pageDims[n].width * s,
                            width: field.position.width * pageDims[n].width * s,
                            height: field.position.height * pageDims[n].height * s,
                          }}
                        >
                          {field.signed ? (
                            (() => {
                              const raw = field.signature_data; const match = raw?.match(/data:image\/[\w.+-]+;base64,[^\"']+/);
                              const src = match ? match[0] : '';
                              return src ? <img src={src} alt="signature" className="max-w-full max-h-full object-contain" /> : 'Signé';
                            })()
                          ) : 'Signer'}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="absolute bottom-2 right-2 bg-gray-900/75 text-white text-xs px-2 py-1 rounded">Page {n}/{numPages}</div>
                </div>
              </div>
            );
          })}
        </Document>
      </div>
    );
  };

  // ------------------------------- NAVBAR UI -------------------------------
  const Navbar = () => (
    <div className={`sticky ${navOffset} lg:top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200`}>
      <div className="px-3 md:px-6 py-3 flex flex-wrap items-center gap-3 md:gap-4">
        {/* Branding invité */}
        {isGuest && (
          <Link
            to="/"
            className="flex items-center gap-2 pr-1 text-gray-900 hover:text-blue-600 transition-colors flex-shrink-0"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-sm">
              <FiFileText className="w-5 h-5" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              INTELISign+
            </span>
              <span className="hidden sm:block text-[11px] uppercase tracking-wide text-gray-500">Accueil public</span>
            </span>
          </Link>
        )}

        {/* Mobile: burger */}
        <button
          onClick={toggleSidebar}
          className="lg:hidden p-2 rounded border border-gray-200 active:scale-95 flex-shrink-0"
          aria-label={sidebarOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
        >
          {sidebarOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
        </button>

        {/* Titre & sélecteur de document */}
        <div className="flex-1 min-w-0">
          <div className="text-base md:text-lg font-semibold text-gray-900 truncate">{isAlreadySigned ? 'Document déjà signé :' : 'Signer le document :'} {sanitize(envelope?.title)}</div>
          {documents.length > 1 && (
            <div className="mt-1">
              <select
                className="text-sm border rounded px-2 py-1"
                value={selectedDoc?.id || ''}
                onChange={(e) => {
                  const d = documents.find(x => String(x.id) === String(e.target.value));
                  if (d && d.id !== selectedDoc?.id) setSelectedDoc(d);
                }}
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>{d.name || `Document ${d.id}`}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* État OTP invité */}
        {isGuest && !isAlreadySigned && (
          <div className="hidden md:flex items-center gap-2 mr-2">
            <FiShield className={otpVerified ? 'text-green-600' : 'text-gray-400'} />
            <span className="text-sm text-gray-700">{otpVerified ? 'OTP vérifié' : (otpSent ? 'OTP envoyé' : 'OTP requis')}</span>
          </div>
        )}

      
      </div>
    </div>
  );

  // ------------------------------- SIDEBAR UI ------------------------------
  const Sidebar = () => (
    <div className="h-full flex flex-col">
      <div className="p-4 md:p-6 border-b border-gray-200">
        <div className="font-semibold text-gray-800 mb-2">Documents</div>
        {documents.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun</div>
        ) : (
          <ul className="space-y-1">
            {documents.map(doc => (
              <li key={doc.id}>
                <button
                  className={`w-full text-left px-2 py-1 rounded ${selectedDoc?.id === doc.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                  onClick={() => { if (selectedDoc?.id !== doc.id) setSelectedDoc(doc); if (isMobile) setSidebarOpen(false); }}
                >
                  {doc.name || `Document ${doc.id}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* OTP panneau (secondaire, la navbar gère l'action principale) */}
      {isGuest && !isAlreadySigned && !showInlineOtp && (
        <div className="p-4 md:p-6">
          <OtpActions variant="sidebar" />
        </div>
      )}
    </div>
  );

  if (loading) return <div className="p-6 text-center">Chargement…</div>;
  if (!envelope) return <div className="p-6 text-center text-red-600">Document introuvable.</div>;

  return (
    <div className="h-screen flex flex-col">
      {/* NAVBAR sticky */}
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        {/* Drawer / Sidebar */}
        {isMobile && (
          <div className={`fixed inset-0 top-16 z-40 ${sidebarOpen ? '' : 'pointer-events-none'}`}>
            <div className={`absolute inset-0 bg-black/50 transition-opacity ${sidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setSidebarOpen(false)} />
            <aside className={`absolute inset-y-0 left-0 w-full max-w-sm bg-white border-r shadow-xl transform transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
               <div className="flex justify-end p-4 border-b">
                <button onClick={() => setSidebarOpen(false)} aria-label="Fermer le menu">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <Sidebar />
            </aside>
          </div>
        )}
        {!isMobile && (
          <aside className="w-80 max-w-xs bg-white border-r overflow-auto"><Sidebar /></aside>
        )}

        {/* Viewer */}
        <main className="flex-1 overflow-auto bg-gray-100" ref={viewerRef} style={{ scrollbarGutter: 'stable both-edges' }}>
          <div className="p-3 md:p-6">
            {renderPdfViewer()}
            {!isAlreadySigned && ((!isGuest) || otpVerified) && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleSign}
                  disabled={!canSign() || signing}
                  className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-semibold rounded shadow disabled:opacity-50"
                >
                  {signing ? 'Signature…' : 'Signer'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* MODAL Signature */}
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
