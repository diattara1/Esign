import { api } from './apiUtils';
import logService from './logService';
const BASE = 'api/signature';

const normalizeEnvelopeId = id => {
  const value = String(id ?? '').trim();
  if (!value) {
    throw new Error("Identifiant d'enveloppe manquant");
  }
  return value;
};

const apiRequest = async (method, url, data, config, errorMessage = 'Une erreur est survenue') => {
  try {
    const m = method.toLowerCase();
    const args = m === 'get' || m === 'delete' ? [url, config] : [url, data, config];
    const res = await api[m](...args);
    return res.data;
  } catch (err) {
    logService.error('API request error response:', err.response);
    const detail = err.response?.data?.detail || err.message;
    throw new Error(detail || errorMessage);
  }
};

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
    apiRequest('get', `${BASE}/envelopes/${normalizeEnvelopeId(id)}/`, null, config, "Impossible de récupérer l'enveloppe"),

  createEnvelope: data =>
    apiRequest('post', `${BASE}/envelopes/`, data, undefined, "Impossible de créer l'enveloppe"),

  updateEnvelope: (id, payload) =>
    apiRequest('patch', `${BASE}/envelopes/${normalizeEnvelopeId(id)}/`, payload, undefined, "Impossible de mettre à jour l'enveloppe"),


  updateEnvelopeFiles: (id, files) => {
    const envelopeId = normalizeEnvelopeId(id);
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return apiRequest('patch', `${BASE}/envelopes/${envelopeId}/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }, "Impossible de mettre à jour les fichiers de l'enveloppe");
  },

  cancelEnvelope: id => {
    const envelopeId = normalizeEnvelopeId(id);
    return apiRequest('post', `${BASE}/envelopes/${envelopeId}/cancel/`, undefined, undefined, "Impossible d'annuler l'enveloppe");
  },

  restoreEnvelope: id => {
    const envelopeId = normalizeEnvelopeId(id);
    return apiRequest('post', `${BASE}/envelopes/${envelopeId}/restore/`, undefined, undefined, "Impossible de restaurer l'enveloppe");
  },

  purgeEnvelope: id => {
    const envelopeId = normalizeEnvelopeId(id);
    return apiRequest('delete', `${BASE}/envelopes/${envelopeId}/purge/`, undefined, undefined, "Impossible de purger l'enveloppe");
  },

  sendEnvelope: (id, payload = {}) => {
    const envelopeId = normalizeEnvelopeId(id);
    return apiRequest('post', `${BASE}/envelopes/${envelopeId}/send/`, payload, undefined, "Impossible d'envoyer l'enveloppe");
  },

  // ─── Guest signing (token / OTP) ────────────────────────────────────
  getGuestEnvelope: (id, token) => {
    const envelopeId = normalizeEnvelopeId(id);
    const headers = token ? { 'X-Signature-Token': token } : {};
    return apiRequest('get', `${BASE}/envelopes/${envelopeId}/guest/`, null, { headers }, "Impossible de récupérer l'enveloppe invitée");
  },
  sendOtp: (id, token) => {
    const envelopeId = normalizeEnvelopeId(id);
    return apiRequest(
      'post',
      `${BASE}/envelopes/${envelopeId}/send_otp/`,
      {},
      token ? { headers: { 'X-Signature-Token': token } } : undefined,
      "Impossible d'envoyer le code OTP"
    );
  },

  verifyOtp: (id, otp, token) => {
    const envelopeId = normalizeEnvelopeId(id);
    return apiRequest(
      'post',
      `${BASE}/envelopes/${envelopeId}/verify_otp/`,
      { otp },
      token ? { headers: { 'X-Signature-Token': token } } : undefined,
      "Impossible de vérifier le code OTP"
    );
  },

  // ─── Signing ────────────────────────────────────────────────────────
  signGuest: (id, body, token) => {
    const envelopeId = normalizeEnvelopeId(id);
    const cfg = token ? { headers: { 'X-Signature-Token': token } } : undefined;
    // backend renvoie du JSON -> pas de responseType: 'blob'
    return apiRequest('post', `${BASE}/envelopes/${envelopeId}/sign/`, body, cfg, "Impossible de signer l'enveloppe en tant qu'invité");
  },

  signAuthenticated: (id, body) =>
    apiRequest('post', `${BASE}/envelopes/${normalizeEnvelopeId(id)}/sign_authenticated/`, body, undefined, "Impossible de signer l'enveloppe"),

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
    apiRequest('get', `${BASE}/envelopes/${normalizeEnvelopeId(id)}/sign-page/`, null, undefined, "Impossible de récupérer l'enveloppe"),
  
  
  changePassword: (uid, token, password) =>
    apiRequest('post', `${BASE}/change-password/`, { uid, token, password }, undefined, 'Impossible de changer le mot de passe'),

  // ─── HSM signing ─────────────────────────────────────────────────────
  hsmSign: (envelopeId, payload) =>
    apiRequest('post', `${BASE}/envelopes/${normalizeEnvelopeId(envelopeId)}/hsm_sign/`, payload, undefined, "Impossible de signer via HSM"),

  // ─── Download helpers ────────────────────────────────────────────────
  // Téléchargement "global" : renvoie l'URL qui pointe vers le signé si dispo, sinon original.
  downloadEnvelope: async envelopeId => {
    const normalizedId = normalizeEnvelopeId(envelopeId);
    const { download_url } = await apiRequest('get', `${BASE}/envelopes/${normalizedId}/download/`, null, undefined, "Impossible de préparer le téléchargement");
    const pdfBlob = await apiRequest('get', download_url, null, { responseType: 'blob' }, "Impossible de télécharger le document");
    return { download_url: URL.createObjectURL(pdfBlob) };
  },
// --- Vérification QR publique (uuid + sig) ---
verifyQRCodeWithSig: (uuid, sig) =>
  apiRequest('get', `${BASE}/prints/${uuid}/verify/`, null, { params: { sig } }, 'Impossible de vérifier le QR code'),

// --- URL absolue vers le PDF signé via uuid+sig (sans JWT, pérenne) ---
getQRCodeDocumentAbsoluteUrl: (uuid, sig) => {
  const base = (api.defaults.baseURL || '').replace(/\/$/, '');
  const rel = `${BASE}/prints/${uuid}/document/?sig=${encodeURIComponent(sig || '')}`;
  return `${base}/${rel.replace(/^\//, '')}`;
},

// --- Ouvrir le PDF dans l'onglet courant (convenient) ---
openQRCodeDocument: (uuid, sig) => {
  const base = (api.defaults.baseURL || '').replace(/\/$/, '');
  const url = `${base}/${BASE}/prints/${uuid}/document/?sig=${encodeURIComponent(sig || '')}`;
  window.location.assign(url);
},

// Téléchargement d'un document précis (si tu ajoutes un endpoint côté vue)
  // Sinon, utilise simplement doc.file_url côté front.

  fetchDocumentBlob: async (envelopeId, documentId) => {
    const normalizedId = normalizeEnvelopeId(envelopeId);
    const url = `${BASE}/envelopes/${normalizedId}/documents/${documentId}/file/`;
    const blob = await apiRequest('get', url, null, { responseType: 'blob' }, 'Impossible de récupérer le fichier');
    // Sanity check (optionnel) : vérifier le type
    if (!blob) throw new Error('Fichier introuvable');
    return URL.createObjectURL(blob);
  },

// Relance manuelle par le créateur
  remindNow: (id) =>
    apiRequest('post', `${BASE}/envelopes/${normalizeEnvelopeId(id)}/remind/`, undefined, undefined, "Impossible de relancer l'enveloppe"),

  // URLs directes "brutes"
  getOriginalDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${normalizeEnvelopeId(envelopeId)}/original-document/`,

  getSignedDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${normalizeEnvelopeId(envelopeId)}/signed-document/`,

    // renvoyer une URL ABSOLUE (utilise api.defaults.baseURL)
  getDecryptedDocumentUrl: (envelopeId, token) => {
    const normalizedId = normalizeEnvelopeId(envelopeId);
    const rel = `${BASE}/envelopes/${normalizedId}/document/?token=${encodeURIComponent(
      token || ''
    )}`;
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/${rel.replace(/^\//, '')}`;
  },

  // ─── Signatures / QR codes  ───────────────────────────────
  getSignatures: envelopeId =>
    apiRequest('get', `${BASE}/signatures/`, null, { params: { envelope: normalizeEnvelopeId(envelopeId) } }, 'Impossible de récupérer les signatures'),

  generateQRCode: (envelopeId, type) =>
    apiRequest('post', `${BASE}/prints/generate/`, { envelope: normalizeEnvelopeId(envelopeId), qr_type: type }, undefined, 'Impossible de générer le QR code'),

  getQRCodes: () => apiRequest('get', `${BASE}/prints/`, null, undefined, 'Impossible de récupérer les QR codes'),

  verifyQRCode: uuid => apiRequest('get', `${BASE}/prints/${uuid}/verify/`, null, undefined, 'Impossible de vérifier le QR code'),
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

  // ─── Saved signatures ───────────────────────────────────────────────
  listSavedSignatures: () =>
    apiRequest('get', `${BASE}/saved-signatures/`, null, undefined, 'Impossible de récupérer les signatures enregistrées'),

  createSavedSignature: (payload) => {
    const config = payload instanceof FormData ? {
      headers: { 'Content-Type': 'multipart/form-data' }
    } : {};
    return apiRequest('post', `${BASE}/saved-signatures/`, payload, config, 'Impossible de créer la signature enregistrée');
  },

  deleteSavedSignature: (id) =>
    apiRequest('delete', `${BASE}/saved-signatures/${id}/`, null, undefined, 'Impossible de supprimer la signature enregistrée'),


};
