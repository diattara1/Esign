import React, { useEffect, useState } from 'react';
import Table from '../components/Tables';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import logService from '../services/logService';

const DeletedEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const DocumentCell = ({ row }) => (
    <div>
      <div className="text-base font-medium text-gray-900">{row.title}</div>
      <div className="text-xs text-gray-500 mt-1">Initiateur: {row.created_by_name || 'Non spécifié'}</div>
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
    }
  ];

  return (
    <Table
      columns={columns}
      data={envelopes}
      title="Enveloppes Supprimées"
      description={`Documents annulés ou supprimés (${envelopes.length})`}
      loading={loading}
      emptyMessage="Aucune enveloppe supprimée"
    />
  );
};

export default DeletedEnvelopes;