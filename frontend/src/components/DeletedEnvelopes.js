import React, { useEffect, useState } from 'react';
import { FiEye, FiRotateCcw, FiTrash2 } from 'react-icons/fi';
import Table from '../components/Tables';
import EmptyState from '../components/EmptyState';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import logService from '../services/logService';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';

const DeletedEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmId, setConfirmId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const data = await signatureService.getEnvelopes({ status: 'cancelled' });
        setEnvelopes(data);
      } catch (err) {
        toast.error('Échec du chargement des enveloppes supprimées');
        logService.error('Failed to fetch deleted envelopes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadEnvelopes();
  }, []);

  const handlePreview = id => {
    if (!id) return;
    navigate(`/signature/detail/${id}`);
  };

  const handleRestore = async id => {
    if (!id) return;
    try {
      await signatureService.restoreEnvelope(id);
      toast.success("Enveloppe restaurée avec succès");
      setEnvelopes(prev => prev.filter(env => env.id !== id));
    } catch (err) {
      toast.error("Échec de la restauration de l'enveloppe");
      logService.error('Failed to restore envelope:', err);
    }
  };

  const handlePurge = async id => {
    if (!id) {
      setConfirmId(null);
      return;
    }
    try {
      await signatureService.purgeEnvelope(id);
      toast.success("Enveloppe purgée définitivement");
      setEnvelopes(prev => prev.filter(env => env.id !== id));
    } catch (err) {
      toast.error("Échec de la purge de l'enveloppe");
      logService.error('Failed to purge envelope:', err);
    } finally {
      setConfirmId(null);
    }
  };

  const DocumentCell = ({ row }) => (
    <div>
      <div className="text-base font-medium text-gray-900">{row.title}</div>
      <div className="text-xs text-gray-500 mt-1">Initiateur: {row.created_by_name || 'Non spécifié'}</div>
    </div>
  );

  const ActionsCell = ({ value }) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => handlePreview(value)}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
        title="Prévisualiser"
      >
        <FiEye className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => handleRestore(value)}
        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-full transition"
        title="Restaurer"
      >
        <FiRotateCcw className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmId(value)}
        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-full transition"
        title="Purger définitivement"
      >
        <FiTrash2 className="w-4 h-4" />
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
      Header: 'Date de création',
      accessor: 'created_at',
      Cell: ({ value }) => value ? new Date(value).toLocaleDateString('fr-FR') : '-'
    },
    {
      Header: 'Statut',
      accessor: 'status',
      Cell: ({ value }) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          {value || 'Supprimé'}
        </span>
      )
    },
    {
      Header: 'Actions',
      accessor: 'id',
      Cell: ActionsCell,
      headerClassName: 'text-right w-32',
      cellClassName: 'text-right'
    }
  ];

  return (
    <>
      <Table
        columns={columns}
        data={envelopes}
        title="Enveloppes Supprimées"
        description={`Documents annulés ou supprimés (${envelopes.length})`}
        loading={loading}
        emptyState={
          <EmptyState
            message="Aucune enveloppe supprimée"
            actionLabel="Créer une enveloppe"
            onAction={() => navigate("/signature/upload")}
          />
        }
      />
      <ConfirmDialog
        isOpen={confirmId !== null}
        title="Purger l'enveloppe"
        message="Voulez-vous vraiment purger définitivement cette enveloppe ?"
        secondaryMessage="Cette action est irréversible."
        onCancel={() => setConfirmId(null)}
        onConfirm={() => handlePurge(confirmId)}
        confirmText="Purger"
      />
    </>
  );
};

export default DeletedEnvelopes;
