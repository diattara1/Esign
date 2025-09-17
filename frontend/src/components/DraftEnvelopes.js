// src/pages/signature/DraftEnvelopes.js
import React, { useEffect, useState } from 'react';
import Table from '../components/Tables';
import EmptyState from '../components/EmptyState';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { FiEdit2, FiTrash2 } from 'react-icons/fi';
import logService from '../services/logService';
import ConfirmDialog from './ConfirmDialog';

const DraftEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDocUuid, setConfirmDocUuid] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const data = await signatureService.getEnvelopes({ status: 'draft' });
        setEnvelopes(data);
      } catch (err) {
        toast.error('Échec du chargement des brouillons');
        logService.error('Failed to fetch draft envelopes:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEnvelopes();
  }, []);

  const handleEditDraft = (docUuid) => {
    navigate(`/signature/workflow/${docUuid}`);
  };

  const confirmDeleteDraft = async () => {
    if (confirmDocUuid === null) return;
    try {
      await signatureService.cancelEnvelope(confirmDocUuid);
      setEnvelopes(prev => prev.filter(env => env.doc_uuid !== confirmDocUuid));
      toast.success('Brouillon supprimé');
    } catch (err) {
      toast.error('Échec de la suppression');
      logService.error(err);
    } finally {
      setConfirmDocUuid(null);
    }
  };

  const DocumentCell = ({ row }) => (
    <div>
      <div className="text-base font-medium text-gray-900">{row.title}</div>
      <div className="text-xs text-gray-500 mt-1">Créé le: {new Date(row.created_at).toLocaleDateString('fr-FR')}</div>
    </div>
  );

  const ActionsCell = ({ value: docUuid }) => (
    <div className="flex space-x-2">
      <button
        onClick={() => handleEditDraft(docUuid)}
        className="text-blue-600 hover:text-blue-800 p-1"
        title="Modifier"
      >
        <FiEdit2 className="w-5 h-5" />
      </button>
      <button
        onClick={() => setConfirmDocUuid(docUuid)}
        className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded"
        title="Supprimer"
      >
        <FiTrash2 className="w-5 h-5" />
      </button>
    </div>
  );

  const columns = [
    {
      Header: 'Document',
      accessor: 'title',
      Cell: DocumentCell
    },
    {
      Header: 'Statut',
      accessor: 'status',
      Cell: ({ value }) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {value || 'Brouillon'}
        </span>
      )
    },
    {
      Header: 'Actions',
      accessor: 'doc_uuid',
      Cell: ActionsCell
    }
  ];

  return (
    <>
      <Table
        columns={columns}
        data={envelopes}
        title="Brouillons"
        description={`Documents en cours de préparation (${envelopes.length})`}
        loading={loading}
        emptyState={
          <EmptyState
            message="Aucun brouillon disponible"
            actionLabel="Créer une enveloppe"
            onAction={() => navigate("/signature/upload")}
          />
        }
      />
      <ConfirmDialog
        isOpen={confirmDocUuid !== null}
        title="Supprimer le brouillon"
        message="Voulez-vous vraiment supprimer ce brouillon ?"
        secondaryMessage="Cette action est irréversible."
        onCancel={() => setConfirmDocUuid(null)}
        onConfirm={confirmDeleteDraft}
      />
    </>
  );
};

export default DraftEnvelopes;
