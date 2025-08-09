import React, { useEffect, useState } from 'react';
import Table from '../components/Tables';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

const ActionRequiredEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const data = await signatureService.getActionRequiredEnvelopes();
        setEnvelopes(data);
      } catch (err) {
        toast.error("Impossible de charger les actions requises");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadEnvelopes();
  }, []);

  const DocumentCell = ({ row }) => (
    <div>
      <div className="text-base font-medium text-gray-900">{row.title}</div>
      <div className="text-xs text-gray-500 mt-1">Initiateur: {row.created_by_name}</div>
    </div>
  );

  const columns = [
    {
      Header: 'Document',
      accessor: 'title',
      Cell: DocumentCell
    },
    {
      Header: 'Reçu le',
      accessor: 'created_at',
      Cell: ({ value }) => value ? new Date(value).toLocaleDateString('fr-FR') : '-'
    },
    {
      Header: 'Statut',
      accessor: 'status',
      Cell: ({ value }) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          {value || 'En attente'}
        </span>
      )
    },
    {
      Header: 'Actions',
      accessor: 'id',
      Cell: ({ value }) => (
        <button
          onClick={() => navigate(`/signature/sign/${value}`)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none"
        >
          Signer
        </button>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      data={envelopes}
      title="Actions Requises"
      description={`${envelopes.length} documents nécessitent votre signature`}
      loading={loading}
      emptyMessage="Aucune action requise pour le moment"
    />
  );
};

export default ActionRequiredEnvelopes;