import React from 'react';
import { FiShield } from 'react-icons/fi';

export default function DocumentSignNavbar({
  isMobile,
  toggleSidebar,
  isGuest,
  isAlreadySigned,
  envelopeTitle,
  documents,
  selectedDoc,
  setSelectedDoc,
  otpSent,
  otpVerified,
  sendingOtp,
  verifyingOtp,
  cooldownUntil,
  handleSendOtp,
  handleVerifyOtp,
  handleSign,
  canSign,
  signing
}) {
  return (
    <div className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-gray-200">
      <div className="px-3 md:px-6 py-3 flex items-center gap-3">
        {isMobile && (
          <button
            onClick={toggleSidebar}
            className="p-2 rounded border border-gray-200 active:scale-95"
          >
            Documents
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-base md:text-lg font-semibold text-gray-900 truncate">
            {isAlreadySigned ? 'Document déjà signé :' : 'Signer le document :'} {envelopeTitle}
          </div>
          {documents.length > 1 && (
            <div className="mt-1">
              <select
                className="text-sm border rounded px-2 py-1"
                value={selectedDoc?.id || ''}
                onChange={(e) => {
                  const d = documents.find(x => String(x.id) === String(e.target.value));
                  if (d && d.id !== selectedDoc?.id) setSelectedDoc(d);
                }}
              >
                {documents.map(d => (
                  <option key={d.id} value={d.id}>{d.name || `Document ${d.id}`}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {isGuest && !isAlreadySigned && (
          <div className="hidden md:flex items-center gap-2 mr-2">
            <FiShield className={otpVerified ? 'text-green-600' : 'text-gray-400'} />
            <span className="text-sm text-gray-700">
              {otpVerified ? 'OTP vérifié' : (otpSent ? 'OTP envoyé' : 'OTP requis')}
            </span>
          </div>
        )}

        {(!isGuest || otpVerified) && !isAlreadySigned && (
          <button
            onClick={handleSign}
            disabled={!canSign() || signing}
            className={`px-4 py-2 rounded-md text-white font-medium transition ${canSign() && !signing ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-400 cursor-not-allowed'}`}
          >
            {signing ? 'Signature en cours…' : 'Signer'}
          </button>
        )}
        {isGuest && !otpVerified && !isAlreadySigned && (
          <button
            onClick={otpSent ? handleVerifyOtp : handleSendOtp}
            disabled={sendingOtp || verifyingOtp || (cooldownUntil && cooldownUntil > Date.now())}
            className="px-4 py-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
          >
            {otpSent ? (verifyingOtp ? 'Vérification…' : 'Vérifier OTP') : (sendingOtp ? 'Envoi…' : 'Envoyer OTP')}
          </button>
        )}
      </div>
    </div>
  );
}
