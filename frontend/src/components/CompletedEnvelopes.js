import React, { useEffect, useState } from 'react';
import Table from '../components/Tables';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { FiMoreVertical, FiDownload, FiPrinter, FiTrash2, FiEye } from 'react-icons/fi';
import { CheckCircle, FileText, Calendar, User } from 'lucide-react';
import slugify from 'slugify';
import { useNavigate } from "react-router-dom";



const CompletedEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState(null);

  useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const data = await signatureService.getEnvelopes({ status: 'completed' });
        console.log('Envelopes data:', data); // Debug pour voir la structure
        setEnvelopes(data);
      } catch (err) {
        toast.error('Échec du chargement des enveloppes');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadEnvelopes();
  }, []);
const navigate = useNavigate();
  // Fermer le menu quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const DocumentCell = ({ row }) => (
    console.log('Envelopes datas:', row),
    <div className="flex items-start space-x-3">
      <div className="flex-shrink-0">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <FileText className="w-5 h-5 text-green-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900 truncate">{row.title}</div>
        <div className="flex items-center text-xs text-gray-500 mt-1">
          <User className="w-3 h-3 mr-1" />
          <span>Initiateur: {row.created_by_name || 'Non spécifié'}</span>
        </div>
      </div>
    </div>
  );

  const StatusCell = ({ value, row }) => (
    <div className="flex items-center space-x-2">
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <CheckCircle className="w-3 h-3 mr-1" />
        Complété
      </span>
      <div className="text-xs text-gray-500">
        {row.recipients ? `${row.recipients.filter(r => r.signed).length}/${row.recipients.length} signatures` : ''}
      </div>
    </div>
  );

  const DateCell = ({ value }) => {
    if (!value) return <span className="text-gray-400">-</span>;
    
    const date = new Date(value);
    return (
      <div className="flex items-center text-sm text-gray-700">
        <Calendar className="w-4 h-4 mr-2 text-gray-400" />
        <div>
          <div>{date.toLocaleDateString('fr-FR')}</div>
          <div className="text-xs text-gray-500">{date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    );
  };

  // Preview du document déchiffré dans un nouvel onglet
  const handlePreview = (id) => {
    navigate(`/signature/detail/${id}`);
  };

  // Téléchargement du document déchiffré avec nom approprié
  const handleDownload = async (id, title) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      const response = await fetch(download_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Utiliser slugify pour créer un nom de fichier sûr
      const safeName = slugify(title, { lower: true, strict: true });
      link.download = `${safeName}_signe.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Document téléchargé avec succès');
    } catch (err) {
      toast.error('Échec du téléchargement');
      console.error(err);
    }
  };

  const handlePrint = async (id) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      const printWindow = window.open(download_url, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
        toast.success('Ouverture de l\'impression');
      }
    } catch (err) {
      toast.error('Échec de l\'impression');
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Voulez-vous vraiment supprimer cette enveloppe complétée ?')) return;
    try {
      await signatureService.cancelEnvelope(id);
      setEnvelopes(prev => prev.filter(env => env.id !== id));
      setMenuOpenId(null);
      toast.success('Enveloppe supprimée avec succès');
    } catch (err) {
      toast.error('Échec de la suppression');
      console.error(err);
    }
  };

  const ActionsCell = ({ value: id, row }) => (
    <div className="relative inline-block">
      <button
        onClick={e => { 
          e.stopPropagation(); 
          setMenuOpenId(menuOpenId === id ? null : id); 
        }}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <FiMoreVertical className="w-5 h-5 text-gray-600" />
      </button>
      {menuOpenId === id && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <div className="py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(id);
                setMenuOpenId(null);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FiEye className="mr-3 w-4 h-4" /> 
              Prévisualiser
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(id, row.title);
                setMenuOpenId(null);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FiDownload className="mr-3 w-4 h-4" /> 
              Télécharger PDF
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrint(id);
                setMenuOpenId(null);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <FiPrinter className="mr-3 w-4 h-4" /> 
              Imprimer
            </button>
            <div className="border-t border-gray-100 my-1"></div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(id);
              }}
              className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <FiTrash2 className="mr-3 w-4 h-4" /> 
              Supprimer
            </button>
          </div>
        </div>
      )}
    </div>
  );

  const columns = [
    {
      Header: 'Document',
      accessor: 'title',
      Cell: DocumentCell,
      cellClassName: 'whitespace-nowrap'
    },
    {
      Header: 'Statut',
      accessor: 'status',
      Cell: StatusCell,
      cellClassName: 'whitespace-nowrap'
    },
    {
      Header: 'Date de completion',
      accessor: 'updated_at',
      Cell: DateCell,
      cellClassName: 'whitespace-nowrap'
    },
    {
      Header: 'Actions',
      accessor: 'id',
      Cell: ActionsCell,
      cellClassName: 'text-right whitespace-nowrap'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header avec statistiques */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Enveloppes Complétées</h1>
            <p className="text-gray-600 mt-1">Documents signés et finalisés</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{envelopes.length}</div>
              <div className="text-sm text-gray-500">Total</div>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <Table
          columns={columns}
          data={envelopes}
          loading={loading}
          emptyMessage="Aucune enveloppe complétée trouvée"
          containerClassName="rounded-lg "
          tableClassName="min-w-full"
          rowClassName="hover:bg-gray-50 transition-colors cursor-pointer"
        />
      </div>
    </div>
  );
};

export default CompletedEnvelopes;