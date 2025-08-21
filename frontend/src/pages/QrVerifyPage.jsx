// QrVerifyPage.jsx — front branché sur l'API réelle
import React, { useEffect, useState } from 'react';
import {
  CheckCircle, AlertTriangle, FileText, Shield, Calendar,
  User, Building, Hash, ExternalLink, Download, Clock, MapPin, Info
} from 'lucide-react';
import { useParams, useSearchParams } from 'react-router-dom';
import signatureService from '../services/signatureService';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
);

const Badge = ({ type, children, className = "" }) => {
  const variants = {
    success: 'bg-green-50 text-green-700 border-green-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    danger: 'bg-red-50 text-red-700 border-red-200'
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${variants[type]} ${className}`}>
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
        setErr("Impossible de charger la preuve (QR non trouvé ou signature HMAC invalide).");
      } finally {
        setLoading(false);
      }
    })();
  }, [uuid, sig]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <Card className="p-8 w-full max-w-md text-center">
          <LoadingSpinner />
          <p className="mt-4 text-gray-600 font-medium">Vérification en cours...</p>
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

  const cert = data?.certificate || {};
  const pdfHref = data?.document_url || signatureService.getQRCodeDocumentAbsoluteUrl(uuid, sig);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileText className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">{data?.file}</h1>
            <p className="text-sm text-gray-500 mt-1">
              md5 : <code className="font-mono">{data?.hash_md5}</code>
            </p>
          </div>
        </div>

        {/* Signature */}
        <Card className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Shield className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
            <h2 className="font-medium text-lg  mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4" />
                    Détails de la signature
                    <Badge type="info">SHA-256</Badge>
                  </h2>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  

                  <dl className="space-y-0">
                    <InfoItem label="Signataire" value={data?.signer} icon={User} />
                    <InfoItem label="Fichier signé" value={`${data?.file || '—'} (rév. 1/1)`} icon={FileText} />
                  </dl>
                </div>

                <div>
                  <dl className="space-y-0">
                    <InfoItem label="Timestamp" value={data?.timestamp_human} icon={Calendar} />
                  </dl>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Certificat du signataire
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <dl className="space-y-0">
              <InfoItem label="Common name" value={cert.common_name} icon={User} />
              <InfoItem label="Organisation" value={cert.organization} icon={Building} />
              
            </dl>
            <dl className="space-y-0">
              <InfoItem label="Numéro de série" value={cert.serial_number} icon={Hash} type="code" />
              <InfoItem label="Pays" value={cert.country} icon={MapPin} />
            </dl>
          </div>

          {/* Bannière d'état simple (si tu ajoutes un champ de validité plus tard) */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              <span className="text-sm text-blue-800">
                Les informations ci-dessus proviennent de la preuve retournée par l’API.
              </span>
            </div>
          </div>
          </div>
        </Card>

        {/* Certificat */}
        <Card className="p-6">
        
        </Card>

        {/* Hashs */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            
            Empreintes du document
          </h2>

          <dl className="space-y-0">
            <InfoItem label="SHA-256" value={data?.hash_sha256} icon={Hash} type="code" />
            <InfoItem label="SHA-256 court" value={data?.sha256_short} icon={Hash} type="code" />
          </dl>
        </Card>

        {/* Document signé intégré */}
{pdfHref ? (
  <Card className="p-0 overflow-hidden">
    <object
      data={pdfHref}
      type="application/pdf"
      className="w-full h-[80vh]"
    >
      <iframe
        src={pdfHref}
        className="w-full h-[80vh] border-0"
        title="Document signé"
      />
    </object>
  </Card>
) : (
  <div className="text-sm text-gray-600 italic">
    Le document signé n’a pas pu être chargé.
  </div>
)}

      </div>
    </div>
  );
}
