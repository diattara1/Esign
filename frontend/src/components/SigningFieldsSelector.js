import React, { useState, useEffect, useRef } from 'react';
import { Document, Page } from 'react-pdf';
import { toast } from 'react-toastify';

export default function SigningFieldsSelector({ fileUrl, onChange, recipients, fields }) {
  const [numPages, setNumPages] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedFieldType, setSelectedFieldType] = useState('signature');
  const [selectedRecipientId, setSelectedRecipientId] = useState(recipients[0]?.email || '');
  const canvasRef = useRef(null);

  useEffect(() => {
    if (fields) {
      onChange(fields);
    }
  }, [fields, onChange]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const addField = (e) => {
    if (!selectedRecipientId) {
      toast.error('Veuillez sélectionner un destinataire');
      return;
    }
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = rect.top + rect.height - (e.clientY - rect.top); // Inverser y pour correspondre au système PDF
    const newField = {
      page: currentPage,
      position: { x, y, width: 150, height: 30 },
      field_type: selectedFieldType,
      recipient_id: selectedRecipientId,
      name: `${selectedFieldType}_${Date.now()}`,
      required: true
    };
    const updated = [...fields, newField];
    onChange(updated);
  };

  const removeField = (index) => {
    const updated = fields.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="border p-4 mb-6 bg-white rounded-lg shadow-md">
      <h3 className="text-lg font-semibold mb-4">Ajouter des champs de signature</h3>
      <div className="mb-4 flex space-x-4">
        <select
          value={selectedFieldType}
          onChange={e => setSelectedFieldType(e.target.value)}
          className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="signature">Signature</option>
          <option value="date">Date</option>
          <option value="text">Texte</option>
          <option value="checkbox">Case à cocher</option>
          <option value="initial">Initiales</option>
        </select>
        <select
          value={selectedRecipientId}
          onChange={e => setSelectedRecipientId(e.target.value)}
          className="border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">-- Sélectionnez un destinataire --</option>
          {recipients.map(r => (
            <option key={r.email} value={r.email}>{r.full_name} ({r.email})</option>
          ))}
        </select>
      </div>
      <div className="relative inline-block">
        <Document file={fileUrl} onLoadSuccess={onDocumentLoadSuccess}>
          <div ref={canvasRef}>
            <Page
              pageNumber={currentPage}
              width={600}
              onClick={addField}
              className="cursor-crosshair border border-gray-300"
            />
          </div>
        </Document>
        {fields
          .filter(f => f.page === currentPage)
          .map((f, i) => (
            <div
              key={i}
              className="absolute bg-blue-200 border border-blue-500 opacity-75"
              style={{ top: f.position.y - f.position.height, left: f.position.x, width: f.position.width, height: f.position.height }}
            >
              <small className="block text-center text-xs">{f.field_type}</small>
              <button
                onClick={() => removeField(i)}
                className="absolute top-0 right-0 bg-red-500 text-white text-xs w-4 h-4 flex items-center justify-center"
              >
                X
              </button>
            </div>
          ))}
      </div>
      {numPages > 1 && (
        <div className="mt-4 flex justify-between">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            disabled={currentPage === 1}
          >
            Précédent
          </button>
          <span>Page {currentPage} sur {numPages}</span>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            disabled={currentPage === numPages}
          >
            Suivant
          </button>
        </div>
      )}
    </div>
  );
}