import React, { useEffect, useState } from 'react';
import Table from '../components/Tables';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';

const SentEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);

  useEffect(() => {
    signatureService.getEnvelopes({ status: 'sent' })
      .then(setEnvelopes)
      .catch(err => {
        console.error(err);
        toast.error("Impossible de charger les enveloppes envoyées");
      });
  }, []);

  const DocumentCell = ({ row }) => (
    <div>
      <div className="text-base font-medium text-gray-900">{row.title}</div>
      <div className="text-xs text-gray-500 mt-1">Destinataires: {row.recipients.map(r => r.email).join(', ')}</div>
    </div>
  );

  const columns = [
    {
      Header: 'Document',
      accessor: 'title',
      Cell: DocumentCell
    },
    {
      Header: 'Envoyé le',
      accessor: 'created_at',
      Cell: ({ value }) => new Date(value).toLocaleString()
    },
    {
      Header: 'Statut',
      accessor: 'status',
      Cell: ({ value }) => (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          {value || 'Envoyé'}
        </span>
      )
    },
    {
      Header: 'Actions',
      accessor: 'id',
      Cell: ({ value, row }) => (
        <div className="flex space-x-2">
          <Link
            to={`/signature/detail/${value}`}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            Détails
          </Link>
          <button
            onClick={() => {
              signatureService.cancelEnvelope(value)
                .then(() => {
                  toast.success('Enveloppe annulée');
                  setEnvelopes(envelopes.filter(e => e.id !== value));
                })
                .catch(() => toast.error('Échec de l\'annulation'));
            }}
            className="text-red-600 hover:text-red-800 text-sm"
          >
            Annuler
          </button>
        </div>
      )
    }
  ];

  return (
    <Table
      columns={columns}
      data={envelopes}
      title="Enveloppes Envoyées"
      description={`Documents envoyés pour signature (${envelopes.length})`}
      emptyMessage="Aucune enveloppe envoyée"
    />
  );
};

export default SentEnvelopes;