import React, { useEffect, useState, useRef } from 'react';
import Table from '../components/Tables';
import EmptyState from '../components/EmptyState';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { FiMoreVertical, FiDownload, FiPrinter, FiTrash2, FiEye } from 'react-icons/fi';
import { CheckCircle, FileText, Calendar, User, Users } from 'lucide-react';
import slugify from 'slugify';
import { useNavigate } from "react-router-dom";
import logService from '../services/logService';
import ConfirmDialog from './ConfirmDialog';

const CompletedEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const menuButtonRef = useRef(null);

  const closeMenu = () => {
    setMenuOpenId(null);
    menuButtonRef.current?.focus();
  };

  const navigate = useNavigate();

  // Detect mobile screen
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  useEffect(() => {
    const loadEnvelopes = async () => {
      try {
        const data = await signatureService.getEnvelopes({ status: 'completed' });
        setEnvelopes(data);
      } catch (err) {
        toast.error('Échec du chargement des enveloppes');
        logService.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadEnvelopes();
  }, []);

  // Fermer le menu quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = () => {
      if (menuOpenId !== null) {
        closeMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpenId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };
    if (menuOpenId !== null) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [menuOpenId]);

  const formatDate = (dateString) => {
    if (!dateString) return { date: '-', time: '' };
    
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('fr-FR'),
      time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const handlePreview = (id) => {
    navigate(`/signature/detail/${id}`);
  };

  const handleDownload = async (id, title) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      const response = await fetch(download_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      const safeName = slugify(title, { lower: true, strict: true });
      link.download = `${safeName}_signe.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Document téléchargé avec succès');
    } catch (err) {
      toast.error('Échec du téléchargement');
      logService.error(err);
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
      logService.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await signatureService.cancelEnvelope(id);
      setEnvelopes(prev => prev.filter(env => env.id !== id));
      setMenuOpenId(null);
      toast.success('Enveloppe supprimée avec succès');
    } catch (err) {
      toast.error('Échec de la suppression');
      logService.error(err);
    } finally {
      setConfirmId(null);
    }
  };

  // Mobile Card Component
  const MobileCard = ({ envelope }) => {
    const { date, time } = formatDate(envelope.updated_at);
    const signedCount = envelope.recipients ? envelope.recipients.filter(r => r.signed).length : 0;
    const totalCount = envelope.recipients ? envelope.recipients.length : 0;

    return (
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3 shadow-sm">
        {/* Header avec titre et menu */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-600" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 leading-5">
                  {envelope.title}
                </h3>
                <div className="flex items-center text-xs text-gray-500 mt-1">
                  <User className="w-3 h-3 mr-1" />
                  <span className="truncate">
                    Initiateur: {envelope.created_by_name || 'Non spécifié'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Menu Actions */}
          <div className="relative ml-2">
            <button
              onClick={e => {
                e.stopPropagation();
                if (menuOpenId === envelope.id) {
                  closeMenu();
                } else {
                  menuButtonRef.current = e.currentTarget;
                  setMenuOpenId(envelope.id);
                }
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiMoreVertical className="w-4 h-4 text-gray-500" />
            </button>
            
            {menuOpenId === envelope.id && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(envelope.id);
                      closeMenu();
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <FiEye className="mr-3 w-4 h-4" /> 
                    Prévisualiser
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(envelope.id, envelope.title);
                      closeMenu();
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <FiDownload className="mr-3 w-4 h-4" /> 
                    Télécharger PDF
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePrint(envelope.id);
                      closeMenu();
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    <FiPrinter className="mr-3 w-4 h-4" /> 
                    Imprimer
                  </button>
                  <div className="border-t border-gray-100 my-1"></div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmId(envelope.id);
                      closeMenu();
                    }}
                    className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <FiTrash2 className="mr-3 w-4 h-4" /> 
                    Supprimer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status et signatures */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              <CheckCircle className="w-3 h-3 mr-1" />
              Complété
            </span>
          </div>
          
          <div className="flex items-center text-xs text-gray-500">
            <Users className="w-3 h-3 mr-1" />
            <span>{signedCount}/{totalCount} signatures</span>
          </div>
        </div>

        {/* Date */}
        <div className="flex items-center text-xs text-gray-500 pt-2 border-t border-gray-100">
          <Calendar className="w-3 h-3 mr-1" />
          <span>Complété le {date} à {time}</span>
        </div>
      </div>
    );
  };

  // Desktop Table Components
  const DocumentCell = ({ row }) => {
    return (
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-1">
          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-blue-600" />
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
  };

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
    
    const { date, time } = formatDate(value);
    return (
      <div className="flex items-center text-sm text-gray-700">
        <Calendar className="w-4 h-4 mr-2 text-gray-400" />
        <div>
          <div>{date}</div>
          <div className="text-xs text-gray-500">{time}</div>
        </div>
      </div>
    );
  };

  const ActionsCell = ({ value: id, row }) => (
    <div className="relative inline-block">
      <button
        onClick={e => {
          e.stopPropagation();
          if (menuOpenId === id) {
            closeMenu();
          } else {
            menuButtonRef.current = e.currentTarget;
            setMenuOpenId(id);
          }
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
                closeMenu();
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
                closeMenu();
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
                closeMenu();
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
                setConfirmId(id);
                closeMenu();
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

  if (loading) {
    return (
      <div className="space-y-6">
        {/* Header Skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
          <div className="animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
        
        {/* Content Skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header avec statistiques - Responsive */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Enveloppes Complétées
            </h1>
            <p className="text-gray-600 text-sm sm:text-base mt-1">
              Documents signés et finalisés
            </p>
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

      {/* Content - Mobile vs Desktop */}
      {envelopes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <EmptyState
            message="Aucune enveloppe complétée trouvée"
            actionLabel="Créer une enveloppe"
            onAction={() => navigate("/signature/upload")}
          />
        </div>
      ) : (
        <>
          {isMobile ? (
            /* Mobile: Cards Layout */
            <div className="space-y-4">
              {envelopes.map((envelope) => (
                <MobileCard key={envelope.id} envelope={envelope} />
              ))}
            </div>
          ) : (
            /* Desktop: Table Layout */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <Table
                columns={columns}
                data={envelopes}
                loading={loading}
                emptyState={
                  <EmptyState
                    message="Aucune enveloppe complétée trouvée"
                    actionLabel="Créer une enveloppe"
                    onAction={() => navigate("/signature/upload")}
                  />
                }
                containerClassName="rounded-lg"
                tableClassName="min-w-full"
                rowClassName="hover:bg-gray-50 transition-colors cursor-pointer"
              />
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={confirmId !== null}
        title="Supprimer l'enveloppe"
        message="Voulez-vous vraiment supprimer cette enveloppe complétée ?"
        secondaryMessage="Cette action est irréversible."
        onCancel={() => setConfirmId(null)}
        onConfirm={() => handleDelete(confirmId)}
      />
    </div>
  );
};

export default CompletedEnvelopes;