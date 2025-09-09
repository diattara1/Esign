import React from 'react';
import { Document, Page } from 'react-pdf';
import useResponsivePdf from '../hooks/useResponsivePdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

export default function PdfViewer({
  isGuest,
  otpVerified,
  pdfUrl,
  numPages,
  pageDims,
  onDocumentLoad,
  onPageLoadSuccess,
  currentFields,
  openFieldModal,
  isMobile,
  viewerWidth
}) {
  const { pageWidth, pageScale } = useResponsivePdf(viewerWidth, pageDims, isMobile);
  const canShowPdf = ((!isGuest) || otpVerified) && pdfUrl;

  if (!canShowPdf) {
    return (
      <div className="text-center text-gray-600 p-8">
        {isGuest && !otpVerified ? (
          <>
            <p className="text-lg mb-2">📄 PDF protégé</p>
            <p>Veuillez vérifier votre code OTP pour afficher le document.</p>
          </>
        ) : (
          <>
            <p className="text-lg mb-2">⏳ Chargement du document…</p>
            <p>Veuillez patienter.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <Document
      key={String(pdfUrl || 'empty')}
      file={pdfUrl}
      onLoadSuccess={onDocumentLoad}
      loading={<div className="text-center p-8"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>Chargement PDF…</div>}
      error={<div className="text-center text-red-600 p-8">Erreur de chargement PDF.</div>}
    >
      {numPages > 0 && Array.from({ length: numPages }, (_, i) => {
        const n = i + 1;
        const s = pageScale(n);
        const fields = currentFields.filter((f) => f.page === n);

        return (
          <div key={n} className="relative mb-6">
            <div className="relative" style={{ width: '100%', maxWidth: pageWidth, margin: '0 auto' }}>
              <Page
                pageNumber={n}
                width={pageWidth}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(p) => onPageLoadSuccess(n, p)}
                className="border border-gray-200 rounded-lg shadow-sm"
              />
              <div className="absolute top-0 left-1/2 -translate-x-1/2" style={{ width: pageWidth, height: (pageDims[n]?.height || 0) * s }}>
                {fields.map((field) => (
                  <button
                    key={field.id}
                    onClick={field.editable ? () => openFieldModal(field) : undefined}
                    title={field.editable ? 'Cliquer pour signer' : 'Champ non éditable'}
                    className={`absolute flex items-center justify-center text-[11px] font-semibold border-2 rounded ${field.signed ? 'border-green-500 bg-green-100' : 'border-red-500 bg-red-100 hover:bg-red-200'} ${field.editable ? 'focus:outline-none focus:ring-2 focus:ring-blue-500' : ''}`}
                    style={{
                      top: field.position.y * s,
                      left: field.position.x * s,
                      width: field.position.width * s,
                      height: field.position.height * s,
                    }}
                  >
                    {field.signed ? (() => {
                      const raw = field.signature_data; const match = raw?.match(/data:image\/[\w.+-]+;base64,[^\"']+/); const src = match ? match[0] : ''; return src ? <img src={src} alt="signature" className="max-w-full max-h-full object-contain" /> : 'Signé';
                    })() : 'Signer'}
                  </button>
                ))}
              </div>
              <div className="absolute bottom-2 right-2 bg-gray-900/75 text-white text-xs px-2 py-1 rounded">Page {n}/{numPages}</div>
            </div>
          </div>
        );
      })}
    </Document>
  );
}
