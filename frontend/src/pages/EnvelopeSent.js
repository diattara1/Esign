import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import signatureService from '../services/signatureService';

export default function EnvelopeSent() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [envelope, setEnvelope] = useState(null);

  useEffect(() => {
    signatureService
      .getEnvelope(id)
      .then(data => setEnvelope(data))
      .catch(() => setEnvelope(null));
  }, [id]);

  if (!envelope) {
    return <div className="p-6">Chargement...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">{envelope.title}</h1>

      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Destinataires</h2>
        <ul className="list-disc list-inside space-y-1">
          {envelope.recipients?.map(r => (
            <li key={r.id}>{r.full_name} ({r.email})</li>
          ))}
        </ul>
      </div>

      {envelope.deadline_at && (
        <p className="mb-6">
          <strong>Date limite :</strong>{' '}
          {new Date(envelope.deadline_at).toLocaleDateString('fr-FR')}
        </p>
      )}

      <div className="flex space-x-4">
        <button
          onClick={() => navigate(`/signature/detail/${id}`)}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Voir le document
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
        >
          Retour au tableau de bord
        </button>
      </div>
    </div>
  );
}
