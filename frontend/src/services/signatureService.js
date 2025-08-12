import { api } from './apiUtils';

const BASE = 'api/signature';

async function tryGet(url, config = {}) {
  try {
    const res = await api.get(url, config);
    return res.data;
  } catch (e) {
    throw e;
  }
}

export default {
  // ─── Envelopes listing / CRUD ──────────────────────────────────────────
  getEnvelopes: (params = {}) =>
    api.get(`${BASE}/envelopes/`, { params }).then(res => res.data),

  getActionRequiredEnvelopes: () =>
    api.get(`${BASE}/envelopes/`, { params: { status: 'action_required' } })
       .then(res => res.data),

  getReceivedEnvelopes: () =>
    api.get(`${BASE}/envelopes/`, { params: { status: 'action_required' } })
       .then(res => res.data),

  getCompletedEnvelopes: () =>
    api.get(`${BASE}/envelopes/`, { params: { status: 'completed' } })
       .then(res => res.data),

  getEnvelope: (id, config = {}) =>
    api.get(`${BASE}/envelopes/${id}/`, config).then(res => res.data),

  createEnvelope: data =>
    api.post(`${BASE}/envelopes/`, data).then(res => res.data),

  updateEnvelope: (id, payload) =>
    api.patch(`${BASE}/envelopes/${id}/`, payload).then(res => res.data),

  // NEW: PATCH multipart pour ajouter plusieurs fichiers (champ 'files' répété)
  updateEnvelopeFiles: (id, files) => {
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    return api.patch(`${BASE}/envelopes/${id}/`, form, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(res => res.data);
  },

  cancelEnvelope: id =>
    api.post(`${BASE}/envelopes/${id}/cancel/`).then(res => res.data),

  sendEnvelope: id =>
    api.post(`${BASE}/envelopes/${id}/send/`).then(res => res.data),

  // ─── Guest signing (token / OTP) ────────────────────────────────────
  // On tente d'abord /guest/:id/ (correspond à ton view def guest_envelope_view),
  // sinon fallback /envelopes/:id/guest/
  getGuestEnvelope: async (id, token) => {
    const headers = token ? { 'X-Signature-Token': token } : {};
    try {
      return await tryGet(`${BASE}/guest/${id}/`, { headers });
    } catch {
      // fallback
      return await tryGet(`${BASE}/envelopes/${id}/guest/`, { headers });
    }
  },

  sendOtp: (id, token) =>
    api.post(
      `${BASE}/envelopes/${id}/send_otp/`,
      {},
      token ? { headers: { 'X-Signature-Token': token } } : undefined
    ),

  verifyOtp: (id, otp, token) =>
    api.post(
      `${BASE}/envelopes/${id}/verify_otp/`,
      { otp },
      token ? { headers: { 'X-Signature-Token': token } } : undefined
    ),

  // ─── Signing ────────────────────────────────────────────────────────
  signGuest: (id, body, token) => {
    const cfg = token ? { headers: { 'X-Signature-Token': token } } : undefined;
    // backend renvoie du JSON -> pas de responseType: 'blob'
    return api.post(`${BASE}/envelopes/${id}/sign/`, body, cfg).then(res => res.data);
  },

  signAuthenticated: (id, body) =>
    api.post(`${BASE}/envelopes/${id}/sign_authenticated/`, body).then(res => res.data),

  sign(id, body, token) {
    return token ? this.signGuest(id, body, token) : this.signAuthenticated(id, body);
  },

  getAuthenticatedEnvelope: id =>
    api.get(`${BASE}/envelopes/${id}/sign-page/`).then(res => res.data),

  // ─── HSM signing ─────────────────────────────────────────────────────
  hsmSign: (envelopeId, payload) =>
    api.post(`${BASE}/envelopes/${envelopeId}/hsm_sign/`, payload).then(res => res.data),

  // ─── Download helpers ────────────────────────────────────────────────
  // Téléchargement "global" : renvoie l'URL qui pointe vers le signé si dispo, sinon original.
  downloadEnvelope: async envelopeId => {
    const { download_url } = await api
      .get(`${BASE}/envelopes/${envelopeId}/download/`)
      .then(res => res.data);
    const pdfResp = await api.get(download_url, { responseType: 'blob' });
    return { download_url: URL.createObjectURL(pdfResp.data) };
  },

  // Téléchargement d'un document précis (si tu ajoutes un endpoint côté vue)
  // Sinon, utilise simplement doc.file_url côté front.
  downloadEnvelopeDocument: async (envelopeId, documentId) => {
    const { download_url } = await api
      .get(`${BASE}/envelopes/${envelopeId}/documents/${documentId}/download/`)
      .then(res => res.data);
    const pdfResp = await api.get(download_url, { responseType: 'blob' });
    return { download_url: URL.createObjectURL(pdfResp.data) };
  },
fetchDocumentBlob: async (envelopeId, documentId) => {
  const url = `${BASE}/envelopes/${envelopeId}/documents/${documentId}/file/`;
  const resp = await api.get(url, { responseType: 'blob' });
  // Sanity check (optionnel) : vérifier le type
  if (!resp?.data) throw new Error('Fichier introuvable');
  return URL.createObjectURL(resp.data);
},

// Relance manuelle par le créateur
remindNow: (id) =>
  api.post(`${BASE}/envelopes/${id}/remind/`).then(res => res.data),

  // URLs directes "brutes"
  getOriginalDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${envelopeId}/original-document/`,

  getSignedDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${envelopeId}/signed-document/`,

  getDecryptedDocumentUrl: (envelopeId, token) =>
    `${BASE}/envelopes/${envelopeId}/document/?token=${token}`,

  // ─── Signatures / QR codes  ───────────────────────────────
  getSignatures: envelopeId =>
    api.get(`${BASE}/signatures/`, { params: { envelope: envelopeId } })
       .then(res => res.data),

  generateQRCode: (envelopeId, type) =>
    api.post(`${BASE}/prints/generate/`, { envelope: envelopeId, qr_type: type })
       .then(res => res.data),

  getQRCodes: () => api.get(`${BASE}/prints/`).then(res => res.data),

  verifyQRCode: uuid => api.get(`${BASE}/prints/${uuid}/verify/`).then(res => res.data),


};
