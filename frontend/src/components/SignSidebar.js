import React from 'react';

export default function SignSidebar({
  documents,
  selectedDoc,
  onSelectDoc,
  isGuest,
  isAlreadySigned,
  otp,
  setOtp,
  otpSent,
  otpVerified,
  sendingOtp,
  verifyingOtp,
  cooldownUntil,
  handleSendOtp,
  handleVerifyOtp,
  otpError,
  otpStatus
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="p-4 md:p-6 border-b border-gray-200">
        <div className="font-semibold text-gray-800 mb-2">Documents</div>
        {documents.length === 0 ? (
          <div className="text-sm text-gray-500">Aucun</div>
        ) : (
          <ul className="space-y-1">
            {documents.map(doc => (
              <li key={doc.id}>
                <button
                  className={`w-full text-left px-2 py-1 rounded ${selectedDoc?.id === doc.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                  onClick={() => onSelectDoc(doc)}
                >
                  {doc.name || `Document ${doc.id}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isGuest && !isAlreadySigned && (
        <div className="p-4 md:p-6 space-y-2">
          {!otpSent && !otpVerified && (
            <button onClick={handleSendOtp} disabled={sendingOtp} className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50">{sendingOtp ? 'Envoi…' : 'Envoyer OTP'}</button>
          )}
          {otpSent && !otpVerified && (
            <>
              <input type="text" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Code OTP" className="w-full border p-2 rounded" disabled={cooldownUntil && cooldownUntil > Date.now()} />
              <div role="status" aria-live="polite" className="text-sm">
                {otpError && <p className="text-red-600">{otpError}</p>}
                {otpStatus && <p className="text-gray-600">{otpStatus}</p>}
              </div>
              <button onClick={handleVerifyOtp} disabled={verifyingOtp || (cooldownUntil && cooldownUntil > Date.now())} className="w-full bg-green-600 text-white p-2 rounded disabled:opacity-50">{verifyingOtp ? 'Vérification…' : 'Vérifier OTP'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
