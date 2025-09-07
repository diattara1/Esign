// src/services/signatureService.js
import { api } from './apiUtils';

const BASE = 'api/signature';

/* --------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------*/

/**
 * Construit une URL ABSOLUE à partir d'un chemin relatif, basée sur api.defaults.baseURL.
 * - supprime les / en trop
 * - force https si domaine intellivibes.linkpc.net (évite CSP connect-src http)
 */
const ABS = (rel) => {
  const base = (api?.defaults?.baseURL || '').replace(/\/+$/, '');
  const path = String(rel || '').replace(/^\/+/, '');
  const u = new URL(`${base}/${path}`);
  if (u.hostname === 'intellivibes.linkpc.net') {
    u.protocol = 'https:';
  }
  return u.toString();
};

const apiRequest = async (method, url, data, config, errorMessage = 'Une erreur est survenue') => {
  try {
    const m = method.toLowerCase();
    const args = m === 'get' || m === 'delete' ? [url, config] : [url, data, config];
    const res = await api[m](...args);
    return res.data;
  } catch (err) {
    throw new Error(errorMessage);
  }
};

/* --------------------------------------------------------------
 * Service
 * ------------------------------------------------------------*/
export default {
  // ─── Envelopes listing / CRUD ──────────────────────────────────────────
  getEnvelopes: (params = {}) =>
    apiRequest('get', `${BASE}/envelopes/`, null, { params }, 'Impossible de récupérer les enveloppes'),

  getReceivedEnvelopes: () =>
    apiRequest(
      'get',
      `${BASE}/envelopes/`,
      null,
      { params: { status: 'action_required' } },
      'Impossible de récupérer les enveloppes reçues'
    ),

  getCompletedEnvelopes: () =>
    apiRequest(
      'get',
      `${BASE}/envelopes/`,
      null,
      { params: { status: 'completed' } },
      'Impossible de récupérer les enveloppes complétées'
    ),

  getEnvelope: (id, config = {}) =>
    apiRequest('get', `${BASE}/envelopes/${id}/`, null, config, "Impossible de récupérer l'enveloppe"),

  createEnvelope: data =>
    apiRequest('post', `${BASE}/envelopes/`, data, undefined, "Impossible de créer l'enveloppe"),

  updateEnvelope: (id, payload) =>
    apiRequest('patch', `${BASE}/envelopes/${id}/`, payload, undefined, "Impossible de mettre à jour l'enveloppe"),

  updateEnvelopeFiles: (id, files) => {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return apiRequest('patch', `${BASE}/envelopes/${id}/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }, "Impossible de mettre à jour les fichiers de l'enveloppe");
  },

  cancelEnvelope: id =>
    apiRequest('post', `${BASE}/envelopes/${id}/cancel/`, undefined, undefined, "Impossible d'annuler l'enveloppe"),

  sendEnvelope: (id, payload = {}) =>
    apiRequest('post', `${BASE}/envelopes/${id}/send/`, payload, undefined, "Impossible d'envoyer l'enveloppe"),

  // ─── Guest signing (token / OTP) ────────────────────────────────────
  getGuestEnvelope: (id, token) => {
    const headers = token ? { 'X-Signature-Token': token } : {};
    return apiRequest('get', `${BASE}/envelopes/${id}/guest/`, null, { headers }, "Impossible de récupérer l'enveloppe invitée");
  },

  sendOtp: (id, token) =>
    apiRequest(
      'post',
      `${BASE}/envelopes/${id}/send_otp/`,
      {},
      token ? { headers: { 'X-Signature-Token': token } } : undefined,
      "Impossible d'envoyer le code OTP"
    ),

  verifyOtp: (id, otp, token) =>
    apiRequest(
      'post',
      `${BASE}/envelopes/${id}/verify_otp/`,
      { otp },
      token ? { headers: { 'X-Signature-Token': token } } : undefined,
      "Impossible de vérifier le code OTP"
    ),

  // ─── Signing ────────────────────────────────────────────────────────
  signGuest: (id, body, token) => {
    const cfg = token ? { headers: { 'X-Signature-Token': token } } : undefined;
    return apiRequest('post', `${BASE}/envelopes/${id}/sign/`, body, cfg, "Impossible de signer l'enveloppe en tant qu'invité");
  },

  signAuthenticated: (id, body) =>
    apiRequest('post', `${BASE}/envelopes/${id}/sign_authenticated/`, body, undefined, "Impossible de signer l'enveloppe"),

  sign(id, body, token) {
    return token ? this.signGuest(id, body, token) : this.signAuthenticated(id, body);
  },

  // Demande d'email de réinitialisation
  requestPasswordReset: (email) =>
    apiRequest(
      'post',
      `${BASE}/password-reset/`,
      { email },
      undefined,
      "Impossible d'envoyer l'email de réinitialisation"
    ),

  getAuthenticatedEnvelope: id =>
    apiRequest('get', `${BASE}/envelopes/${id}/sign-page/`, null, undefined, "Impossible de récupérer l'enveloppe"),

  changePassword: (uid, token, password) =>
    apiRequest('post', `${BASE}/change-password/`, { uid, token, password }, undefined, 'Impossible de changer le mot de passe'),

  // ─── HSM signing ─────────────────────────────────────────────────────
  hsmSign: (envelopeId, payload) =>
    apiRequest('post', `${BASE}/envelopes/${envelopeId}/hsm_sign/`, payload, undefined, "Impossible de signer via HSM"),

  // ─── Download helpers ────────────────────────────────────────────────
  // Téléchargement "global" : renvoie l'URL qui pointe vers le signé si dispo, sinon original.
  downloadEnvelope: async (envelopeId) => {
    const { download_url } = await apiRequest(
      'get',
      `${BASE}/envelopes/${envelopeId}/download/`,
      null,
      undefined,
      "Impossible de préparer le téléchargement"
    );

    // Normaliser l'URL renvoyée par le backend (peut être relative ou en http)
    const absolute = new URL(download_url || '', api?.defaults?.baseURL || '');
    if (absolute.hostname === 'intellivibes.linkpc.net') {
      absolute.protocol = 'https:';
    }

    // Télécharger via axios pour conserver les mêmes en-têtes (auth, etc.)
    const pdfBlob = await api.get(absolute.toString(), { responseType: 'blob' }).then(r => r.data);
    return { download_url: URL.createObjectURL(pdfBlob) };
  },

  // --- Vérification QR publique (uuid + sig) ---
  verifyQRCodeWithSig: (uuid, sig) =>
    apiRequest('get', `${BASE}/prints/${uuid}/verify/`, null, { params: { sig } }, 'Impossible de vérifier le QR code'),

  // --- URL absolue vers le PDF signé via uuid+sig (sans JWT, pérenne) ---
  getQRCodeDocumentAbsoluteUrl: (uuid, sig) => {
    const rel = `${BASE}/prints/${uuid}/document/?sig=${encodeURIComponent(sig || '')}`;
    return ABS(rel);
  },

  // --- Ouvrir le PDF dans l'onglet courant (convenient) ---
  openQRCodeDocument: (uuid, sig) => {
    const rel = `${BASE}/prints/${uuid}/document/?sig=${encodeURIComponent(sig || '')}`;
    window.location.assign(ABS(rel));
  },

  // Téléchargement d'un document précis (si tu ajoutes un endpoint côté vue)
  // Sinon, utilise simplement doc.file_url côté front.
  fetchDocumentBlob: async (envelopeId, documentId) => {
    const url = `${BASE}/envelopes/${envelopeId}/documents/${documentId}/file/`;
    const blob = await apiRequest('get', url, null, { responseType: 'blob' }, 'Impossible de récupérer le fichier');
    if (!blob) throw new Error('Fichier introuvable');
    return URL.createObjectURL(blob);
  },

  // Relance manuelle par le créateur
  remindNow: (id) =>
    apiRequest('post', `${BASE}/envelopes/${id}/remind/`, undefined, undefined, "Impossible de relancer l'enveloppe"),

  // URLs directes (désormais ABSOLUES et HTTPS)
  getOriginalDocumentUrl: (envelopeId) =>
    ABS(`${BASE}/envelopes/${envelopeId}/original-document/`),

  getSignedDocumentUrl: (envelopeId) =>
    ABS(`${BASE}/envelopes/${envelopeId}/signed-document/`),

  // URL absolue du document décrypté (avec token), forçant https si besoin
  getDecryptedDocumentUrl: (envelopeId, token) => {
    const rel = `${BASE}/envelopes/${envelopeId}/document/?token=${encodeURIComponent(token || '')}`;
    return ABS(rel);
  },

  // ─── Signatures / QR codes  ───────────────────────────────
  getSignatures: envelopeId =>
    apiRequest('get', `${BASE}/signatures/`, null, { params: { envelope: envelopeId } }, 'Impossible de récupérer les signatures'),

  generateQRCode: (envelopeId, type) =>
    apiRequest('post', `${BASE}/prints/generate/`, { envelope: envelopeId, qr_type: type }, undefined, 'Impossible de générer le QR code'),

  getQRCodes: () =>
    apiRequest('get', `${BASE}/prints/`, null, undefined, 'Impossible de récupérer les QR codes'),

  verifyQRCode: uuid =>
    apiRequest('get', `${BASE}/prints/${uuid}/verify/`, null, undefined, 'Impossible de vérifier le QR code'),

  // Self-sign (un ou plusieurs docs, même endroit)
  selfSign: async (formData, { sync = false } = {}) => {
    const config = {};
    if (sync) config.responseType = 'blob';

    try {
      const res = await api.post(`${BASE}/self-sign/`, formData, config);
      return sync ? res : res.data;
    } catch (err) {
      throw new Error('Impossible de signer le document');
    }
  },

  // Batch sign (same spot ou var spots)
  createBatchSign: formData =>
    apiRequest('post', `${BASE}/batch-sign/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }, 'Impossible de créer le lot de signatures'),

  getBatchJob: id =>
    apiRequest('get', `${BASE}/batch-jobs/${id}/`, null, undefined, 'Impossible de récupérer la tâche de lot'),

  downloadBatchZip: id =>
    apiRequest('get', `${BASE}/batch-jobs/${id}/download/`, null, { responseType: 'blob' }, 'Impossible de télécharger l\'archive')
      .then(data => {
        const url = URL.createObjectURL(data);
        return { url };
      }),
};
