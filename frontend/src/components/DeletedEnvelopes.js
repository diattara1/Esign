import React, { useEffect, useState } from 'react';
import { FiEye, FiRotateCcw, FiTrash2 } from 'react-icons/fi';
import Table from '../components/Tables';
import EmptyState from '../components/EmptyState';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import logService from '../services/logService';
import { useNavigate } from 'react-router-dom';
import ConfirmDialog from './ConfirmDialog';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const diffEnJours = (dateA, dateB) => {
  if (dateA == null || dateB == null) return null;

  const timeA = typeof dateA === 'number' ? dateA : new Date(dateA).getTime();
  const timeB = typeof dateB === 'number' ? dateB : new Date(dateB).getTime();

  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return null;

  const diffMs = Math.max(0, timeA - timeB);
  return Math.floor(diffMs / MS_PER_DAY);
};

const computeJoursRestants = cancelledAt => {
  const diff = diffEnJours(Date.now(), cancelledAt);
  if (diff === null) return null;
  return 10 - diff;
};

const DeletedEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDocUuid, setConfirmDocUuid] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const data = await signatureService.getEnvelopes({ status: 'cancelled' });
        setEnvelopes(Array.isArray(data) ? data : []);
      } catch (err) {
        toast.error('Échec du chargement des enveloppes supprimées');
        logService.error('Failed to fetch deleted envelopes:', err);
      } finally {
        setLoading(false);
      }
    };
    loadEnvelopes();
  }, []);

  const handlePreview = docUuid => {
    if (!docUuid) return;
    navigate(`/signature/detail/${docUuid}`);
  };

  const handleRestore = async docUuid => {
    if (!docUuid) return;
    try {
      await signatureService.restoreEnvelope(docUuid);
      toast.success("Enveloppe restaurée avec succès");
      setEnvelopes(prev => prev.filter(env => env.doc_uuid !== docUuid));
    } catch (err) {
      toast.error("Échec de la restauration de l'enveloppe");
      logService.error('Failed to restore envelope:', err);
    }
  };

  const handlePurge = async docUuid => {
    if (!docUuid) {
      setConfirmDocUuid(null);
      return;
    }
    try {
      await signatureService.purgeEnvelope(docUuid);
      toast.success("Enveloppe purgée définitivement");
      setEnvelopes(prev => prev.filter(env => env.doc_uuid !== docUuid));
    } catch (err) {
      toast.error("Échec de la purge de l'enveloppe");
      logService.error('Failed to purge envelope:', err);
    } finally {
      setConfirmDocUuid(null);
    }
  };

  const DocumentCell = ({ row }) => (
    <div>
      <div className="text-base font-medium text-gray-900">{row.title}</div>
      <div className="text-xs text-gray-500 mt-1">Initiateur: {row.created_by_name || 'Non spécifié'}</div>
    </div>
  );

  const ActionsCell = ({ value: docUuid }) => (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => handlePreview(docUuid)}
        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-full transition"
        title="Prévisualiser"
      >
        <FiEye className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => handleRestore(docUuid)}
        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-full transition"
        title="Restaurer"
      >
        <FiRotateCcw className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => setConfirmDocUuid(docUuid)}
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
      Header: 'Jours restants',
      accessor: 'cancelled_at',
      headerClassName: 'text-center w-40',
      cellClassName: 'text-center',
      Cell: ({ value }) => {
        const remaining = computeJoursRestants(value);

        if (remaining === null) {
          return <span className="text-gray-400">-</span>;
        }

        const isUrgent = remaining <= 1;
        const safeRemaining = Math.max(0, remaining);
        const badgeClasses = isUrgent
          ? 'bg-red-100 text-red-800'
          : 'bg-gray-100 text-gray-800';
        const plural = safeRemaining > 1 ? 's' : '';
        const tooltip = isUrgent
          ? 'Purge automatique imminente'
          : `Purge automatique dans ${safeRemaining} jour${plural}`;

        return (
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeClasses}`}
            title={tooltip}
          >
            {safeRemaining}
          </span>
        );
      }
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
      accessor: 'doc_uuid',
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
        rowClassName={row => {
          const remaining = computeJoursRestants(row.cancelled_at);
          if (remaining !== null && remaining <= 1) {
            return 'bg-red-50 hover:bg-red-100 transition-colors';
          }
          return 'hover:bg-gray-50 transition-colors';
        }}
        emptyState={
          <EmptyState
            message="Aucune enveloppe supprimée"
            actionLabel="Créer une enveloppe"
            onAction={() => navigate("/signature/upload")}
          />
        }
      />
      <ConfirmDialog
        isOpen={confirmDocUuid !== null}
        title="Purger l'enveloppe"
        message="Voulez-vous vraiment purger définitivement cette enveloppe ?"
        secondaryMessage="Cette action est irréversible."
        onCancel={() => setConfirmDocUuid(null)}
        onConfirm={() => handlePurge(confirmDocUuid)}
        confirmText="Purger"
      />
    </>
  );
};

export default DeletedEnvelopes;
