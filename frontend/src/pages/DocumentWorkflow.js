import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import logService from '../services/logService';
import sanitize from '../utils/sanitize';
import Countdown from '../components/Countdown';
import useIsMobile from '../hooks/useIsMobile';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/* =========================
   COMPOSANT SIGNATURE DRAGGABLE (conservé)
   ========================= */
const DraggableSignature = React.memo(function DraggableSignature({
  field,
  pageWidth,
  pageHeight,
  isMobileView,
  onUpdate,
  onDelete
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, fieldX: 0, fieldY: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const elementRef = useRef(null);

  const style = useMemo(() => ({
    position: 'absolute',
    left: field.position.x * pageWidth,
    top: field.position.y * pageHeight,
    width: field.position.width * pageWidth,
    height: field.position.height * pageHeight,
    borderRadius: 8,
    boxShadow: '0 0 0 1px rgba(0,0,0,.20), 0 2px 6px rgba(0,0,0,.08)',
    background: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 15,
    cursor: isDragging ? 'grabbing' : 'grab',
    border: '2px solid transparent',
    userSelect: 'none',
  }), [field.position, pageWidth, pageHeight, isDragging]);

  const handleMouseDown = useCallback((e) => {
    if (e.target.classList.contains('resize-handle')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      fieldX: field.position.x,
      fieldY: field.position.y
    });
  }, [field.position]);

  const handleTouchStart = useCallback((e) => {
    if (e.target.classList.contains('resize-handle')) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    setDragStart({
      x: touch.clientX,
      y: touch.clientY,
      fieldX: field.position.x,
      fieldY: field.position.y,
    });
  }, [field.position]);

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: field.position.width,
      height: field.position.height
    });
  }, [field.position]);

  const handleResizeTouchStart = useCallback((e) => {
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    setResizeStart({
      x: touch.clientX,
      y: touch.clientY,
      width: field.position.width,
      height: field.position.height,
    });
  }, [field.position]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      if (isDragging) {
        const deltaX = (e.clientX - dragStart.x) / pageWidth;
        const deltaY = (e.clientY - dragStart.y) / pageHeight;
        const newPosition = {
          ...field.position,
          x: Math.max(0, dragStart.fieldX + deltaX),
          y: Math.max(0, dragStart.fieldY + deltaY)
        };
        onUpdate(field, { position: newPosition });
      } else if (isResizing) {
        const deltaX = (e.clientX - resizeStart.x) / pageWidth;
        const deltaY = (e.clientY - resizeStart.y) / pageHeight;
        const newPosition = {
          ...field.position,
          width: Math.max(50 / pageWidth, resizeStart.width + deltaX),
          height: Math.max(20 / pageHeight, resizeStart.height + deltaY)
        };
        onUpdate(field, { position: newPosition });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    const handleTouchMove = (e) => {
      const touch = e.touches[0];
      if (!touch) return;
      e.preventDefault();
      if (isDragging) {
        const deltaX = (touch.clientX - dragStart.x) / pageWidth;
        const deltaY = (touch.clientY - dragStart.y) / pageHeight;
        const newPosition = {
          ...field.position,
          x: Math.max(0, dragStart.fieldX + deltaX),
          y: Math.max(0, dragStart.fieldY + deltaY),
        };
        onUpdate(field, { position: newPosition });
      } else if (isResizing) {
        const deltaX = (touch.clientX - resizeStart.x) / pageWidth;
        const deltaY = (touch.clientY - resizeStart.y) / pageHeight;
        const newPosition = {
          ...field.position,
          width: Math.max(50 / pageWidth, resizeStart.width + deltaX),
          height: Math.max(20 / pageHeight, resizeStart.height + deltaY),
        };
        onUpdate(field, { position: newPosition });
      }
    };

    const handleTouchEnd = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
       document.removeEventListener('touchmove', handleTouchMove);
       document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging, isResizing, dragStart, resizeStart, pageWidth, pageHeight, field, onUpdate]);

  return (
    <div
      ref={elementRef}
      style={style}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={(e) => e.preventDefault()}
      onTouchEnd={(e) => e.preventDefault()}
      className={`signature-field ${isDragging ? 'dragging' : ''} hover:shadow-lg transition-shadow`}
    >
      <div
        style={{
          textAlign: 'center',
          fontSize: isMobileView ? 10 : 12,
          lineHeight: 1.1,
          color: '#374151',
          pointerEvents: 'none'
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 2 }}>Signature</div>
        <div>{field.recipient_name || field.name.replace('Signature ', '')}</div>
      </div>

      <div
        className="resize-handle"
        onMouseDown={handleResizeStart}
        onTouchStart={handleResizeTouchStart}
        style={{
          position: 'absolute',
          bottom: -4,
          right: -4,
          width: 12,
          height: 12,
          background: '#3b82f6',
          borderRadius: '50%',
          cursor: 'se-resize',
          border: '2px solid white',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      />

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(field);
        }}
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 20,
          height: 20,
          background: '#ef4444',
          borderRadius: '50%',
          border: '2px solid white',
          color: 'white',
          fontSize: 12,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
        }}
      >
        ×
      </button>
    </div>
  );
});

/* =========================
   PDF VIEWER
   ========================= */
const PDFViewer = React.memo(function PDFViewer({
  className = '',
  pdfUrl,
  pdfWidth,
  selectedDocId,
  numPagesByDoc,
  pageDimensions,
  fields,
  placing,
  onDocumentLoad,
  onPageLoadSuccess,
  onDocumentError,
  handlePdfClick,
  onUpdateField,
  onDeleteField,
  isMobileView,
  pdfWrapper,
}) {
  const pagesCount = numPagesByDoc[selectedDocId] || 0;

  const documentKey = useMemo(() => {
    return `${selectedDocId}-${pdfUrl}`;
  }, [selectedDocId, pdfUrl]);

  return (
    <div className={`flex-1 flex flex-col bg-gray-100 ${className}`}>
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-auto" ref={pdfWrapper}>
          {pdfUrl ? (
            <div className="p-2 lg:p-6">
              <div className={`max-w-[900px] mx-auto ${isMobileView ? 'max-w-full' : ''}`}>
                <Document
                  key={documentKey}
                  file={pdfUrl}
                  onLoadSuccess={onDocumentLoad}
                  onLoadError={onDocumentError}
                  loading={
                    <div className="flex items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-6 w-6 lg:h-8 lg:w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-3 text-gray-600 text-sm lg:text-base">
                        Chargement du PDF...
                      </span>
                    </div>
                  }
                >
                  {Array.from({ length: pagesCount }, (_, i) => {
                    const pageNumber = i + 1;
                    const pageFields = fields.filter(
                      (f) => f.document_id === selectedDocId && f.page === pageNumber
                    );
                    return (
                      <div
                        key={pageNumber}
                        className="relative mb-4 lg:mb-8 bg-white shadow-lg rounded-lg overflow-hidden"
                      >
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
                        {pageFields.map((field) => {
                          const vp = pageDimensions[selectedDocId]?.[pageNumber] || {
                            width: 600,
                            height: 800,
                          };
                          const pageWidthPx = pdfWidth;
                          const pageHeightPx = (vp.height / vp.width) * pdfWidth;
                          return (
                            <DraggableSignature
                              key={`${field.recipient_id}-${field.document_id}-${field.page}-${field.field_type}`}
                              field={field}
                              pageWidth={pageWidthPx}
                              pageHeight={pageHeightPx}
                              isMobileView={isMobileView}
                              onUpdate={onUpdateField}
                              onDelete={onDeleteField}
                            />
                          );
                        })}
                        <div
                          onClick={(e) => handlePdfClick(e, pageNumber)}
                          className={`absolute inset-0 z-10 ${
                            placing.idx !== null ? 'cursor-crosshair bg-yellow-200/10' : 'cursor-default'
                          }`}
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
                <svg
                  className="mx-auto h-8 w-8 lg:h-12 lg:w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
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
});

/* =========================
   PANEL DES DESTINATAIRES (drag supprimé)
   ========================= */
const RecipientsPanel = React.memo(({
  className = '',
  flowType,
  setFlowType,
  includeQr,
  setIncludeQr,
  reminderDays,
  setReminderDays,
  deadlineEnabled,
  setDeadlineEnabled,
  deadlineExact,
  setDeadlineExact,
  deadlineAt,
  documents,
  selectedDocId,
  isUploading,
  onFilesSelected,
  recipients,
  updateRecipient,
  addRecipient,
  removeRecipient,
  // handleDragEnd, // supprimé
  fields,
  placing,
  setPlacing,
  isMobileView,
  canPlaceSignature,
  hasSignatureOnDoc,
  handleSubmit,
  handlePlaceSignature 
}) => {
   const [open, setOpen] = React.useState(true);
  return (
    <div className={`bg-white shadow-lg overflow-y-auto border-gray-200 ${className}`}>
     <div className="p-4 lg:p-6">
        
      <div className="mb-4 lg:mb-5 p-3 bg-gray-50 rounded-md">
        <label htmlFor="flowType" className="block text-sm font-medium text-gray-800 mb-2">
          Type de signatures
        </label>
        <select
          id="flowType"
          value={flowType}
          onChange={(e) => setFlowType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          <option value="sequential">Séquentielle (un par un)</option>
          <option value="parallel">Parallèle (tous en même temps)</option>
        </select>
      </div>

      <div className="mb-4 lg:mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Ajouter des documents</label>
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
            {documents.length} document{documents.length > 1 ? 's' : ''}
          </p>
        )}
      </div>

      <div className="mb-3 lg:mb-4">
        <div className="flex items-center justify-between bg-gray-100 rounded-md px-3 py-2">
          <div className="flex items-center space-x-2">
            <svg className="w-5 h-5 text-gray-700" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M3 20h18M7 16c1.5-3 3.5-3 5-1s3.5 2 5-1M14 7l3 3M11 10l3-3" />
            </svg>
            <span className="font-semibold text-gray-900">Signataires</span>
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium bg-white text-gray-800 border border-gray-200">
              {recipients.length}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={addRecipient}
              className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50"
              title="Ajouter un signataire"
            >
              <span className="text-xl leading-none">+</span>
            </button>
            <button
              type="button"
              onClick={() => setOpen(v => !v)}
              className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center hover:bg-gray-50"
              aria-expanded={open}
              title={open ? 'Replier' : 'Déplier'}
            >
              <svg className={`w-4 h-4 transform transition-transform ${open ? '' : '-rotate-90'}`} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.24 4.38a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="divide-y divide-gray-200">
          {recipients.map((recipient, idx) => {
            const canPlace = canPlaceSignature(idx);
            const hasSignature = hasSignatureOnDoc(recipient.order);
            const emailError = !recipient.email
              ? 'Email obligatoire'
              : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email)
              ? ''
              : 'Email invalide';

            return (
              <div key={`recipient-${recipient.order}`} className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {/* Badge d'ordre, non draggable */}
                    <span
                      className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center"
                      title={`Destinataire ${idx + 1}`}
                    >
                      <span className="text-xs font-medium text-blue-700">{idx + 1}</span>
                    </span>
                    <span className="font-medium text-gray-900 text-sm">
                      {recipient.full_name || `Destinataire #${idx + 1}`}
                    </span>
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

                <div className="mt-2 space-y-2">
               {/* Email */}
<div>
  <label htmlFor={`email-${recipient.uid}`} className="block text-xs font-medium text-gray-700 mb-1">
    Email
  </label>
  <input
    id={`email-${recipient.uid}`}
    type="email"
    name={`email-${recipient.uid}`}
    placeholder="Email"
    autoComplete="email"
    inputMode="email"
    value={recipient.email ?? ""}
    onChange={(e) => updateRecipient(idx, "email", e.target.value)}
    required
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring focus:ring-indigo-200 focus:border-indigo-500"
    autoCapitalize="off"
    spellCheck={false}
  />
</div>

{/* Nom complet */}
<div>
  <label htmlFor={`full_name-${recipient.uid}`} className="block text-xs font-medium text-gray-700 mb-1">
    Nom
  </label>
  <input
    id={`full_name-${recipient.uid}`}
    type="text"
    name={`full_name-${recipient.uid}`}
    placeholder="Nom complet"
    autoComplete="name"
    value={recipient.full_name ?? ""}
    onChange={(e) => updateRecipient(idx, "full_name", e.target.value)}
    required
    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring focus:ring-indigo-200 focus:border-indigo-500"
  />
</div>


                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => handlePlaceSignature(idx)}
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
                      <p className="text-xs text-red-500 mt-1">Sélectionnez d'abord un document</p>
                    )}
                    {selectedDocId && !canPlace && (
                      <p className="text-xs text-red-500 mt-1">Renseignez l'email et le nom complet</p>
                    )}
                    {hasSignature && canPlace && selectedDocId && (
                      <p className="text-xs text-green-600 mt-1">✓ Signature placée sur ce document</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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

      <div className="mb-4 lg:mb-5 p-3 bg-gray-50 rounded-md">
        <div className="flex items-center justify-between">
          <label className="flex items-center text-sm font-medium text-gray-800">
            <input
              id="deadlineEnabled"
              type="checkbox"
              className="h-4 w-4 mr-2"
              checked={deadlineEnabled}
              onChange={(e) => setDeadlineEnabled(e.target.checked)}
            />
            Définir une échéance
          </label>
          {deadlineAt && (
            <span className="text-xs text-gray-600">
              <Countdown targetIso={deadlineAt} />
            </span>
          )}
        </div>
        {deadlineEnabled && (
          <div className="mt-2">
            <input
              type="datetime-local"
              value={deadlineExact}
              onChange={(e) => setDeadlineExact(e.target.value)}
              className="w-full px-2.5 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        )}
      </div>

      <button
        onClick={handleSubmit}
        disabled={recipients.some((r) => !r.email || !r.full_name) || fields.length === 0}
        className="w-full mt-4 lg:mt-6 bg-green-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm lg:text-base"
      >
        Envoyer l'enveloppe
      </button>
     </div>
    </div>
  );
});

/* =========================
   PANEL DES DOCUMENTS
   ========================= */
const DocumentsPanel = React.memo(({ 
  className = '',
  documents,
  selectedDocId,
  loadingDocId,
  numPagesByDoc,
  selectDocument 
}) => {
  return (
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
            {documents.map((doc) => (
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
                  <div
                    className={`relative mt-0.5 w-6 h-8 lg:w-8 lg:h-10 rounded border-2 flex items-center justify-center ${
                      selectedDocId === doc.id ? 'border-blue-300 bg-blue-100' : 'border-gray-300 bg-gray-50'
                    }`}
                  >
                    {loadingDocId === doc.id ? (
                      <div className="w-full h-full rounded bg-gray-200 animate-pulse" />
                    ) : (
                      <svg
                        className={`w-3 h-3 lg:w-4 lg:h-4 ${
                          selectedDocId === doc.id ? 'text-blue-600' : 'text-gray-400'
                        }`}
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
});

/* =========================
   COMPOSANT PRINCIPAL
   ========================= */
export default function DocumentWorkflow() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState(null);
  const [flowType, setFlowType] = useState('sequential');
  const [reminderDays, setReminderDays] = useState(1);
  const [deadlineEnabled, setDeadlineEnabled] = useState(false);
  const [deadlineExact, setDeadlineExact] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const isMobileView = useIsMobile(1024);
  const [showLeftSidebar, setShowLeftSidebar] = useState(true);
  const [showRightSidebar, setShowRightSidebar] = useState(true);
  const [currentMobileTab, setCurrentMobileTab] = useState('recipients');
  const [pdfWidth, setPdfWidth] = useState(800);
  const [numPagesByDoc, setNumPagesByDoc] = useState({});
  const [pageDimensions, setPageDimensions] = useState({});
  const [recipients, setRecipients] = useState([{ id: undefined, email: '', full_name: '', order: 1 }]);
  const [fields, setFields] = useState([]);
  const [placing, setPlacing] = useState({ idx: null, type: 'signature' });
  const [isUploading, setIsUploading] = useState(false);
  const [includeQr, setIncludeQr] = useState(false);
  const [loadingDocId, setLoadingDocId] = useState(null);

  const pdfWrapper = useRef(null);
  const prevUrlRef = useRef(null);

  const handleUpdateField = useCallback((field, updates) => {
    setFields(prev => prev.map(f => {
      if (f.recipient_id === field.recipient_id &&
          f.document_id === field.document_id &&
          f.page === field.page &&
          f.field_type === field.field_type) {
        return { ...f, ...updates };
      }
      return f;
    }));
  }, []);

  const handleDeleteField = useCallback((field) => {
    setFields(prev => prev.filter(f => !(
      f.recipient_id === field.recipient_id &&
      f.document_id === field.document_id &&
      f.page === field.page &&
      f.field_type === field.field_type
    )));
    toast.success('Signature supprimée');
  }, []);

  // deadlineAt
  const deadlineAt = useMemo(() => {
    if (!deadlineEnabled || !deadlineExact) return null;
    return new Date(deadlineExact).toISOString();
  }, [deadlineEnabled, deadlineExact]);

  // Refs stables
  const stablePdfUrl = useRef(pdfUrl);
  const stableSelectedDocId = useRef(selectedDocId);
  useEffect(() => {
    stablePdfUrl.current = pdfUrl;
    stableSelectedDocId.current = selectedDocId;
  }, [pdfUrl, selectedDocId]);

  // Adjust sidebars when screen size changes
  useEffect(() => {
    if (isMobileView) {
      setShowLeftSidebar(false);
      setShowRightSidebar(false);
    } else {
      setShowLeftSidebar(true);
      setShowRightSidebar(true);
    }
  }, [isMobileView]);

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

  // Upload
  const uploadFiles = useCallback(async (files) => {
    try {
      setIsUploading(true);
      await signatureService.updateEnvelopeFiles(id, files);
      toast.success('Fichiers ajoutés');
      await reloadEnvelope();
    } catch (e) {
      logService.error(e);
      toast.error("Échec de l'upload");
    } finally {
      setIsUploading(false);
    }
  }, [id]);

  const reloadEnvelope = useCallback(async () => {
    const env = await signatureService.getEnvelope(id);
    setEnvelope(env);
    setFlowType(env.flow_type || 'sequential');
    setReminderDays(env.reminder_days ?? 1);
    if (env.deadline_at) {
      setDeadlineEnabled(true);
      const d = new Date(env.deadline_at);
      const pad = (n) => String(n).padStart(2, '0');
      const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setDeadlineExact(local);
    } else {
      setDeadlineEnabled(false);
      setDeadlineExact('');
    }
    const docs = env.documents || [];
    setDocuments(docs);
    if (env.recipients?.length) setRecipients(env.recipients);
    if (env.fields?.length) setFields(env.fields);
    if (docs.length > 0) {
      const first = docs[0];
      if (stableSelectedDocId.current !== first.id) {
        setSelectedDocId(first.id);
        const blobUrl = await signatureService.fetchDocumentBlob(id, first.id);
        setPdfUrl(blobUrl);
      }
    } else {
      const res = await signatureService.downloadEnvelope(id);
      if (stableSelectedDocId.current !== 'single') {
        setSelectedDocId('single');
        setPdfUrl(res.download_url);
      }
    }
  }, [id]);

  useEffect(() => {
    (async () => {
      try {
        await reloadEnvelope();
      } catch {
        toast.error('Impossible de charger le dossier');
      }
    })();
  }, [id, reloadEnvelope]);

  // Largeur PDF
  useEffect(() => {
    if (!pdfWrapper.current) return;
    let lastWidth = -1;
    const MIN_DELTA = 8;
    const computeWidth = debounce(() => {
      const node = pdfWrapper.current;
      if (!node) return;
      const padding = isMobileView ? 16 : 48;
      const container = node.clientWidth || 0;
      const maxWidth = isMobileView ? 600 : 900;
      const minWidth = isMobileView ? 280 : 320;
      const nextWidth = Math.min(Math.max(container - padding, minWidth), maxWidth);
      if (Math.abs(nextWidth - lastWidth) >= MIN_DELTA) {
        lastWidth = nextWidth;
        setPdfWidth(nextWidth);
      }
    }, 50);
    const ro = new ResizeObserver(computeWidth);
    ro.observe(pdfWrapper.current);
    computeWidth();
    return () => ro.disconnect();
  }, [isMobileView]);

  // Placement signature
  const handlePlaceSignature = useCallback((idx) => {
    setPlacing({ idx, type: 'signature' });
    if (isMobileView) {
      setCurrentMobileTab('pdf');
    }
  }, [isMobileView, setPlacing, setCurrentMobileTab]);

  const onDocumentLoad = useCallback(({ numPages }) => {
    if (!stableSelectedDocId.current) return;
    setNumPagesByDoc((prev) =>
      prev[stableSelectedDocId.current] === numPages ? prev : { ...prev, [stableSelectedDocId.current]: numPages }
    );
  }, []);

  const onPageLoadSuccess = useCallback((pageNumber, page) => {
    if (!stableSelectedDocId.current) return;
    const vp = page.getViewport({ scale: 1 });
    setPageDimensions((prev) => {
      const current = prev[stableSelectedDocId.current]?.[pageNumber];
      if (current?.width === vp.width && current?.height === vp.height) return prev;
      return {
        ...prev,
        [stableSelectedDocId.current]: {
          ...prev[stableSelectedDocId.current],
          [pageNumber]: { width: vp.width, height: vp.height },
        },
      };
    });
  }, []);

  const onDocumentError = useCallback((err) => {
    logService.error('PDF Error:', err);
    toast.error('Erreur lors du chargement du PDF');
  }, []);

  const selectDocument = useCallback(async (doc) => {
    if (selectedDocId === doc.id) return;
    let cancelled = false;
    setLoadingDocId(doc.id);
    try {
      const blobUrl = await signatureService.fetchDocumentBlob(id, doc.id);
      if (cancelled) return;
      setPdfUrl(blobUrl);
      setSelectedDocId(doc.id);
      setNumPagesByDoc((prev) => ({ ...prev, [doc.id]: undefined }));
      if (isMobileView) {
        setCurrentMobileTab('pdf');
      }
    } catch (e) {
      logService.error(e);
      toast.error('Impossible de charger ce PDF');
    } finally {
      setLoadingDocId(null);
    }
    return () => { cancelled = true; };
  }, [selectedDocId, id, isMobileView]);

  const canPlaceSignature = useCallback((recipientIdx) => {
    const recipient = recipients[recipientIdx];
    return recipient && recipient.email.trim() && recipient.full_name.trim();
  }, [recipients]);

  const handlePdfClick = useCallback((e, pageNumber) => {
    if (placing.idx === null || !selectedDocId) return;
    const recipient = recipients[placing.idx];
    if (!canPlaceSignature(placing.idx)) {
      toast.error("Veuillez renseigner l'email et le nom du destinataire avant de placer sa signature");
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const vp = pageDimensions[selectedDocId]?.[pageNumber] || { width: 600, height: 800 };
    const pdfHeight = (vp.height / vp.width) * pdfWidth;
    const normalized = {
      x: x / pdfWidth,
      y: y / pdfHeight,
      width: 150 / pdfWidth,
      height: 50 / pdfHeight,
    };
    setFields((prev) =>
      prev.filter(
        (field) =>
          !(field.recipient_id === recipient.order &&
            field.document_id === selectedDocId &&
            field.field_type === 'signature')
      )
    );
    const safeName = sanitize(recipient.full_name);
    const newField = {
      recipient_id: recipient.order,
      document_id: selectedDocId,
      field_type: 'signature',
      page: pageNumber,
      position: normalized,
      name: `Signature ${safeName}`,
      required: true,
      recipient_name: safeName,
    };
    setFields((prev) => [...prev, newField]);
    setPlacing({ idx: null, type: 'signature' });
    const docName = sanitize((documents.find((d) => d.id === selectedDocId) || {}).name || `Document ${selectedDocId}`);
    toast.success(`Signature de ${safeName} placée sur ${docName} (page ${pageNumber})`);
  }, [placing.idx, selectedDocId, pageDimensions, pdfWidth, recipients, documents, canPlaceSignature]);

  const updateRecipient = useCallback((idx, field, value) => {
    setRecipients((prev) => {
      const updated = [...prev];
      updated[idx] = { ...updated[idx], [field]: value };
      if (field === 'full_name') {
        setFields((prevFields) =>
          prevFields.map((fieldItem) => {
            if (fieldItem.recipient_id === updated[idx].order) {
              return {
                ...fieldItem,
                name: `Signature ${value}`,
                recipient_name: value,
              };
            }
            return fieldItem;
          })
        );
      }
      return updated;
    });
  }, []);

  const addRecipient = useCallback(() => {
    setRecipients((prev) => [...prev, { id: undefined, email: '', full_name: '', order: prev.length + 1 }]);
  }, []);

  const removeRecipient = useCallback((idx) => {
    if (recipients.length <= 1) return;
    const recipientToRemove = recipients[idx];
    setFields((prev) => prev.filter((field) => field.recipient_id !== recipientToRemove.order));
    setRecipients((prev) => prev.filter((_, i) => i !== idx));
    if (placing.idx === idx) {
      setPlacing({ idx: null, type: 'signature' });
    }
  }, [recipients, placing.idx]);

  const onFilesSelected = useCallback((e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    uploadFiles(files);
    e.target.value = '';
  }, [uploadFiles]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    try {
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
        return;
      }
      await signatureService.updateEnvelope(id, payload);
      await signatureService.sendEnvelope(id, {
        include_qr_code: includeQr,
        reminder_days: payload.reminder_days,
        deadline_at: payload.deadline_at,
      });
      toast.success('Enveloppe envoyée');
      navigate(`/signature/sent/${id}`);
    } catch (err) {
      logService.error(err);
      toast.error("Échec de l'envoi");
    }
  }, [id, recipients, fields, flowType, includeQr, reminderDays, deadlineAt, navigate]);

  const hasSignatureOnDoc = useCallback((recipientOrder) =>
    fields.some((f) => f.recipient_id === recipientOrder && f.document_id === selectedDocId && f.field_type === 'signature'),
    [fields, selectedDocId]
  );

  const MobileNavigation = () => (
    <div className="lg:hidden bg-white border-t border-gray-200 px-4 py-2">
      <div className="flex space-x-1">
        <button
          onClick={() => setCurrentMobileTab('recipients')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentMobileTab === 'recipients' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Destinataires
        </button>
        <button
          onClick={() => setCurrentMobileTab('pdf')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentMobileTab === 'pdf' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          PDF
        </button>
        <button
          onClick={() => setCurrentMobileTab('documents')}
          className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            currentMobileTab === 'documents' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Documents
        </button>
      </div>
    </div>
  );

  // Rendu
  if (isMobileView) {
    return (
      <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
        <MobileNavigation />
        <div className="flex-1 overflow-hidden">
          {currentMobileTab === 'recipients' && (
            <RecipientsPanel
              className="h-full border-r"
              flowType={flowType}
              setFlowType={setFlowType}
              includeQr={includeQr}
              setIncludeQr={setIncludeQr}
              reminderDays={reminderDays}
              setReminderDays={setReminderDays}
              deadlineEnabled={deadlineEnabled}
              setDeadlineEnabled={setDeadlineEnabled}
              deadlineExact={deadlineExact}
              setDeadlineExact={setDeadlineExact}
              deadlineAt={deadlineAt}
              documents={documents}
              selectedDocId={selectedDocId}
              isUploading={isUploading}
              onFilesSelected={onFilesSelected}
              recipients={recipients}
              updateRecipient={updateRecipient}
              addRecipient={addRecipient}
              removeRecipient={removeRecipient}
              // handleDragEnd={handleDragEnd} // supprimé
              fields={fields}
              placing={placing}
              setPlacing={setPlacing}
              isMobileView={isMobileView}
              canPlaceSignature={canPlaceSignature}
              hasSignatureOnDoc={hasSignatureOnDoc}
              handleSubmit={handleSubmit}
              handlePlaceSignature={handlePlaceSignature}
            />
          )}
          {currentMobileTab === 'pdf' && (
            <PDFViewer
              className="h-full"
              pdfUrl={pdfUrl}
              pdfWidth={pdfWidth}
              selectedDocId={selectedDocId}
              numPagesByDoc={numPagesByDoc}
              pageDimensions={pageDimensions}
              fields={fields}
              placing={placing}
              onDocumentLoad={onDocumentLoad}
              onPageLoadSuccess={onPageLoadSuccess}
              onDocumentError={onDocumentError}
              handlePdfClick={handlePdfClick}
              onUpdateField={handleUpdateField}
              onDeleteField={handleDeleteField}
              isMobileView={isMobileView}
              pdfWrapper={pdfWrapper}
            />
          )}
          {currentMobileTab === 'documents' && (
            <DocumentsPanel
              className="h-full border-l"
              documents={documents}
              selectedDocId={selectedDocId}
              loadingDocId={loadingDocId}
              numPagesByDoc={numPagesByDoc}
              selectDocument={selectDocument}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {showLeftSidebar && (
        <RecipientsPanel
          className="w-80 border-r"
          flowType={flowType}
          setFlowType={setFlowType}
          includeQr={includeQr}
          setIncludeQr={setIncludeQr}
          reminderDays={reminderDays}
          setReminderDays={setReminderDays}
          deadlineEnabled={deadlineEnabled}
          setDeadlineEnabled={setDeadlineEnabled}
          deadlineExact={deadlineExact}
          setDeadlineExact={setDeadlineExact}
          deadlineAt={deadlineAt}
          documents={documents}
          selectedDocId={selectedDocId}
          isUploading={isUploading}
          onFilesSelected={onFilesSelected}
          recipients={recipients}
          updateRecipient={updateRecipient}
          addRecipient={addRecipient}
          removeRecipient={removeRecipient}
          // handleDragEnd={handleDragEnd} // supprimé
          fields={fields}
          placing={placing}
          setPlacing={setPlacing}
          isMobileView={isMobileView}
          canPlaceSignature={canPlaceSignature}
          hasSignatureOnDoc={hasSignatureOnDoc}
          handleSubmit={handleSubmit}
          handlePlaceSignature={handlePlaceSignature}
        />
      )}
      <PDFViewer
        pdfUrl={pdfUrl}
        pdfWidth={pdfWidth}
        selectedDocId={selectedDocId}
        numPagesByDoc={numPagesByDoc}
        pageDimensions={pageDimensions}
        fields={fields}
        placing={placing}
        onDocumentLoad={onDocumentLoad}
        onPageLoadSuccess={onPageLoadSuccess}
        onDocumentError={onDocumentError}
        handlePdfClick={handlePdfClick}
        onUpdateField={handleUpdateField}
        onDeleteField={handleDeleteField}
        isMobileView={isMobileView}
        pdfWrapper={pdfWrapper}
      />
      {showRightSidebar && (
        <DocumentsPanel
          className="w-72 border-l"
          documents={documents}
          selectedDocId={selectedDocId}
          loadingDocId={loadingDocId}
          numPagesByDoc={numPagesByDoc}
          selectDocument={selectDocument}
        />
      )}

      {/* Boutons de visibilité desktop */}
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
