import React, { useEffect, useState, useRef } from 'react';
import Table from '../components/Tables';
import EmptyState from '../components/EmptyState';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import { FiMoreVertical, FiDownload, FiPrinter, FiTrash2, FiEye, FiSearch, FiX } from 'react-icons/fi';
import { CheckCircle, FileText, Calendar, User, Users } from 'lucide-react';
import slugify from 'slugify';
import { useNavigate } from "react-router-dom";
import logService from '../services/logService';
import ConfirmDialog from './ConfirmDialog';

const CompletedEnvelopes = () => {
  const [envelopes, setEnvelopes] = useState([]);
  const [filteredEnvelopes, setFilteredEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menuOpenDocUuid, setMenuOpenDocUuid] = useState(null);
  const [confirmDocUuid, setConfirmDocUuid] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const menuButtonRef = useRef(null);
  const searchInputRef = useRef(null);

  const closeMenu = () => {
    setMenuOpenDocUuid(null);
    menuButtonRef.current?.focus();
  };

  const navigate = useNavigate();

  // Search functionality
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredEnvelopes(envelopes);
    } else {
      const filtered = envelopes.filter(envelope => {
        const searchLower = searchTerm.toLowerCase();
        return (
          envelope.title?.toLowerCase().includes(searchLower) ||
          envelope.created_by_name?.toLowerCase().includes(searchLower)
        );
      });
      setFilteredEnvelopes(filtered);
    }
  }, [searchTerm, envelopes]);

  const clearSearch = () => {
    setSearchTerm('');
    searchInputRef.current?.focus();
  };

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
        setFilteredEnvelopes(data);
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
      if (menuOpenDocUuid !== null) {
        closeMenu();
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpenDocUuid]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    };
    if (menuOpenDocUuid !== null) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [menuOpenDocUuid]);

  const formatDate = (dateString) => {
    if (!dateString) return { date: '-', time: '' };
    
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('fr-FR'),
      time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    };
  };

  const handlePreview = (docUuid) => {
    navigate(`/signature/detail/${docUuid}`);
  };

  const handleDownload = async (docUuid, title) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(docUuid);
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

  const handlePrint = async (docUuid) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(docUuid);
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

  const handleDelete = async (docUuid) => {
    try {
      await signatureService.cancelEnvelope(docUuid);
      setEnvelopes(prev => prev.filter(env => env.doc_uuid !== docUuid));
      setFilteredEnvelopes(prev => prev.filter(env => env.doc_uuid !== docUuid));
      setMenuOpenDocUuid(null);
      toast.success('Enveloppe supprimée avec succès');
    } catch (err) {
      toast.error('Échec de la suppression');
      logService.error(err);
    } finally {
      setConfirmDocUuid(null);
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
                if (menuOpenDocUuid === envelope.doc_uuid) {
                  closeMenu();
                } else {
                  menuButtonRef.current = e.currentTarget;
                  setMenuOpenDocUuid(envelope.doc_uuid);
                }
              }}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiMoreVertical className="w-4 h-4 text-gray-500" />
            </button>
            
            {menuOpenDocUuid === envelope.doc_uuid && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                <div className="py-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(envelope.doc_uuid);
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
                      handleDownload(envelope.doc_uuid, envelope.title);
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
                      handlePrint(envelope.doc_uuid);
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
                      setConfirmDocUuid(envelope.doc_uuid);
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

  const ActionsCell = ({ value: docUuid, row }) => (
    <div className="relative inline-block">
      <button
        onClick={e => {
          e.stopPropagation();
          if (menuOpenDocUuid === docUuid) {
            closeMenu();
          } else {
            menuButtonRef.current = e.currentTarget;
            setMenuOpenDocUuid(docUuid);
          }
        }}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <FiMoreVertical className="w-5 h-5 text-gray-600" />
      </button>
      {menuOpenDocUuid === docUuid && (
        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
          <div className="py-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePreview(docUuid);
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
                handleDownload(docUuid, row.title);
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
                handlePrint(docUuid);
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
                setConfirmDocUuid(docUuid);
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
        
        {/* Search Skeleton */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="animate-pulse">
            <div className="h-12 bg-gray-200 rounded"></div>
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

      {/* Search Bar - Responsive */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="relative">
          <div className={`relative transition-all duration-200 ${
            isSearchFocused ? 'ring-2 ring-blue-500 ring-opacity-50' : ''
          }`}>
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FiSearch className={`w-4 h-4 transition-colors ${
                isSearchFocused ? 'text-blue-500' : 'text-gray-400'
              }`} />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Rechercher par titre ou initiateur..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-0 transition-colors"
            />
            {searchTerm && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button
                  onClick={clearSearch}
                  className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          {/* Search Results Counter */}
          {searchTerm && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="text-sm text-gray-600">
                {filteredEnvelopes.length === 0 ? (
                  <span className="text-orange-600">Aucun résultat trouvé</span>
                ) : (
                  <span>
                    <span className="font-medium">{filteredEnvelopes.length}</span> résultat{filteredEnvelopes.length > 1 ? 's' : ''} trouvé{filteredEnvelopes.length > 1 ? 's' : ''}
                    {filteredEnvelopes.length !== envelopes.length && (
                      <span className="text-gray-500"> sur {envelopes.length} total{envelopes.length > 1 ? 's' : ''}</span>
                    )}
                  </span>
                )}
              </div>
              {searchTerm && (
                <button
                  onClick={clearSearch}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Effacer la recherche
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content - Mobile vs Desktop */}
      {filteredEnvelopes.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <EmptyState
            message={searchTerm ? "Aucun résultat trouvé pour votre recherche" : "Aucune enveloppe complétée trouvée"}
            actionLabel={searchTerm ? "Effacer la recherche" : "Créer une enveloppe"}
            onAction={searchTerm ? clearSearch : () => navigate("/signature/upload")}
          />
        </div>
      ) : (
        <>
          {isMobile ? (
            /* Mobile: Cards Layout */
            <div className="space-y-4">
              {filteredEnvelopes.map((envelope) => (
                <MobileCard key={envelope.doc_uuid} envelope={envelope} />
              ))}
            </div>
          ) : (
            /* Desktop: Table Layout */
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <Table
                columns={columns}
                data={filteredEnvelopes}
                loading={loading}
                emptyState={
                  <EmptyState
                    message={searchTerm ? "Aucun résultat trouvé pour votre recherche" : "Aucune enveloppe complétée trouvée"}
                    actionLabel={searchTerm ? "Effacer la recherche" : "Créer une enveloppe"}
                    onAction={searchTerm ? clearSearch : () => navigate("/signature/upload")}
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
        isOpen={confirmDocUuid !== null}
        title="Supprimer l'enveloppe"
        message="Voulez-vous vraiment supprimer cette enveloppe complétée ?"
        secondaryMessage="Cette action est irréversible."
        onCancel={() => setConfirmDocUuid(null)}
        onConfirm={() => handleDelete(confirmDocUuid)}
      />
    </div>
  );
};

export default CompletedEnvelopes;