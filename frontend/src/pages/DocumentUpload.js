import { useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { FiUpload, FiFileText } from 'react-icons/fi';
import logService from '../services/logService';
import { documentUploadSchema } from '../validation/schemas';
import useKeyboardActions from '../hooks/useKeyboardActions';

const DocumentUpload = () => {
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();

  const handleKeyDown = useKeyboardActions({ onEnter: handleSubmit });

  const handleFileChange = async (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    try {
      await documentUploadSchema.validate(
        { title, files: selectedFiles },
        { abortEarly: false }
      );
      setErrors((prev) => ({ ...prev, files: undefined }));
    } catch (err) {
      const fileErr = err.inner.find((er) => er.path === 'files');
      setErrors((prev) => ({ ...prev, files: fileErr?.message }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await documentUploadSchema.validate(
        { title, files },
        { abortEarly: false }
      );
    } catch (err) {
      const newErrors = {};
      err.inner.forEach((e) => {
        newErrors[e.path] = e.message;
      });
      setErrors(newErrors);
      return;
    }

    const formData = new FormData();
    formData.append('title', title);
    files.forEach((f) => formData.append('files', f));
    formData.append('status', 'draft');

    try {
      const response = await signatureService.createEnvelope(formData);
      toast.success('Document téléversé avec succès');
      navigate(`/signature/workflow/${response.id}`);
    } catch (error) {
      logService.error('Erreur lors du téléversement:', error);
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

        <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titre du document</label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              placeholder="Ex: Contrat de partenariat"
              className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-600">{errors.title}</p>
            )}
          </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fichier (PDF uniquement)</label>
              <input
                type="file"
                onChange={handleFileChange}
                accept=".pdf"
                multiple
                className="w-full border border-gray-300 px-4 py-2 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-gray-50"
              />
              {errors.files && (
                <p className="mt-1 text-sm text-red-600">{errors.files}</p>
              )}
              {files.length > 0 && (
                <ul className="mt-2 text-sm text-green-600 list-disc list-inside">
                  {files.map((f) => (
                    <li key={f.name}>{f.name}</li>
                  ))}
                </ul>
              )}
            </div>

            <button
              type="submit"
              disabled={!documentUploadSchema.isValidSync({ title, files })}
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
