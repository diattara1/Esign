import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import logService from '../services/logService';
import sanitize from '../utils/sanitize';
import Countdown from '../components/Countdown';
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

  // États pour la responsivité
  const [isMobileView, setIsMobileView] = useState(false);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [currentMobileTab, setCurrentMobileTab] = useState('recipients'); // 'recipients' | 'pdf' | 'documents'

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
  const [loadingDocId, setLoadingDocId] = useState(null);

  const deadlineAt = useMemo(() => {
    if (deadlineMode === 'exact' && deadlineExact) {
      return new Date(deadlineExact).toISOString();
    }
    if (deadlineMode === 'days' && deadlineDays) {
      const d = new Date();
      d.setDate(d.getDate() + Number(deadlineDays));
      return d.toISOString();
    }
    return null;
  }, [deadlineMode, deadlineExact, deadlineDays]);

  const pdfWrapper = useRef(null);
  const prevUrlRef = useRef(null);

  // Détection de la taille d'écran
  useEffect(() => {
    const checkScreenSize = () => {
      const isMobile = window.innerWidth < 1024; // lg breakpoint
      setIsMobileView(isMobile);
      
      if (isMobile) {
        setShowLeftSidebar(false);
        setShowRightSidebar(false);
      } else {
        setShowLeftSidebar(true);
        setShowRightSidebar(true);
      }
    };

    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

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
      const padding = isMobileView ? 16 : 48; // Moins de padding sur mobile
      const container = node.clientWidth || 0;
      const maxWidth = isMobileView ? 600 : 900;
      const minWidth = isMobileView ? 280 : 320;
      const next = Math.min(Math.max(container - padding, minWidth), maxWidth);
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
  }, [isMobileView]);

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
  const selectDocument = useCallback(async (doc) => {
    if (selectedDocId === doc.id) return;

    let cancelled = false;
    setLoadingDocId(doc.id);
    try {
      // 1) on télécharge d'abord le nouveau PDF
      const blobUrl = await signatureService.fetchDocumentBlob(id, doc.id);
      if (cancelled) return;

      // 2) swap atomique : on change l'id et l'URL en même temps
      setPdfUrl(blobUrl); // 1) d'abord l'URL du nouveau PDF
      setSelectedDocId(doc.id); // 2) puis l'ID (affichage, badges, etc.)
      setNumPagesByDoc(prev => ({ ...prev, [doc.id]: undefined }));
      
      // Sur mobile, passer automatiquement à la vue PDF
      if (isMobileView) {
        setCurrentMobileTab('pdf');
      }
    } catch (e) {
      logService.error(e);
      toast.error('Impossible de charger ce PDF');
    } finally {
      setLoadingDocId(null);
    }

    // cleanup si le composant est démonté pendant l'async
    return () => { cancelled = true; };
  }, [selectedDocId, id, isMobileView]);

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

  const handleDragEnd = useCallback((result) => {
    if (!result.destination) return;
    setRecipients(prev => {
      const items = Array.from(prev);
      const [moved] = items.splice(result.source.index, 1);
      items.splice(result.destination.index, 0, moved);
      const orderMap = {};
      const updated = items.map((rec, i) => {
        orderMap[rec.order] = i + 1;
        return { ...rec, order: i + 1 };
      });
      setFields(prevFields =>
        prevFields.map(f =>
          orderMap[f.recipient_id]
            ? { ...f, recipient_id: orderMap[f.recipient_id] }
            : f
        )
      );
      return updated;
    });
  }, [setFields]);

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
        deadline_at: deadlineAt,
      };
      if (payload.deadline_at && new Date(payload.deadline_at) < new Date()) {
        toast.error("L'échéance est déjà passée");
        return;// pas d'échéance explicite -> géré par le backend si besoin
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
  }, [id, recipients, fields, flowType, includeQr, reminderDays, deadlineAt, navigate]);

  // ---- Vérifier si un destinataire a déjà une signature sur le document sélectionné ----
  const hasSignatureOnCurrentDoc = useCallback((recipientOrder) => {
    return fields.some(field => 
      field.recipient_id === recipientOrder && 
      field.document_id === selectedDocId && 
      field.field_type === 'signature'
    );
  }, [fields, selectedDocId]);

  // ---- Rendu visuel d'un champ posé ----
  const renderFieldBox = (field, pageNumber) => {
    if (field.page !== pageNumber || field.document_id !== selectedDocId) return null;

    const vp = pageDimensions[selectedDocId]?.[pageNumber] || { width: 600, height: 800 };
    const factor = pdfWidth / vp.width;

    const style = {
      position: 'absolute',
      left: field.position.x * factor,
      top: field.position.y * factor,
      width: field.position.width * factor,
      height: field.position.height * factor,
      borderRadius: 8,
      boxShadow: '0 0 0 1px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.08)',
      background: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 15
    };

    return (
      <div key={`${pageNumber}-${field.name}-${field.position.x}-${field.position.y}`} style={style}>
        <div style={{ textAlign: 'center', fontSize: isMobileView ? 10 : 12, lineHeight: 1.1, color: '#374151' }}>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>Signature</div>
          <div>{field.recipient_name || field.name.replace('Signature ', '')}</div>
        </div>
      </div>
    );
  };

  // Navigation mobile
  const MobileNavigation = () => (
    <div className="lg:hidden bg-white border-t border-gray-200 px-4 py-2">
      <div className="flex space-x-1">
        <button
          onClick={() => setCurrentMobileTab('recipients')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentMobileTab === 'recipients'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Destinataires
        </button>
        <button
          onClick={() => setCurrentMobileTab('pdf')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentMobileTab === 'pdf'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          PDF
        </button>
        <button
          onClick={() => setCurrentMobileTab('documents')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentMobileTab === 'documents'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Documents
        </button>
      </div>
    </div>
  );

  // Sidebar des destinataires
  const RecipientsPanel = ({ className = "" }) => (
    <div className={`bg-white shadow-lg overflow-y-auto border-gray-200 ${className}`}>
      <div className="p-4 lg:p-6">
        <div className="flex items-center justify-between mb-4 lg:mb-6">
          <h2 className="text-lg lg:text-xl font-bold text-gray-900">Destinataires</h2>
          <div className="text-sm text-gray-500">
            {recipients.length} signataire{recipients.length > 1 ? 's' : ''}
          </div>
        </div>

        <div className="mb-4 lg:mb-6 p-3 lg:p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-3 text-gray-900 text-sm lg:text-base">Type de signature</h3>
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

        <div className="mb-4 lg:mb-6">
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

        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="recipients">
            {(provided) => (
              <div
                className="space-y-4"
                ref={provided.innerRef}
                {...provided.droppableProps}
              >
                {recipients.map((recipient, idx) => {
                  const canPlace = canPlaceSignature(idx);
                  const hasSignature = hasSignatureOnCurrentDoc(recipient.order);
                  const emailError = !recipient.email
                    ? "Email obligatoire"
                    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)
                    ? ""
                    : "Email invalide";

                  return (
                    <Draggable key={idx} draggableId={`rec-${idx}`} index={idx}>
                      {(dragProvided) => (
                        <div
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          {...dragProvided.dragHandleProps}
                          className="bg-white border border-gray-200 rounded-lg p-3 lg:p-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center space-x-2">
                              <div className="w-6 h-6 lg:w-8 lg:h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <span className="text-xs lg:text-sm font-medium text-blue-700">{idx + 1}</span>
                              </div>
                              <span className="font-medium text-gray-900 text-sm lg:text-base">Destinataire #{idx + 1}</span>
                            </div>
                            {recipients.length > 1 && (
                              <button
                                onClick={() => removeRecipient(idx)}
                                className="text-red-400 hover:text-red-600 p-1"
                                title="Supprimer"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path
                                    fillRule="evenodd"
                                    d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                    clipRule="evenodd"
                                  />
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
                                className={`w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${emailError ? 'border-red-500' : 'border-gray-300'}`}
                                placeholder="exemple@email.com"
                              />
                              {emailError && (
                                <p className="text-xs text-red-500 mt-1">{emailError}</p>
                              )}
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
                                onClick={() => {
                                  setPlacing({ idx, type: 'signature' });
                                  if (isMobileView) setCurrentMobileTab('pdf');
                                }}
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
                                  : 'Définir position signature'}
                              </button>

                              {!selectedDocId && (
                                <p className="text-xs text-red-500 mt-1">
                                  Sélectionnez d'abord un document
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
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>

        <button
          onClick={addRecipient}
          className="w-full py-3 px-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2 mt-4"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
          </svg>
          <span className="font-medium text-sm lg:text-base">Ajouter un destinataire</span>
        </button>

        {fields.length > 0 && (
          <div className="mt-4 lg:mt-6 p-3 lg:p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="font-medium text-green-900 mb-2 text-sm lg:text-base">Champs configurés</h3>
            <div className="space-y-1">
              {fields.map((field, i) => (
                <div key={i} className="text-sm text-green-700 flex items-center">
                  <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="truncate">Page {field.page} — {field.recipient_name || field.name.replace('Signature ', '')}</span>
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

        {/* --- Relances / Échéance --- */}
        <div className="mb-4 lg:mb-6 p-3 lg:p-4 bg-gray-50 rounded-lg space-y-4">
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
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 flex-shrink-0"
                />
                <span className="ml-3 text-sm text-gray-700">Dans</span>
                <input
                  type="number"
                  min={1}
                  disabled={deadlineMode !== 'days'}
                  value={deadlineDays}
                  onChange={e => setDeadlineDays(e.target.value)}
                  className="ml-2 w-16 lg:w-20 px-2 py-1 border border-gray-300 rounded-md text-sm disabled:bg-gray-100"
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
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500 flex-shrink-0"
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
              <Countdown targetIso={deadlineAt} className="text-sm text-gray-700" />
              <p className="text-xs text-gray-500">
                Si vide, une échéance par défaut sera appliquée côté serveur.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleSubmit}
          disabled={recipients.some(r => !r.email || !r.full_name) || fields.length === 0}
          className="w-full mt-4 lg:mt-6 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm lg:text-base"
        >
          Envoyer l'enveloppe
        </button>
      </div>
    </div>
  );

  // Panel des documents
  const DocumentsPanel = ({ className = "" }) => (
    <div className={`bg-white shadow-lg overflow-y-auto border-gray-200 ${className}`}>
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-4 flex items-center text-sm lg:text-base">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Documents
        </h3>

        {documents.length === 0 ? (
          <div className="text-center py-6 lg:py-8 text-gray-500">
            <svg className="mx-auto h-6 w-6 lg:h-8 lg:w-8 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                  <div className={`relative mt-0.5 w-6 h-8 lg:w-8 lg:h-10 rounded border-2 flex items-center justify-center ${
                    selectedDocId === doc.id ? 'border-blue-300 bg-blue-100' : 'border-gray-300 bg-gray-50'
                  }`}>
                    {loadingDocId === doc.id ? (
                      <div className="w-full h-full rounded bg-gray-200 animate-pulse" />
                    ) : (
                      <svg
                        className={`w-3 h-3 lg:w-4 lg:h-4 ${selectedDocId === doc.id ? 'text-blue-600' : 'text-gray-400'}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        selectedDocId === doc.id ? 'text-blue-900' : 'text-gray-900'
                      }`}
                    >
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
  );

  // Vue PDF
  const PDFViewer = ({ className = "" }) => (
    <div className={`flex-1 flex flex-col bg-gray-100 ${className}`}>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto" ref={pdfWrapper}>
          {pdfUrl ? (
            <div className="p-2 lg:p-6">
              <div className={`max-w-[900px] mx-auto ${isMobileView ? 'max-w-full' : ''}`}>
                <Document
                  key={String(pdfUrl || 'empty')}
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoad}
                  onLoadError={onDocumentError}
                  loading={
                    <div className="flex items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-6 w-6 lg:h-8 lg:w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-3 text-gray-600 text-sm lg:text-base">Chargement du PDF...</span>
                    </div>
                  }
                >
                  {Array.from({ length: numPagesByDoc[selectedDocId] || 0 }, (_, i) => {
                    const pageNumber = i + 1;
                    return (
                      <div key={pageNumber} className={`relative mb-4 lg:mb-8 bg-white shadow-lg rounded-lg overflow-hidden`}>
                        <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 rounded text-xs lg:text-sm z-20">
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
                          className={`absolute inset-0 z-10 ${placing.idx !== null ? 'cursor-crosshair bg-yellow-200/10' : 'cursor-default'}`}
                          style={{ pointerEvents: placing.idx !== null ? 'auto' : 'none' }}
                        />
                      </div>
                    );
                  })}
                </Document>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center p-4">
                <svg className="mx-auto h-8 w-8 lg:h-12 lg:w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
  );

  // ---- Rendu principal ----
  if (isMobileView) {
    // Vue mobile avec navigation par onglets
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {currentMobileTab === 'recipients' && (
            <RecipientsPanel className="h-full border-r" />
          )}
          {currentMobileTab === 'pdf' && (
            <PDFViewer className="h-full" />
          )}
          {currentMobileTab === 'documents' && (
            <DocumentsPanel className="h-full border-l" />
          )}
        </div>
        <MobileNavigation />
      </div>
    );
  }

  // Vue desktop avec sidebars
  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Sidebar Gauche - Destinataires */}
      {showLeftSidebar && (
        <RecipientsPanel className="w-80 border-r" />
      )}

      {/* Zone centrale - PDF Viewer */}
      <PDFViewer />

      {/* Sidebar Droite - Documents */}
      {showRightSidebar && (
        <DocumentsPanel className="w-72 border-l" />
      )}

      {/* Boutons pour masquer/afficher les sidebars sur desktop */}
      {!isMobileView && (
        <>
          {!showLeftSidebar && (
            <button
              onClick={() => setShowLeftSidebar(true)}
              className="fixed left-4 top-4 z-30 bg-white shadow-lg rounded-lg p-2 hover:bg-gray-50 transition-colors"
              title="Afficher les destinataires"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </button>
          )}
          {!showRightSidebar && (
            <button
              onClick={() => setShowRightSidebar(true)}
              className="fixed right-4 top-4 z-30 bg-white shadow-lg rounded-lg p-2 hover:bg-gray-50 transition-colors"
              title="Afficher les documents"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </button>
          )}
          {showLeftSidebar && (
            <button
              onClick={() => setShowLeftSidebar(false)}
              className="fixed left-4 top-4 z-30 bg-white shadow-lg rounded-lg p-2 hover:bg-gray-50 transition-colors"
              title="Masquer les destinataires"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          {showRightSidebar && (
            <button
              onClick={() => setShowRightSidebar(false)}
              className="fixed right-4 top-4 z-30 bg-white shadow-lg rounded-lg p-2 hover:bg-gray-50 transition-colors"
              title="Masquer les documents"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}