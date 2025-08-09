import { useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { FiUpload, FiFileText } from 'react-icons/fi';

const DocumentUpload = () => {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.size === 0) {
        toast.error('Le fichier sélectionné est vide');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error('Le fichier est trop volumineux (max 10MB)');
        return;
      }
      if (!selectedFile.name.toLowerCase().endsWith('.pdf')) {
        toast.error('Seuls les fichiers PDF sont autorisés');
        return;
      }
      setFile(selectedFile);
    } else {
      setFile(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file || !title) {
      toast.error('Veuillez fournir un titre et un fichier valide');
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    formData.append('document_file', file);
    formData.append('status', 'draft');

    try {
      const response = await signatureService.createEnvelope(formData);
      toast.success('Document téléversé avec succès');
      navigate(`/signature/workflow/${response.id}`);
    } catch (error) {
      console.error('Erreur lors du téléversement:', error);
      toast.error(error.response?.data?.detail || 'Erreur lors du téléversement du document');
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
          <FiFileText className="text-blue-500" />
          Téléverser un document
        </h1>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre du document</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Contrat de partenariat"
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fichier (PDF uniquement)</label>
            <input
              type="file"
              onChange={handleFileChange}
              accept=".pdf"
              className="w-full border border-gray-300 px-4 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              required
            />
            {file && (
              <p className="mt-2 text-sm text-green-600">
                Fichier sélectionné : <strong>{file.name}</strong>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!file || !title}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiUpload />
            Téléverser
          </button>
        </form>
      </div>
    </div>
  );
};

export default DocumentUpload;
