import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import signatureService from '../services/signatureService';
import logService from '../services/logService';

const MAX_OTP_ATTEMPTS = 3;
const COOLDOWN_SECONDS = 30;

export default function useOtp(id, token, isAlreadySigned) {
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpAttempts, setOtpAttempts] = useState(MAX_OTP_ATTEMPTS);
  const [cooldownUntil, setCooldownUntil] = useState(null);
  const [otpStatus, setOtpStatus] = useState('');

  useEffect(() => {
    if (!cooldownUntil) return;
    const t = setInterval(() => {
      const remaining = Math.ceil((cooldownUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setCooldownUntil(null);
        setOtpAttempts(MAX_OTP_ATTEMPTS);
        setOtpStatus('');
      } else {
        setOtpStatus(`Réessayez dans ${remaining}s`);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownUntil]);

  const handleSendOtp = async () => {
    if (isAlreadySigned) return toast.info('Déjà signé');
    setSendingOtp(true);
    try {
      await signatureService.sendOtp(id, token);
      setOtpSent(true);
      toast.success('Code OTP envoyé');
    } catch (e) {
      logService.error(e);
      toast.error(e?.response?.data?.error || 'Erreur envoi OTP');
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (cooldownUntil && cooldownUntil > Date.now()) return;
    setVerifyingOtp(true);
    try {
      await signatureService.verifyOtp(id, otp, token);
      setOtpVerified(true);
      setOtpError('');
      setOtpStatus('');
      setOtpAttempts(MAX_OTP_ATTEMPTS);
      setCooldownUntil(null);
      toast.success('OTP vérifié');
    } catch (e) {
      logService.error(e);
      const msg = e?.response?.data?.error || 'OTP invalide';
      setOtpError(msg);
      const remaining = otpAttempts - 1;
      setOtpAttempts(remaining);
      if (remaining <= 0) {
        setCooldownUntil(Date.now() + COOLDOWN_SECONDS * 1000);
        setOtpStatus(`Trop d'échecs. Réessayez dans ${COOLDOWN_SECONDS}s`);
      } else {
        setOtpStatus(`Il reste ${remaining} tentative(s).`);
      }
      toast.error(msg);
    } finally {
      setVerifyingOtp(false);
    }
  };

  return {
    otp,
    setOtp,
    otpSent,
    otpVerified,
    sendingOtp,
    verifyingOtp,
    otpError,
    otpStatus,
    cooldownUntil,
    handleSendOtp,
    handleVerifyOtp
  };
}
