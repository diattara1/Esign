import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';

// Assurez-vous que le chemin du composant Table correspond à votre projet.
// Si vous avez nommé le fichier "Table.jsx" et exporté par défaut, importez depuis '../components/Table'.
import Table from '../components/Tables';

// Services externes
import signatureService from '../services/signatureService';
import logService from '../services/logService';

const SentEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chargement initial des enveloppes envoyées
  useEffect(() => {
    let isMounted = true;
    signatureService
      .getEnvelopes({ status: 'sent' })
      .then((res) => {
        if (!isMounted) return;
        setEnvelopes(Array.isArray(res) ? res : []);
      })
      .catch((err) => {
        logService?.error?.(err);
        toast.error('Impossible de charger les enveloppes envoyées');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Cellules de rendu --------------------------------------
  const DocumentCell = useCallback(({ row }) => {
    const recipients = Array.isArray(row?.recipients) ? row.recipients : [];
    const total = recipients.length;
    const signed = recipients.filter((r) => r?.signed).length;

    return (
      <div className="min-w-0">
        <div className="text-base font-medium text-gray-900 truncate">{row?.title || '—'}</div>
        <div className="text-xs text-gray-500 mt-1 truncate">
          Destinataires: {recipients.map((r) => r?.email).filter(Boolean).join(', ') || '—'}
        </div>
        <div className="text-xs text-gray-500">Progression: {signed}/{total} signés</div>
      </div>
    );
  }, []);

  const StatusCell = useCallback(({ value }) => {
    const normalized = (value || '').toLowerCase();
    let label = 'Envoyé';
    let badgeClass = 'bg-blue-100 text-blue-800';

    if (normalized === 'pending') {
      label = 'En cours';
      badgeClass = 'bg-yellow-100 text-yellow-800';
    } else if (normalized === 'completed' || normalized === 'signed') {
      label = 'Terminé';
      badgeClass = 'bg-green-100 text-green-800';
    } else if (normalized === 'canceled' || normalized === 'cancelled') {
      label = 'Annulé';
      badgeClass = 'bg-red-100 text-red-800';
    }

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
        {label}
      </span>
    );
  }, []);

  const DateCell = useCallback(({ value }) => {
    if (!value) return '—';
    try {
      const d = new Date(value);
      return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(d);
    } catch (_) {
      return String(value);
    }
  }, []);

  const ActionsCell = useCallback(
    ({ value, row }) => (
      <div className="flex flex-wrap gap-2">
        <Link
          to={`/signature/detail/${value}`}
          className="text-blue-600 hover:text-blue-800 text-sm"
        >
          Détails
        </Link>
        <button
          onClick={async () => {
            // Confirmation utilisateur (client-side)
            if (typeof window !== 'undefined') {
              const ok = window.confirm('Voulez-vous vraiment annuler cette enveloppe ?');
              if (!ok) return;
            }
            try {
              await signatureService.cancelEnvelope(value);
              toast.success('Enveloppe annulée');
              setEnvelopes((prev) => prev.filter((e) => e.id !== value));
            } catch (err) {
              toast.error("Échec de l'annulation");
              logService?.error?.(err);
            }
          }}
          className="text-red-600 hover:text-red-800 text-sm"
        >
          Annuler
        </button>
      </div>
    ),
    []
  );

  // Colonnes (mémoisées pour éviter des rerenders inutiles)
  const columns = useMemo(
    () => [
      {
        Header: 'Document',
        accessor: 'title',
        Cell: DocumentCell,
        headerClassName: 'w-1/2',
      },
      {
        Header: 'Envoyé le',
        accessor: 'created_at',
        Cell: DateCell,
        headerClassName: 'min-w-[160px] whitespace-nowrap',
        cellClassName: 'whitespace-nowrap',
      },
      {
        Header: 'Statut',
        accessor: 'status',
        Cell: StatusCell,
        headerClassName: 'min-w-[120px]',
      },
      {
        Header: 'Actions',
        accessor: 'id',
        Cell: ActionsCell,
        headerClassName: 'text-right',
        cellClassName: 'text-right',
      },
    ],
    [ActionsCell, DateCell, DocumentCell, StatusCell]
  );

  return (
    <div className="space-y-4">
      <Table
        columns={columns}
        data={envelopes}
        loading={loading}
        title="Enveloppes Envoyées"
        description={`Documents envoyés pour signature (${envelopes.length})`}
        emptyMessage="Aucune enveloppe envoyée"
        // Laisse Table gérer la responsivité: cartes sur mobile, tableau sur desktop
        itemsPerPage={10}
      />
    </div>
  );
};

export default SentEnvelopes;
