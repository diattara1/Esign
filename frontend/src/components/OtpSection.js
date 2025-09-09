import React from 'react';

export default function OtpSection({
  otp,
  setOtp,
  otpSent,
  otpVerified,
  otpError,
  otpStatus,
  sendingOtp,
  verifyingOtp,
  cooldownUntil,
  onSend,
  onVerify
}) {
  if (otpVerified) return null;

  return (
    <div className="space-y-2">
      {!otpSent && (
        <button
          onClick={onSend}
          disabled={sendingOtp}
          className="w-full bg-blue-600 text-white p-2 rounded disabled:opacity-50"
        >
          {sendingOtp ? 'Envoi…' : 'Envoyer OTP'}
        </button>
      )}
      {otpSent && (
        <>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Code OTP"
            className="w-full border p-2 rounded"
            disabled={cooldownUntil && cooldownUntil > Date.now()}
          />
          <div role="status" aria-live="polite" className="text-sm">
            {otpError && <p className="text-red-600">{otpError}</p>}
            {otpStatus && <p className="text-gray-600">{otpStatus}</p>}
          </div>
          <button
            onClick={onVerify}
            disabled={verifyingOtp || (cooldownUntil && cooldownUntil > Date.now())}
            className="w-full bg-green-600 text-white p-2 rounded disabled:opacity-50"
          >
            {verifyingOtp ? 'Vérification…' : 'Vérifier OTP'}
          </button>
        </>
      )}
    </div>
  );
}
