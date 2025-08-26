import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import logService from '../services/logService';
import sanitize from '../utils/sanitize';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export default function DocumentWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [envelope, setEnvelope] = useState(null);
  const [flowType, setFlowType] = useState('sequential');
  const [reminderDays, setReminderDays] = useState(1);
  const [deadlineMode, setDeadlineMode] = useState('days'); // 'days' | 'exact'
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [deadlineExact, setDeadlineExact] = useState('');   // 'YYYY-MM-DDTHH:mm' (local)

  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);

  // largeur stable (on rend par width, pas par scale)
  const [pdfWidth, setPdfWidth] = useState(800);

  const [numPagesByDoc, setNumPagesByDoc] = useState({});
  // viewport (scale=1) par doc et par page
  const [pageDimensions, setPageDimensions] = useState({}); // { [docId]: { [page]: {width,height} } }

  const [recipients, setRecipients] = useState([
    { id: undefined, email: '', full_name: '', order: 1 }
  ]);
  const [fields, setFields] = useState([]); // champs posés
  const [placing, setPlacing] = useState({ idx: null, type: 'signature' });
  const [isUploading, setIsUploading] = useState(false);
const [includeQr, setIncludeQr] = useState(false);

  const pdfWrapper = useRef(null);
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

  // ---- Upload ----
  const uploadFiles = useCallback(async (files) => {
    try {
      setIsUploading(true);
      await signatureService.updateEnvelopeFiles(id, files);
      toast.success('Fichiers ajoutés');
      await reloadEnvelope(); // recharge tout
    } catch (e) {
      logService.error(e);
      toast.error("Échec de l'upload");
    } finally {
      setIsUploading(false);
    }
  }, [id]);

  // ---- Charger l'enveloppe et initialiser l'affichage ----
  const reloadEnvelope = useCallback(async () => {
    const env = await signatureService.getEnvelope(id);
    setEnvelope(env);
    setFlowType(env.flow_type || 'sequential');
    setReminderDays(env.reminder_days ?? 1);
    // Si une deadline existe déjà, on bascule l'UI en "date exacte"
    if (env.deadline_at) {
      setDeadlineMode('exact');
      const d = new Date(env.deadline_at);
      const pad = n => String(n).padStart(2, '0');
      const local = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDeadlineExact(local);
    } else {
      setDeadlineMode('days');
      setDeadlineExact('');
      setDeadlineDays(7);
    }

    const docs = env.documents || [];
    setDocuments(docs);

    // hydrate destinataires/champs existants
    if (env.recipients?.length) setRecipients(env.recipients);
    if (env.fields?.length) setFields(env.fields);

    if (docs.length > 0) {
      // auto-sélection du 1er doc
      const first = docs[0];
      setSelectedDocId(first.id);
      const blobUrl = await signatureService.fetchDocumentBlob(id, first.id);
      setPdfUrl(blobUrl);
    } else {
      // enveloppe "simple" (un seul PDF global)
      const res = await signatureService.downloadEnvelope(id);
      setSelectedDocId('single');            // IMPORTANT : une clé pour le viewer
      setPdfUrl(res.download_url);
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      try { await reloadEnvelope(); }
      catch { toast.error('Impossible de charger le dossier'); }
    })();
  }, [id, reloadEnvelope]);

  // ---- Largeur stable (anti tremblement) ----
  useEffect(() => {
    if (!pdfWrapper.current) return;

    let last = -1;
    let raf = 0;

    const compute = () => {
      const node = pdfWrapper.current;
      if (!node) return;
      const padding = 48; // ≈ p-6
      const container = node.clientWidth || 0;
      const next = Math.min(Math.max(container - padding, 320), 900);
      if (Math.abs(next - last) > 1) {
        last = next;
        setPdfWidth(next);
      }
    };

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    });

    ro.observe(pdfWrapper.current);
    compute();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  // ---- Callbacks PDF ----
  const onDocumentLoad = useCallback(({ numPages }) => {
    if (!selectedDocId) return;
    setNumPagesByDoc(prev =>
      prev[selectedDocId] === numPages ? prev : { ...prev, [selectedDocId]: numPages }
    );
  }, [selectedDocId]);

  const onPageLoadSuccess = useCallback((pageNumber, page) => {
    if (!selectedDocId) return;
    const vp = page.getViewport({ scale: 1 });
    setPageDimensions(prev => {
      const current = prev[selectedDocId]?.[pageNumber];
      if (current?.width === vp.width && current?.height === vp.height) return prev;
      return {
        ...prev,
        [selectedDocId]: {
          ...prev[selectedDocId],
          [pageNumber]: { width: vp.width, height: vp.height }
        }
      };
    });
  }, [selectedDocId]);

  const onDocumentError = useCallback((err) => {
    logService.error('PDF Error:', err);
    toast.error('Erreur lors du chargement du PDF');
  }, []);

  // ---- Sélection d'un document dans la colonne de droite ----
 // remplace ta fonction selectDocument par ceci
const selectDocument = useCallback(async (doc) => {
  if (selectedDocId === doc.id) return;

  let cancelled = false;
  try {
    // (optionnel) setLoadingDocId(doc.id);

    // 1) on télécharge d'abord le nouveau PDF
    const blobUrl = await signatureService.fetchDocumentBlob(id, doc.id);
    if (cancelled) return;

    // 2) swap atomique : on change l'id et l'URL en même temps
     setPdfUrl(blobUrl); // 1) d'abord l'URL du nouveau PDF
 setSelectedDocId(doc.id); // 2) puis l'ID (affichage, badges, etc.)
 setNumPagesByDoc(prev => ({ ...prev, [doc.id]: undefined }));
  } catch (e) {
    logService.error(e);
    toast.error('Impossible de charger ce PDF');
  } finally {
    // (optionnel) setLoadingDocId(null);
  }

  // cleanup si le composant est démonté pendant l'async
  return () => { cancelled = true; };
}, [selectedDocId, id]);


  // ---- Vérifier si un destinataire peut placer sa signature ----
  const canPlaceSignature = useCallback((recipientIdx) => {
    const recipient = recipients[recipientIdx];
    return recipient && recipient.email.trim() && recipient.full_name.trim();
  }, [recipients]);

  // ---- Placement : clic → coordonnées PDF (scale=1) ----
  const handlePdfClick = useCallback((e, pageNumber) => {
    if (placing.idx === null || !selectedDocId) return;

    const recipient = recipients[placing.idx];
    if (!canPlaceSignature(placing.idx)) {
      toast.error('Veuillez renseigner l\'email et le nom du destinataire avant de placer sa signature');
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const vp = pageDimensions[selectedDocId]?.[pageNumber] || { width: 600, height: 800 };
    const factor = pdfWidth / vp.width;

    const normalized = {
      x: x / factor,
      y: y / factor,
      width: 150 / factor,
      height: 50 / factor
    };

    // Supprimer l'ancienne signature de ce destinataire sur ce document s'il y en a une
    setFields(prev => prev.filter(field => 
      !(field.recipient_id === recipient.order && field.document_id === selectedDocId && field.field_type === 'signature')
    ));

    const safeName = sanitize(recipient.full_name);
    const newField = {
      recipient_id: recipient.order,
      document_id: selectedDocId,
      field_type: placing.type,
      page: pageNumber,
      position: normalized,
      name: `Signature ${safeName}`,
      required: true,
      recipient_name: safeName // Stocker le nom pour l'affichage
    };

    setFields(prev => [...prev, newField]);
    setPlacing({ idx: null, type: 'signature' });

    const docName = sanitize((documents.find(d => d.id === selectedDocId) || {}).name || `Document ${selectedDocId}`);
    toast.success(`Signature de ${safeName} placée sur ${docName} (page ${pageNumber})`);
  }, [placing.idx, placing.type, selectedDocId, pageDimensions, pdfWidth, recipients, documents, canPlaceSignature]);

  // ---- Fichiers ----
  const onFilesSelected = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    uploadFiles(files);
    e.target.value = '';
  }, [uploadFiles]);

  // ---- Destinataires ----
  const updateRecipient = useCallback((idx, field, value) => {
    setRecipients(prev => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      
      // Si on modifie le nom, mettre à jour les champs existants
      if (field === 'full_name') {
        setFields(prevFields => prevFields.map(fieldItem => {
          if (fieldItem.recipient_id === updated[idx].order) {
            return {
              ...fieldItem,
              name: `Signature ${value}`,
              recipient_name: value
            };
          }
          return fieldItem;
        }));
      }
      
      return updated;
    });
  }, []);

  const addRecipient = useCallback(() => {
    setRecipients(prev => [
      ...prev,
      { id: undefined, email: '', full_name: '', order: prev.length + 1 }
    ]);
  }, []);

  const removeRecipient = useCallback((idx) => {
    if (recipients.length <= 1) return;
    
    const recipientToRemove = recipients[idx];
    
    // Supprimer tous les champs associés à ce destinataire
    setFields(prev => prev.filter(field => field.recipient_id !== recipientToRemove.order));
    
    // Supprimer le destinataire
    setRecipients(prev => prev.filter((_, i) => i !== idx));
    
    // Annuler le placement si c'était ce destinataire qui était en cours de placement
    if (placing.idx === idx) {
      setPlacing({ idx: null, type: 'signature' });
    }
  }, [recipients, placing.idx]);

  // ---- Envoi ----
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
     // Construit payload avec échéance choisie
      const payload = {
        recipients,
        fields,
        flow_type: flowType,
        include_qr_code: includeQr,
        reminder_days: Number(reminderDays) || 1,
      };
      if (deadlineMode === 'exact' && deadlineExact) {
        // datetime-local -> ISO 8601
        payload.deadline_at = new Date(deadlineExact).toISOString();
      } else if (deadlineMode === 'days' && deadlineDays) {
        const d = new Date();
        d.setDate(d.getDate() + Number(deadlineDays));
        payload.deadline_at = d.toISOString();
      } else {
        payload.deadline_at = null; // pas d'échéance explicite -> géré par le backend si besoin
      }

      // 1) On sauvegarde l'enveloppe avec les nouveaux champs
      await signatureService.updateEnvelope(id, payload);
      // 2) Puis on envoie (le backend lit include_qr_code et utilisera deadline_at déjà posé)
      await signatureService.sendEnvelope(id, { include_qr_code: includeQr, reminder_days: payload.reminder_days, deadline_at: payload.deadline_at });

      
      toast.success('Enveloppe envoyée');
      navigate(`/signature/sent/${id}`);
    } catch (err) {
      logService.error(err);
      toast.error("Échec de l'envoi");
    }
  }, [id, recipients, fields, flowType, includeQr, reminderDays, deadlineMode, deadlineDays, deadlineExact, navigate]);


  // ---- Rendu visuel d'un champ posé ----
  const renderFieldBox = (field, pageNumber) => {
    if (field.page !== pageNumber || field.document_id !== selectedDocId) return null;

    const vp = pageDimensions[selectedDocId]?.[pageNumber] || { width: 600, height: 800 };
    const factor = pdfWidth / vp.width;

    const style = {
      left: field.position.x * factor,
      top: field.position.y * factor,
      width: field.position.width * factor,
      height: field.position.height * factor,
    };

    return (
      <div
        key={`${pageNumber}-${field.name}-${field.position.x}-${field.position.y}`}
        style={style}
        className="absolute rounded-lg shadow-md bg-white flex items-center justify-center z-10"
      >
        <div className="text-center text-xs leading-[1.1] text-gray-700">
          <div className="font-bold mb-0.5">Signature</div>
          <div>{field.recipient_name || field.name.replace('Signature ', '')}</div>
        </div>
      </div>
    );
  };

  // ---- Vérifier si un destinataire a déjà une signature sur le document sélectionné ----
  const hasSignatureOnCurrentDoc = useCallback((recipientOrder) => {
    return fields.some(field => 
      field.recipient_id === recipientOrder && 
      field.document_id === selectedDocId && 
      field.field_type === 'signature'
    );
  }, [fields, selectedDocId]);

  // ---- Rendu ----
  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar Gauche - Destinataires */}
      <div className="w-80 bg-white shadow-lg overflow-y-auto border-r border-gray-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Destinataires</h2>
            <div className="text-sm text-gray-500">
              {recipients.length} signataire{recipients.length > 1 ? 's' : ''}
            </div>
          </div>

          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-medium mb-3 text-gray-900">Type de signature</h3>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="flowType"
                  value="sequential"
                  checked={flowType === 'sequential'}
                  onChange={() => setFlowType('sequential')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">
                  Séquentielle <span className="text-gray-500 text-xs">(un par un)</span>
                </span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="flowType"
                  value="parallel"
                  checked={flowType === 'parallel'}
                  onChange={() => setFlowType('parallel')}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-3 text-sm font-medium text-gray-700">
                  Parallèle <span className="text-gray-500 text-xs">(tous en même temps)</span>
                </span>
              </label>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Ajouter des documents
            </label>
            <div className="relative">
              <input
                type="file"
                multiple
                accept=".pdf,.doc,.docx"
                onChange={onFilesSelected}
                disabled={isUploading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
              />
              {isUploading && (
                <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                </div>
              )}
            </div>
            {documents.length > 0 && (
              <p className="text-xs text-gray-500 mt-2">
                {documents.length} document{documents.length > 1 ? 's' : ''} dans l'enveloppe
              </p>
            )}
          </div>

          <div className="space-y-4">
            {recipients.map((recipient, idx) => {
              const canPlace = canPlaceSignature(idx);
              const hasSignature = hasSignatureOnCurrentDoc(recipient.order);
              
              return (
                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-sm font-medium text-blue-700">{idx + 1}</span>
                      </div>
                      <span className="font-medium text-gray-900">Destinataire #{idx + 1}</span>
                    </div>
                    {recipients.length > 1 && (
                      <button
                        onClick={() => removeRecipient(idx)}
                        className="text-red-400 hover:text-red-600 p-1"
                        title="Supprimer"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={recipient.email}
                        onChange={e => updateRecipient(idx, 'email', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="exemple@email.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Nom complet</label>
                      <input
                        type="text"
                        value={recipient.full_name}
                        onChange={e => updateRecipient(idx, 'full_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Jean Dupont"
                      />
                    </div>

                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => setPlacing({ idx, type: 'signature' })}
                        disabled={!selectedDocId || !canPlace}
                        className={`w-full px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                          placing.idx === idx
                            ? 'bg-yellow-100 text-yellow-800 border border-yellow-300'
                            : canPlace && selectedDocId
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {placing.idx === idx 
                          ? 'Cliquez sur le PDF pour placer' 
                          : hasSignature
                          ? 'Redéfinir position signature'
                          : 'Définir position signature'
                        }
                      </button>
                      
                      {!selectedDocId && (
                        <p className="text-xs text-red-500 mt-1">
                          Sélectionnez d'abord un document à droite
                        </p>
                      )}
                      
                      {selectedDocId && !canPlace && (
                        <p className="text-xs text-red-500 mt-1">
                          Renseignez l'email et le nom complet
                        </p>
                      )}
                      
                      {hasSignature && canPlace && selectedDocId && (
                        <p className="text-xs text-green-600 mt-1">
                          ✓ Signature placée sur ce document
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            <button
              onClick={addRecipient}
              className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
              </svg>
              <span className="font-medium">Ajouter un destinataire</span>
            </button>
          </div>

          {fields.length > 0 && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <h3 className="font-medium text-green-900 mb-2">Champs configurés</h3>
              <div className="space-y-1">
                {fields.map((field, i) => (
                  <div key={i} className="text-sm text-green-700 flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Page {field.page} — {field.recipient_name || field.name.replace('Signature ', '')}
                  </div>
                ))}
              </div>
            </div>
          )}
    <div className="mt-4 mb-2 flex items-center">
  <input
    id="includeQr"
    type="checkbox"
    className="h-4 w-4 mr-2"
    checked={includeQr}
    onChange={(e) => setIncludeQr(e.target.checked)}
  />
  <label htmlFor="includeQr" className="text-sm text-gray-700">
    Intégrer un QR Code de vérification au PDF final
  </label>
</div>

          <button
            onClick={handleSubmit}
            disabled={recipients.some(r => !r.email || !r.full_name) || fields.length === 0}
            className="w-full mt-6 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            Envoyer l'enveloppe
          </button>
        </div>
                  {/* --- Relances / Échéance --- */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg space-y-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intervalle entre relances (en jours)</label>
 <p className="text-xs text-gray-500 mt-1">Ex. 1 = tous les jours, 2 = tous les 2 jours, 7 = 1 fois/semaine.</p>
<input
                type="number"
                min={1}
                value={reminderDays}
                onChange={e => setReminderDays(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Échéance</label>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="deadlineMode"
                    value="days"
                    checked={deadlineMode === 'days'}
                    onChange={() => setDeadlineMode('days')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-700">Dans</span>
                  <input
                    type="number"
                    min={1}
                    disabled={deadlineMode !== 'days'}
                    value={deadlineDays}
                    onChange={e => setDeadlineDays(e.target.value)}
                    className="ml-2 w-20 px-2 py-1 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                  />
                  <span className="ml-2 text-sm text-gray-700">jour(s)</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="deadlineMode"
                    value="exact"
                    checked={deadlineMode === 'exact'}
                    onChange={() => setDeadlineMode('exact')}
                    className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                  />
                  <span className="ml-3 text-sm text-gray-700">Date exacte</span>
                </label>
                <input
                  type="datetime-local"
                  disabled={deadlineMode !== 'exact'}
                  value={deadlineExact}
                  onChange={e => setDeadlineExact(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500">
                  Si vide, une échéance par défaut sera appliquée côté serveur.
                </p>
              </div>
            </div>
          </div>
      </div>

      {/* Zone centrale - PDF Viewer */}
      <div className="flex-1 flex flex-col bg-gray-100">
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto" ref={pdfWrapper}>
            {pdfUrl ? (
              <div className="p-6">
                <div className="max-w-[900px] mx-auto">
                  <Document
                    key={String(pdfUrl || 'empty')}
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoad}
                    onLoadError={onDocumentError}
                    loading={
                      <div className="flex items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-3 text-gray-600">Chargement du PDF...</span>
                      </div>
                    }
                  >
                    {Array.from({ length: numPagesByDoc[selectedDocId] || 0 }, (_, i) => {
                      const pageNumber = i + 1;
                      return (
                        <div key={pageNumber} className="relative mb-8 bg-white shadow-lg rounded-lg overflow-hidden">
                          <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-sm z-20">
                            Page {pageNumber}
                          </div>

                          <Page
                            pageNumber={pageNumber}
                            width={pdfWidth}
                            onLoadSuccess={(page) => onPageLoadSuccess(pageNumber, page)}
                            renderTextLayer={false}
                            renderAnnotationLayer={false}
                          />

                          {/* Champs déjà posés (visibles) */}
                          {fields
                            .filter(f => f.document_id === selectedDocId && f.page === pageNumber)
                            .map(f => renderFieldBox(f, pageNumber))
                          }

                          {/* Overlay de clic (pour placer) */}
                          <div
                            onClick={e => handlePdfClick(e, pageNumber)}
                            className={`absolute inset-0 z-10 ${placing.idx !== null ? 'pointer-events-auto cursor-crosshair bg-yellow-200/10' : 'pointer-events-none cursor-default'}`}
                          />
                        </div>
                      );
                    })}
                  </Document>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun document sélectionné</h3>
                  <p className="mt-1 text-sm text-gray-500">Sélectionnez un document dans la liste</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Sidebar Droite - Documents */}
      <div className="w-72 bg-white shadow-lg overflow-y-auto border-l border-gray-200">
        <div className="p-4">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Documents
          </h3>

          {documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="mx-auto h-8 w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Aucun document</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => selectDocument(doc)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selectedDocId === doc.id
                      ? 'bg-blue-50 border-blue-200 shadow-sm'
                      : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <div className={`mt-0.5 w-8 h-10 rounded border-2 flex items-center justify-center ${
                      selectedDocId === doc.id ? 'border-blue-300 bg-blue-100' : 'border-gray-300 bg-gray-50'
                    }`}>
                      <svg className={`w-4 h-4 ${selectedDocId === doc.id ? 'text-blue-600' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${
                        selectedDocId === doc.id ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {doc.name || `Document ${doc.id}`}
                      </p>
                      <div className="mt-1 flex items-center space-x-2">
                        <span className="text-xs text-gray-500">PDF</span>
                        {numPagesByDoc[doc.id] && (
                          <>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-500">
                              {numPagesByDoc[doc.id]} page{numPagesByDoc[doc.id] > 1 ? 's' : ''}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}