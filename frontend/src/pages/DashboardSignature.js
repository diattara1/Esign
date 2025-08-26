import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SignatureNavbar from '../components/SignatureNavbar';
import signatureService from '../services/signatureService';
import { toast } from 'react-toastify';
import slugify from 'slugify';
import logService from '../services/logService';

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const [drafts, sent, completed, actionReq] = await Promise.all([
          signatureService.getEnvelopes({ status: 'draft' }),
          signatureService.getEnvelopes({ status: 'sent' }),
          signatureService.getCompletedEnvelopes(),
          signatureService.getReceivedEnvelopes()
        ]);
        const all = [...drafts, ...sent, ...completed];

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonth = all.filter(e => new Date(e.created_at) >= monthStart);

        const total = all.length;
        const compCount = completed.length;
        const completionRate = total ? ((compCount / total) * 100).toFixed(1) : 0;

        const avgTime = completed.length
          ? (completed.reduce((sum, e) => {
              const created = new Date(e.created_at);
              const doneAt = new Date(e.updated_at);
              return sum + (doneAt - created) / (1000 * 3600 * 24);
            }, 0) / completed.length).toFixed(1)
          : '0.0';

        const notifs = completed
          .slice(-5)
          .map(e => ({ id: e.id, title: e.title, type: 'normal', time: e.updated_at }));

        const recents = all
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 5)
          .map(e => ({
            id: e.id,
            title: e.title,
            status: e.status === 'action_required' ? 'actionRequired' : e.status,
            progress: ((e.recipients.filter(r => r.signed).length / e.recipients.length) * 100).toFixed(0),
            signers: e.recipients.length,
            signedBy: e.recipients.filter(r => r.signed).length,
            createdAt: e.created_at,
            deadline: e.deadline_at
          }));

        setStats({
          draft: drafts.length,
          sent: sent.length,
          completed: compCount,
          actionRequired: actionReq.length,
          totalThisMonth: thisMonth.length,
          completionRate,
          avgSigningTime: avgTime
        });
        setNotifications(notifs);
        setRecentDocuments(recents);
      } catch (err) {
        logService.error('Erreur chargement dashboard:', err);
        toast.error('Échec du chargement du tableau de bord');
      }
    };
    loadData();
  }, []);

  // Preview decrypted PDF in a new tab
  const handlePreview = async (id) => {
    try {
      const { download_url } = await signatureService.downloadEnvelope(id);
      window.open(download_url, '_blank');
    } catch (error) {
      logService.error('Erreur lors de la prévisualisation du PDF:', error);
      toast.error('Impossible de prévisualiser le PDF');
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

  // Applique filtre et recherche
  const displayedDocuments = recentDocuments
    .filter(doc => filter === 'all' || doc.status === filter)
    .filter(doc => doc.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col min-h-screen">
      <SignatureNavbar />
      <main className="flex-1 bg-gray-50 p-6 lg:px-8">
        {/* En-tête */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Tableau de bord</h1>
          
        </div>

       {/* Statistiques */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">

          {/* Brouillons */}
          <Link
            to="/signature/envelopes/drafts"
            className="bg-white shadow rounded-lg p-5 flex items-center hover:bg-gray-50 transition"
          >
            <FileText className="w-8 h-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Brouillons</p>
              <p className="text-xl font-semibold text-gray-900">{stats.draft}</p>
            </div>
          </Link>

          {/* Envoyées */}
          <Link
            to="/signature/envelopes/sent"
            className="bg-white shadow rounded-lg p-5 flex items-center hover:bg-gray-50 transition"
          >
            <Send className="w-8 h-8 text-purple-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Envoyées</p>
              <p className="text-xl font-semibold text-gray-900">{stats.sent}</p>
            </div>
          </Link>

          {/* Complétées */}
          <Link
            to="/signature/envelopes/completed"
            className="bg-white shadow rounded-lg p-5 flex items-center hover:bg-gray-50 transition"
          >
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Complétées</p>
              <p className="text-xl font-semibold text-gray-900">{stats.completed}</p>
            </div>
          </Link>

          {/* Action requise */}
          <Link
            to="/signature/envelopes/action-required"
            className="bg-white shadow rounded-lg p-5 flex items-center hover:bg-gray-50 transition"
          >
            <AlertCircle className="w-8 h-8 text-red-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Action requise</p>
              <p className="text-xl font-semibold text-gray-900">{stats.actionRequired}</p>
            </div>
          </Link>

          {/* Ce mois‑ci (exemple de lien vers la liste générale, à adapter si besoin) */}
          <Link
            to="/signature/envelopes"
            className="bg-white shadow rounded-lg p-5 flex items-center hover:bg-gray-50 transition"
          >
            <Calendar className="w-8 h-8 text-yellow-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Ce mois-ci</p>
              <p className="text-xl font-semibold text-gray-900">{stats.totalThisMonth}</p>
            </div>
          </Link>

          {/* Taux de compl. (idem) */}
          <Link
            to="/signature/envelopes"
            className="bg-white shadow rounded-lg p-5 flex items-center hover:bg-gray-50 transition"
          >
            <TrendingUp className="w-8 h-8 text-indigo-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Taux compl.</p>
              <p className="text-xl font-semibold text-gray-900">{stats.completionRate}%</p>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2  ">
          {/* Documents récents */}
          <div className="lg:col-span-2">
            <div className="bg-white shadow rounded-lg">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-medium text-gray-900">Documents récents</h2>
                <div className="flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-gray-500" />
                  <Search className="w-5 h-5 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Rechercher..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring"
                  />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Titre</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Statut</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Progression</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signataires</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Créé le</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Échéance</th>
                      <th className="px-6 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayedDocuments.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                          Aucun document récent
                        </td>
                      </tr>
                    ) : (
                      displayedDocuments.map(doc => (
                      <tr key={doc.id}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {/* Badge statut lisible */}
                          {(['pending','sent'].includes(doc.status)) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              En cours
                            </span>
                          )}
                          {doc.status === 'completed' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Terminé
                            </span>
                          )}
                          {(!['pending','sent','completed'].includes(doc.status)) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {String(doc.status).replace(/([A-Z])/g, ' $1')}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {/* Badge progression + barre */}
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {doc.signedBy}/{doc.signers} signés
                            </span>
                          </div>
                          <div className="w-40 bg-gray-200 rounded-full h-2" title={`${doc.progress}%`}>
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{ width: `${doc.progress}%` }}
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Number(doc.progress)}
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-500">{doc.signedBy}/{doc.signers}</p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-500">{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</p>
                        </td>
                         <td className="px-6 py-4 whitespace-nowrap">
                          <p className="text-sm text-gray-500">
                            {doc.deadline ? new Date(doc.deadline).toLocaleDateString('fr-FR') : '-'}
                          </p>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                          <Eye
                            className="inline-block w-5 h-5 cursor-pointer hover:text-blue-600"
                            onClick={() => handlePreview(doc.id)}
                          />
                          <Download
                            className="inline-block w-5 h-5 cursor-pointer hover:text-green-600"
                            onClick={() => handleDownload(doc.id, doc.title)}
                          />
                          <Edit3 className="inline-block w-5 h-5 cursor-pointer hover:text-indigo-600" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          
        </div>
      </main>
    </div>
  );
};

export default DashboardSignature;
