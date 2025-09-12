import { useNavigate } from 'react-router-dom';
import React, { useState } from 'react';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { FiUpload, FiFileText } from 'react-icons/fi';
import logService from '../services/logService';
import { documentUploadSchema } from '../validation/schemas';
import Modal from 'react-modal';
import Dropzone from '../components/Dropzone';

const DocumentUpload = () => {
  const [files, setFiles] = useState([]);
  const [title, setTitle] = useState('');
  const [errors, setErrors] = useState({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const navigate = useNavigate();

  const formatFileSize = (size) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let index = 0;
    let fileSize = size;
    while (fileSize >= 1024 && index < units.length - 1) {
      fileSize /= 1024;
      index++;
    }
    return `${fileSize.toFixed(2)} ${units[index]}`;
  };

  const handleFilesChange = async (selectedFiles) => {
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

  const removeFile = (idx) => {
    const updatedFiles = files.filter((_, i) => i !== idx);
    handleFilesChange(updatedFiles);
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
    <>
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
              <Dropzone onFiles={handleFilesChange} accept=".pdf" />
              {errors.files && (
                <p className="mt-1 text-sm text-red-600">{errors.files}</p>
              )}
              {files.length > 0 && (
                <div className="mt-2 text-sm text-green-600">
                  {files.length} fichier(s) sélectionné(s)
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="ml-2 text-blue-600 underline"
                  >
                    Voir les fichiers
                  </button>
                </div>
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

    <Modal
      isOpen={isModalOpen}
      onRequestClose={() => setIsModalOpen(false)}
      ariaHideApp={false}
      style={{
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        },
        content: {
          inset: 'auto',
          position: 'relative',
          border: 'none',
          background: 'white',
          borderRadius: '8px',
          padding: '20px',
          width: '100%',
          maxWidth: '400px',
          maxHeight: '80vh',
          overflow: 'auto',
        },
      }}
    >
      <h2 className="text-lg font-bold mb-4">Fichiers sélectionnés</h2>
      <ul className="list-disc list-inside mb-4">
        {files.map((f, idx) => (
          <li key={f.name} className="flex justify-between items-center">
            <span>{`${f.name} (${formatFileSize(f.size)})`}</span>
            <button
              type="button"
              onClick={() => removeFile(idx)}
              className="text-red-600 hover:underline ml-2"
            >
              Supprimer
            </button>
          </li>
        ))}
      </ul>
      <button
        onClick={() => setIsModalOpen(false)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
      >
        Fermer
      </button>
    </Modal>
    </>
  );
};

export default DocumentUpload;
