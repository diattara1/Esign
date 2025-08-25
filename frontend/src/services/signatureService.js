import { api } from './apiUtils';

const BASE = 'api/signature';

const apiRequest = (method, url, data, config) => {
  const m = method.toLowerCase();
  const args = m === 'get' || m === 'delete' ? [url, config] : [url, data, config];
  return api[m](...args).then(res => res.data);
};

export default {
  // ─── Envelopes listing / CRUD ──────────────────────────────────────────
  getEnvelopes: (params = {}) =>
    apiRequest('get', `${BASE}/envelopes/`, null, { params }),

  getReceivedEnvelopes: () =>
    apiRequest('get', `${BASE}/envelopes/`, null, { params: { status: 'action_required' } }),

  getCompletedEnvelopes: () =>
    apiRequest('get', `${BASE}/envelopes/`, null, { params: { status: 'completed' } }),

  getEnvelope: (id, config = {}) =>
    apiRequest('get', `${BASE}/envelopes/${id}/`, null, config),

  createEnvelope: data =>
    apiRequest('post', `${BASE}/envelopes/`, data),

  updateEnvelope: (id, payload) =>
    apiRequest('patch', `${BASE}/envelopes/${id}/`, payload),

  // NEW: PATCH multipart pour ajouter plusieurs fichiers (champ 'files' répété)
  updateEnvelopeFiles: (id, files) => {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return apiRequest('patch', `${BASE}/envelopes/${id}/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },

  cancelEnvelope: id =>
    apiRequest('post', `${BASE}/envelopes/${id}/cancel/`),

  sendEnvelope: (id, payload = {}) =>
    apiRequest('post', `${BASE}/envelopes/${id}/send/`, payload),

  // ─── Guest signing (token / OTP) ────────────────────────────────────
  getGuestEnvelope: (id, token) => {
    const headers = token ? { 'X-Signature-Token': token } : {};
    return apiRequest('get', `${BASE}/envelopes/${id}/guest/`, null, { headers });
  },
  sendOtp: (id, token) =>
    apiRequest(
      'post',
      `${BASE}/envelopes/${id}/send_otp/`,
      {},
      token ? { headers: { 'X-Signature-Token': token } } : undefined
    ),

  verifyOtp: (id, otp, token) =>
    apiRequest(
      'post',
      `${BASE}/envelopes/${id}/verify_otp/`,
      { otp },
      token ? { headers: { 'X-Signature-Token': token } } : undefined
    ),

  // ─── Signing ────────────────────────────────────────────────────────
  signGuest: (id, body, token) => {
    const cfg = token ? { headers: { 'X-Signature-Token': token } } : undefined;
    // backend renvoie du JSON -> pas de responseType: 'blob'
    return apiRequest('post', `${BASE}/envelopes/${id}/sign/`, body, cfg);
  },

  signAuthenticated: (id, body) =>
    apiRequest('post', `${BASE}/envelopes/${id}/sign_authenticated/`, body),

  sign(id, body, token) {
    return token ? this.signGuest(id, body, token) : this.signAuthenticated(id, body);
  },

  getAuthenticatedEnvelope: id =>
    apiRequest('get', `${BASE}/envelopes/${id}/sign-page/`),

  // ─── HSM signing ─────────────────────────────────────────────────────
  hsmSign: (envelopeId, payload) =>
    apiRequest('post', `${BASE}/envelopes/${envelopeId}/hsm_sign/`, payload),

  // ─── Download helpers ────────────────────────────────────────────────
  // Téléchargement "global" : renvoie l'URL qui pointe vers le signé si dispo, sinon original.
  downloadEnvelope: async envelopeId => {
    const { download_url } = await apiRequest('get', `${BASE}/envelopes/${envelopeId}/download/`);
    const pdfBlob = await apiRequest('get', download_url, null, { responseType: 'blob' });
    return { download_url: URL.createObjectURL(pdfBlob) };
  },
// --- Vérification QR publique (uuid + sig) ---
verifyQRCodeWithSig: (uuid, sig) =>
  apiRequest('get', `${BASE}/prints/${uuid}/verify/`, null, { params: { sig } }),

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
  const url = `${BASE}/envelopes/${envelopeId}/documents/${documentId}/file/`;
  const blob = await apiRequest('get', url, null, { responseType: 'blob' });
  // Sanity check (optionnel) : vérifier le type
  if (!blob) throw new Error('Fichier introuvable');
  return URL.createObjectURL(blob);
},

// Relance manuelle par le créateur
remindNow: (id) =>
  apiRequest('post', `${BASE}/envelopes/${id}/remind/`),

  // URLs directes "brutes"
  getOriginalDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${envelopeId}/original-document/`,

  getSignedDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${envelopeId}/signed-document/`,

    // renvoyer une URL ABSOLUE (utilise api.defaults.baseURL)
  getDecryptedDocumentUrl: (envelopeId, token) => {
    const rel = `${BASE}/envelopes/${envelopeId}/document/?token=${encodeURIComponent(
      token || ''
    )}`;
    const base = (api.defaults.baseURL || '').replace(/\/$/, '');
    return `${base}/${rel.replace(/^\//, '')}`;
  },

  // ─── Signatures / QR codes  ───────────────────────────────
  getSignatures: envelopeId =>
    apiRequest('get', `${BASE}/signatures/`, null, { params: { envelope: envelopeId } }),

  generateQRCode: (envelopeId, type) =>
    apiRequest('post', `${BASE}/prints/generate/`, { envelope: envelopeId, qr_type: type }),

  getQRCodes: () => apiRequest('get', `${BASE}/prints/`),

  verifyQRCode: uuid => apiRequest('get', `${BASE}/prints/${uuid}/verify/`),
// Self-sign (un ou plusieurs docs, même endroit)
selfSign: (formData, { sync = false } = {}) => {
  const config = {};
  if (sync) config.responseType = 'blob';

  return api.post(`${BASE}/self-sign/`, formData, config)
    .then(res => (sync ? res : res.data));
},

// Batch sign (same spot ou var spots)
createBatchSign: formData =>
  apiRequest('post', `${BASE}/batch-sign/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

getBatchJob: id =>
  apiRequest('get', `${BASE}/batch-jobs/${id}/`),

  downloadBatchZip: id =>
    apiRequest('get', `${BASE}/batch-jobs/${id}/download/`, null, { responseType: 'blob' })
      .then(data => {
        const url = URL.createObjectURL(data);
        return { url };
      }),

  // ─── Saved signatures ───────────────────────────────────────────────
  listSavedSignatures: () =>
    apiRequest('get', `${BASE}/saved-signatures/`),

  createSavedSignature: (payload) => {
    const config = payload instanceof FormData ? {
      headers: { 'Content-Type': 'multipart/form-data' }
    } : {};
    return apiRequest('post', `${BASE}/saved-signatures/`, payload, config);
  },

  deleteSavedSignature: (id) =>
    apiRequest('delete', `${BASE}/saved-signatures/${id}/`),


};
