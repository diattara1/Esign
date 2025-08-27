import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SignatureNavbar from '../components/SignatureNavbar';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import slugify from 'slugify';
import logService from '../services/logService';
import Sparkline from '../components/Sparkline';

import {
  FileText,
  Send,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  Users,
  Calendar,
  Download,
  Eye,
  MoreHorizontal,
  Bell,
  Filter,
  Search,
  Plus,
  Edit3
} from 'lucide-react';

const DashboardSignature = () => {
  const [stats, setStats] = useState({
    draft: 0,
    sent: 0,
    completed: 0,
    actionRequired: 0,
    totalThisMonth: 0,
    completionRate: 0,
    avgSigningTime: '0.0'
  });
  const [notifications, setNotifications] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [filter, setFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [allEnvelopes, setAllEnvelopes] = useState([]);
  const [dateFilter, setDateFilter] = useState('month');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [trend7, setTrend7] = useState([]);
  const [trend30, setTrend30] = useState([]);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);
  const [actionEnvelopes, setActionEnvelopes] = useState([]);

  const filterByDate = (arr) => {
    const now = new Date();
    let start;
    let end = now;
    if (dateFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (dateFilter === '90days') {
      start = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === 'custom' && customRange.start && customRange.end) {
      start = new Date(customRange.start);
      end = new Date(customRange.end);
    } else {
      return arr;
    }
    return arr.filter(e => {
      const d = new Date(e.created_at);
      return d >= start && d <= end;
    });
  };

  const generateTrend = (arr, days) => {
    const now = new Date();
    const res = Array(days).fill(0);
    arr.forEach(e => {
      const diff = Math.floor((now - new Date(e.created_at)) / (1000 * 60 * 60 * 24));
      if (diff >= 0 && diff < days) res[days - diff - 1] += 1;
    });
    return res;
  };

  const applyFilters = () => {
    const filtered = filterByDate(allEnvelopes);
    const filteredAction = filterByDate(actionEnvelopes);

    const drafts = filtered.filter(e => e.status === 'draft');
    const sent = filtered.filter(e => e.status === 'sent');
    const completed = filtered.filter(e => e.status === 'completed');

    const total = filtered.length;
    const compCount = completed.length;
    const completionRate = total ? ((compCount / total) * 100).toFixed(1) : 0;

    const avgTime = completed.length
      ? (
          completed.reduce((sum, e) => {
            const created = new Date(e.created_at);
            const doneAt = new Date(e.updated_at);
            return sum + (doneAt - created) / (1000 * 3600 * 24);
          }, 0) / completed.length
        ).toFixed(1)
      : '0.0';

    const notifs = completed
      .slice(-5)
      .map(e => ({ id: e.id, title: e.title, type: 'normal', time: e.updated_at }));

    const recents = filtered
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5)
      .map(e => ({
        id: e.id,
        title: e.title,
        status: e.status === 'action_required' ? 'actionRequired' : e.status,
        progress: (
          (e.recipients.filter(r => r.signed).length / e.recipients.length) * 100
        ).toFixed(0),
        signers: e.recipients.length,
        signedBy: e.recipients.filter(r => r.signed).length,
        createdAt: e.created_at,
        deadline: e.deadline_at
      }));

    setStats({
      draft: drafts.length,
      sent: sent.length,
      completed: compCount,
      actionRequired: filteredAction.length,
      totalThisMonth: filtered.length,
      completionRate,
      avgSigningTime: avgTime
    });
    setNotifications(notifs);
    setRecentDocuments(recents);
    setTrend7(generateTrend(filtered, 7));
    setTrend30(generateTrend(filtered, 30));
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [drafts, sent, completed, actionReq] = await Promise.all([
          signatureService.getEnvelopes({ status: 'draft' }),
          signatureService.getEnvelopes({ status: 'sent' }),
          signatureService.getCompletedEnvelopes(),
          signatureService.getReceivedEnvelopes()
        ]);
        setAllEnvelopes([...drafts, ...sent, ...completed]);
        setActionEnvelopes(actionReq);
      } catch (err) {
        logService.error('Erreur chargement dashboard:', err);
        toast.error('Échec du chargement du tableau de bord');
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [allEnvelopes, actionEnvelopes, dateFilter, customRange]);

  // Preview decrypted PDF in a new tab
  const handlePreview = async (id) => {
    setPreviewLoadingId(id);
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      window.open(download_url, '_blank');
    } catch (error) {
      logService.error('Erreur lors de la prévisualisation du PDF:', error);
      toast.error('Impossible de prévisualiser le PDF');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  // Download decrypted PDF with proper filename
  const handleDownload = async (id, title) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      const response = await fetch(download_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Slugify pour nom de fichier sans accents ni espaces
      const safeName = slugify(title, { lower: true, strict: true });
      link.download = `${safeName}.pdf`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Document téléchargé avec succès');
    } catch (err) {
      logService.error('Erreur lors du téléchargement du PDF:', err);
      toast.error('Échec du téléchargement du document');
    }
  };

  const StatusBadge = ({ status }) => {
    const config = {
      draft: { label: 'Brouillon', classes: 'bg-gray-100 text-gray-800' },
      completed: { label: 'Terminé', classes: 'bg-green-100 text-green-800' },
      actionRequired: { label: 'Action requise', classes: 'bg-red-100 text-red-800' },
      sent: { label: 'En cours', classes: 'bg-yellow-100 text-yellow-800' },
      pending: { label: 'En cours', classes: 'bg-yellow-100 text-yellow-800' }
    };
    const { label, classes } = config[status] || config.sent;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
        {label}
      </span>
    );
  };

  // Applique filtre et recherche
  const displayedDocuments = recentDocuments
    .filter(doc => filter === 'all' || doc.status === filter)
    .filter(doc => doc.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col min-h-screen">
      <SignatureNavbar />
      <main className="flex-1 bg-gray-50 p-4 sm:p-6 lg:px-8">
        {/* En-tête */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-4">
          <h1 className="text-2xl font-semibold text-gray-900">Tableau de bord</h1>
          <Link
            to="/signature/new"
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nouveau document
          </Link>
        </div>

        {/* Filtre de date global */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="month">Ce mois</option>
            <option value="90days">90 jours</option>
            <option value="custom">Personnalisé</option>
          </select>
          {dateFilter === 'custom' && (
            <>
              <input
                type="date"
                value={customRange.start}
                onChange={e => setCustomRange({ ...customRange, start: e.target.value })}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <input
                type="date"
                value={customRange.end}
                onChange={e => setCustomRange({ ...customRange, end: e.target.value })}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </>
          )}
        </div>

        {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6 mb-8">
          {/* Brouillons */}
          <Link
            to="/signature/envelopes/drafts"
            className="bg-white shadow rounded-lg p-4 sm:p-5 flex items-center hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex-shrink-0">
              <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">Brouillons</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">{stats.draft}</p>
            </div>
          </Link>

          {/* Envoyées */}
          <Link
            to="/signature/envelopes/sent"
            className="bg-white shadow rounded-lg p-4 sm:p-5 flex items-center hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex-shrink-0">
              <Send className="w-6 h-6 sm:w-8 sm:h-8 text-purple-500" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">Envoyées</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">{stats.sent}</p>
            </div>
          </Link>

          {/* Complétées */}
          <Link
            to="/signature/envelopes/completed"
            className="bg-white shadow rounded-lg p-4 sm:p-5 flex items-center hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex-shrink-0">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">Complétées</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">{stats.completed}</p>
            </div>
          </Link>

          {/* Action requise */}
          <Link
            to="/signature/envelopes/action-required"
            className="bg-white shadow rounded-lg p-4 sm:p-5 flex items-center hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex-shrink-0">
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8 text-red-500" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">Action requise</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">{stats.actionRequired}</p>
            </div>
          </Link>

          {/* Total période */}
          <Link
            to="/signature/envelopes"
            className="bg-white shadow rounded-lg p-4 sm:p-5 flex items-center hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex-shrink-0">
              <Calendar className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-500" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">Période</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">{stats.totalThisMonth}</p>
            </div>
          </Link>

          {/* Taux de completion */}
          <Link
            to="/signature/envelopes"
            className="bg-white shadow rounded-lg p-4 sm:p-5 flex items-center hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex-shrink-0">
              <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-500" />
            </div>
            <div className="ml-3 sm:ml-4 min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-medium text-gray-500 truncate">Taux compl.</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">{stats.completionRate}%</p>
            </div>
          </Link>
        </div>

        {/* Tendances */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">7 derniers jours</p>
            <div className="h-8">
              <Sparkline data={trend7} />
            </div>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <p className="text-xs font-medium text-gray-500 mb-2">30 derniers jours</p>
            <div className="h-8">
              <Sparkline data={trend30} />
            </div>
          </div>
        </div>

        {/* Section principale - Documents récents */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {/* En-tête de la section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 border-b border-gray-200 gap-4">
            <h2 className="text-lg font-medium text-gray-900">Documents récents</h2>
            
            {/* Contrôles de recherche et filtre */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {/* Filtre */}
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0" />
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="all">Tous</option>
                  <option value="draft">Brouillons</option>
                  <option value="sent">Envoyées</option>
                  <option value="completed">Complétées</option>
                  <option value="actionRequired">Action requise</option>
                </select>
              </div>

              {/* Recherche */}
              <div className="flex items-center space-x-2 flex-1 sm:flex-initial">
                <Search className="w-4 h-4 sm:w-5 sm:h-5 text-gray-500 flex-shrink-0" />
                <input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-64"
                />
              </div>
            </div>
          </div>

          {/* Contenu des documents */}
          {displayedDocuments.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun document</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || filter !== 'all' 
                  ? 'Aucun document ne correspond à vos critères.' 
                  : 'Aucun document récent trouvé.'
                }
              </p>
            </div>
          ) : (
            <>
              {/* Version desktop - Tableau */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Titre
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Statut
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Progression
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Signataires
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Créé le
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Échéance
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedDocuments.map(doc => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-900 max-w-xs truncate" title={doc.title}>
                            {doc.title}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={doc.status} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap" title={`${doc.signedBy}/${doc.signers}`}>
                          <div className="flex items-center space-x-2">
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-medium text-gray-700">
                                  {doc.signedBy}/{doc.signers}
                                </span>
                                <span className="text-xs text-gray-500">{doc.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                                  style={{ width: `${doc.progress}%` }}
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={Number(doc.progress)}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <Users className="w-4 h-4 text-gray-400 mr-1" />
                            <span className="text-sm text-gray-900">{doc.signedBy}/{doc.signers}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-500">
                            {new Date(doc.createdAt).toLocaleDateString('fr-FR')}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-500">
                            {doc.deadline ? new Date(doc.deadline).toLocaleDateString('fr-FR') : '-'}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => handlePreview(doc.id)}
                              disabled={previewLoadingId === doc.id}
                              className={`text-gray-400 ${previewLoadingId === doc.id ? 'opacity-50 cursor-not-allowed' : 'hover:text-blue-600 transition-colors duration-200'}`}
                              title="Prévisualiser"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDownload(doc.id, doc.title)}
                              className="text-gray-400 hover:text-green-600 transition-colors duration-200"
                              title="Télécharger"
                            >
                              <Download className="w-5 h-5" />
                            </button>
                            <button className="text-gray-400 hover:text-indigo-600 transition-colors duration-200" title="Modifier">
                              <Edit3 className="w-5 h-5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Version mobile/tablette - Cartes */}
              <div className="block lg:hidden">
                <div className="divide-y divide-gray-200">
                  {displayedDocuments.map(doc => (
                    <div key={doc.id} className="p-4 sm:p-6 hover:bg-gray-50 transition-colors duration-200">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 truncate pr-2" title={doc.title}>
                            {doc.title}
                          </h3>
                          <div className="mt-1 flex items-center space-x-2">
                            <StatusBadge status={doc.status} />
                          </div>
                        </div>
                        
                        {/* Actions mobile */}
                        <div className="flex items-center space-x-2 flex-shrink-0">
                          <button
                            onClick={() => handlePreview(doc.id)}
                            disabled={previewLoadingId === doc.id}
                            className={`p-1 text-gray-400 ${previewLoadingId === doc.id ? 'opacity-50 cursor-not-allowed' : 'hover:text-blue-600'} transition-colors duration-200`}
                            title="Prévisualiser"
                          >
                            <Eye className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleDownload(doc.id, doc.title)}
                            className="p-1 text-gray-400 hover:text-green-600 transition-colors duration-200"
                            title="Télécharger"
                          >
                            <Download className="w-5 h-5" />
                          </button>
                          <button className="p-1 text-gray-400 hover:text-indigo-600 transition-colors duration-200" title="Modifier">
                            <Edit3 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {/* Progression */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center text-sm text-gray-600">
                            <Users className="w-4 h-4 mr-1" />
                            <span>{doc.signedBy}/{doc.signers} signés</span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">{doc.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2" title={`${doc.signedBy}/${doc.signers}`}>
                          <div
                            className="h-2 rounded-full bg-blue-600 transition-all duration-300"
                            style={{ width: `${doc.progress}%` }}
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Number(doc.progress)}
                          />
                        </div>
                      </div>

                      {/* Métadonnées */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-gray-500 gap-2">
                        <div className="flex items-center space-x-4">
                          <span>Créé le {new Date(doc.createdAt).toLocaleDateString('fr-FR')}</span>
                          {doc.deadline && (
                            <span>Échéance: {new Date(doc.deadline).toLocaleDateString('fr-FR')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Section notifications (optionnelle) */}
        {notifications.length > 0 && (
          <div className="mt-8 bg-white shadow rounded-lg">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
              <div className="flex items-center">
                <Bell className="w-5 h-5 text-gray-500 mr-2" />
                <h2 className="text-lg font-medium text-gray-900">Notifications récentes</h2>
              </div>
            </div>
            <div className="divide-y divide-gray-200">
              {notifications.map(notif => (
                <div key={notif.id} className="p-4 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        Document "{notif.title}" complété
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(notif.time).toLocaleString('fr-FR')}
                      </p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 ml-2" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DashboardSignature;