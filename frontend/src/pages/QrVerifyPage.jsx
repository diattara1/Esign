// QrVerifyPage.jsx
import React, { useEffect, useState, useLayoutEffect, useRef } from 'react';
import {
  CheckCircle, AlertTriangle, FileText, Shield, Calendar,
  User, Hash, ExternalLink, Info, Mail
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Document, Page } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import signatureService from '../services/signatureService';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

const Badge = ({ type, children }) => {
  const variants = {
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    danger: 'bg-red-50 text-red-700 border-red-200'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${variants[type]}`}>
      {children}
    </span>
  );
};

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-lg border border-gray-200 shadow-sm ${className}`}>
    {children}
  </div>
);

const InfoItem = ({ label, value, icon: Icon, type = "text" }) => (
  <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
    {Icon && <Icon className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />}
    <div className="flex-1 min-w-0">
      <dt className="text-sm font-medium text-gray-600 mb-1">{label}</dt>
      <dd className={`text-sm ${type === 'code' ? 'font-mono bg-gray-50 px-2 py-1 rounded border text-xs break-all' : 'text-gray-900'}`}>
        {value || '—'}
      </dd>
    </div>
  </div>
);

export default function QrVerifyPage() {
  const { uuid } = useParams();
  const [sp] = useSearchParams();
  const sig = sp.get('sig') || '';

  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  // PDF viewer state (react-pdf)
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const viewerRef = useRef(null);
  const [contentWidth, setContentWidth] = useState(0);
  // Mesure responsive du conteneur PDF
  useLayoutEffect(() => {
  const el = viewerRef.current;
  if (!el) return;
  const measure = () => {
    const cs = window.getComputedStyle(el);
    const paddingX =
      parseFloat(cs.paddingLeft || '0') + parseFloat(cs.paddingRight || '0');
    // clientWidth inclut le padding : on le retire
    const inner = Math.max(0, (el.clientWidth || 0) - paddingX);
    setContentWidth(inner);
  };
  measure();
  let ro;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(measure);
    ro.observe(el);
  }
  window.addEventListener('resize', measure);
  return () => {
    window.removeEventListener('resize', measure);
    if (ro) ro.disconnect();
  };
}, []);


  // Clean object URL
  useEffect(() => () => {
    if (pdfUrl && pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);

  // Charger la preuve
  useEffect(() => {
    if (!uuid || !sig) {
      setErr("Lien invalide : paramètres manquants.");
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await signatureService.verifyQRCodeWithSig(uuid, sig);
        setData(res);
      } catch (e) {
        console.error(e);
        setErr("Impossible de charger la preuve (QR non trouvé ou signature invalide).");
      } finally {
        setLoading(false);
      }
    })();
  }, [uuid, sig]);

  // Télécharger le PDF signé (blob) et créer une object URL pour react-pdf
  useEffect(() => {
    const loadPdf = async () => {
      if (!data?.document_url) { setPdfUrl(null); return; }
      setLoadingPdf(true);
      try {
        const res = await fetch(data.document_url, { credentials: 'include' });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setPdfUrl(prev => {
          if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
          return url;
        });
        setNumPages(0);
      } catch (e) {
        console.error('PDF fetch error:', e);
        setPdfUrl(null);
      } finally {
        setLoadingPdf(false);
      }
    };
    loadPdf();
  }, [data?.document_url]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="p-8 w-full max-w-md text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600 font-medium">Vérification en cours.</p>
        </Card>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="p-8 w-full max-w-md">
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Erreur de vérification</h2>
            <p className="text-gray-600">{err}</p>
          </div>
        </Card>
      </div>
    );
  }

  const pdfHref = data?.document_url || signatureService.getQRCodeDocumentAbsoluteUrl(uuid, sig);
  const signerNames = Array.isArray(data?.signers)
    ? data.signers.map(s => s.full_name).join(', ')
    : '—';

  const cert = data?.certificate || {};
  const subject = cert.subject || cert; // accepte {subject:{...}} ou {common_name:...}
  const cn = subject.CN || cert.common_name;
  const org = subject.O || cert.organization;
  const country = subject.C || cert.country;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">
              {data?.title || 'Document'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Statut : <Badge type={data?.completed ? 'success' : 'warning'}>
                {data?.completed ? 'Signé' : 'En cours'}
              </Badge>
              <span className="ml-2">•</span>{' '}
              Signataires : <span className="font-medium">{signerNames}</span>
            </p>
          </div>
          <a
            href={pdfHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            <ExternalLink className="w-4 h-4" /> Ouvrir dans un onglet
          </a>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne infos */}
          <div className="space-y-6">
            {/* Signature */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" /> Signature
              </h2>
              <dl>
                <InfoItem
                  label="Statut"
                  value={data?.completed ? 'Signé' : 'En cours'}
                  icon={data?.completed ? CheckCircle : AlertTriangle}
                />
                <InfoItem
                  label="Heure déclarée de dépôt"
                  value={data?.completed_at ? new Date(data.completed_at).toLocaleString() : '—'}
                  icon={Calendar}
                />
                <InfoItem
                  label="Document"
                  value={data?.title || '—'}
                  icon={FileText}
                />
              </dl>
            </Card>

            {/* Empreintes */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Hash className="w-5 h-5" /> Empreintes du document
              </h2>
              <dl>
                <InfoItem label="SHA-256" value={data?.hash_sha256} icon={Hash} type="code" />
                <InfoItem label="MD5" value={data?.hash_md5} icon={Hash} type="code" />
              </dl>
            </Card>

            {/* Certificat du signataire */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5" /> Certificat du signataire
              </h2>
              <dl>
                <InfoItem label="Nom commun (CN)" value={cn} icon={User} />
                <InfoItem label="Organisation (O)" value={org} icon={Info} />
                <InfoItem label="Pays (C)" value={country} icon={Info} />
                <InfoItem label="N° de série" value={cert.serial_number} icon={Hash} type="code" />
                <InfoItem label="Valide à partir de" value={cert.valid_from && new Date(cert.valid_from).toLocaleString()} icon={Calendar} />
                <InfoItem label="Valide jusqu’à" value={cert.valid_to && new Date(cert.valid_to).toLocaleString()} icon={Calendar} />
              </dl>

              {/* Révocation si dispo */}
              {(cert.revocation?.ocsp_status || cert.revocation?.crl_status) && (
                <div className="mt-3 text-xs text-gray-700">
                  <div className="mb-1">
                    OCSP : <strong>{cert.revocation.ocsp_status || '—'}</strong>{' '}
                    {cert.revocation.ocsp_url && (
                      <a className="underline ml-2" href={cert.revocation.ocsp_url} target="_blank" rel="noreferrer">lien</a>
                    )}
                  </div>
                  <div>
                    CRL : <strong>{cert.revocation.crl_status || '—'}</strong>{' '}
                    {cert.revocation.crl_url && (
                      <a className="underline ml-2" href={cert.revocation.crl_url} target="_blank" rel="noreferrer">lien</a>
                    )}
                  </div>
                </div>
              )}

              {/* Horodatage si dispo */}
              {cert.timestamp?.time && (
                <div className="mt-3 text-xs text-gray-700">
                  Horodatage : <strong>{new Date(cert.timestamp.time).toLocaleString()}</strong>{' '}
                  {cert.timestamp.tsa && <>par <em>{cert.timestamp.tsa}</em></>}
                </div>
              )}
            </Card>

            {/* Signataires */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Mail className="w-5 h-5" /> Signataires
              </h2>
              <ul className="divide-y divide-gray-100">
                {(data?.signers || []).map((s, idx) => (
                  <li key={idx} className="py-3">
                    <div className="text-sm font-medium text-gray-900">{s.full_name}</div>
                    <div className="text-xs mt-1">
                      {s.signed ? (
                        <span className="text-green-700">Signé le {s.signed_at ? new Date(s.signed_at).toLocaleString() : '—'}</span>
                      ) : (
                        <span className="text-amber-700">En attente</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {/* Colonne viewer PDF */}
          <div className="lg:col-span-2">
            <Card className="p-3">
              <div ref={viewerRef} className="min-h-[60vh] p-2 overflow-auto">
                {loadingPdf ? (
                  <div className="flex justify-center items-center h-64">
                    <LoadingSpinner />
                  </div>
                ) : !pdfUrl ? (
                  <div className="p-6 text-sm text-gray-600">Le document signé n’a pas pu être chargé.</div>
                ) : (
                  <Document
                    key={uuid}
                    file={pdfUrl}
                    onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                    onLoadError={(err) => console.error('PDF error:', err)}
                    loading={<div className="p-6">Chargement PDF…</div>}
                  >
                    {Array.from({ length: numPages }, (_, i) => (
                      <div key={i} className="relative mb-6">
  <Page
    pageNumber={i + 1}
    width={contentWidth || 800}
    renderTextLayer={false}
    className="mx-auto rounded border border-gray-200 shadow-sm bg-white"
  />
</div>

                    ))}
                  </Document>
                )}
              </div>
              <div className="px-2 pb-2">
                <a
                  href={pdfHref}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm text-blue-700 underline"
                >
                  <ExternalLink className="w-4 h-4" /> Ouvrir le PDF dans un nouvel onglet
                </a>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
