import { api } from './apiUtils';

const BASE = 'api/signature';

export default {
  // ─── Envelopes listing / CRUD ──────────────────────────────────────────
  getEnvelopes: (params = {}) =>
    api.get(`${BASE}/envelopes/`, { params }).then(res => res.data),

  /**
   * Spécifique : récupère uniquement les enveloppes 'action_required'.
   */
  getActionRequiredEnvelopes: () =>
    api
      .get(`${BASE}/envelopes/`, { params: { status: 'action_required' } })
      .then(res => res.data),

  /**
   * Récupère les enveloppes dont le statut est 'action_required' (documents à signer).
   */
  getReceivedEnvelopes: () =>
    api
      .get(`${BASE}/envelopes/`, { params: { status: 'action_required' } })
      .then(res => res.data),

  /**
   * Récupère les enveloppes complétées pour l'utilisateur.
   */
  getCompletedEnvelopes: () =>
    api
      .get(`${BASE}/envelopes/`, { params: { status: 'completed' } })
      .then(res => res.data),

  getEnvelope: (id, config = {}) =>
    api.get(`${BASE}/envelopes/${id}/`, config).then(res => res.data),

  createEnvelope: data => {
    console.log('Creating envelope with FormData:');
    for (let [key, value] of data.entries()) {
      console.log(
        `${key}: ${
          value instanceof File ? `${value.name} (${value.size} bytes)` : value
        }`
      );
    }
    return api.post(`${BASE}/envelopes/`, data).then(res => res.data);
  },

  updateEnvelope: (id, payload) =>
    api.patch(`${BASE}/envelopes/${id}/`, payload).then(res => res.data),

  cancelEnvelope: id =>
    api.post(`${BASE}/envelopes/${id}/cancel/`).then(res => res.data),

  sendEnvelope: id =>
    api.post(`${BASE}/envelopes/${id}/send/`).then(res => res.data),

  // ─── Guest signing (token / OTP) ────────────────────────────────────
  getGuestEnvelope: (id, token) =>
    api
      .get(`${BASE}/envelopes/${id}/guest/`, {
        headers: { 'X-Signature-Token': token },
      })
      .then(res => res.data),

  sendOtp: (id, token) =>
    api.post(
      `${BASE}/envelopes/${id}/send_otp/`,
      {},
      { headers: { 'X-Signature-Token': token } }
    ),

  verifyOtp: (id, otp, token) =>
    api.post(
      `${BASE}/envelopes/${id}/verify_otp/`,
      { otp },
      { headers: { 'X-Signature-Token': token } }
    ),

  // ─── Guest signing ──────────────────────────────────────────────────
  signGuest: (id, body, token) => {
    const config = { responseType: 'blob' };
    if (token) {
      config.headers = { 'X-Signature-Token': token };
    }
    return api.post(`${BASE}/envelopes/${id}/sign/`, body, config);
  },

  // ─── Authenticated user signing ─────────────────────────────────────
  signAuthenticated: (id, body) => {
    return api.post(`${BASE}/envelopes/${id}/sign_authenticated/`, body);
  },

  // ─── Unified sign() for guest or authenticated user ──────────────
  sign(id, body, token) {
    if (token) {
      // Guest flow
      return this.signGuest(id, body, token);
    } else {
      // Authenticated user flow
      return this.signAuthenticated(id, body);
    }
  },

  // ─── In‑app signing for authenticated users ──────────────────────────
  getAuthenticatedEnvelope: id =>
    api.get(`${BASE}/envelopes/${id}/sign-page/`).then(res => res.data),

  // ─── HSM signing (backend) ───────────────────────────────────────────
  hsmSign: (envelopeId, payload) =>
    api.post(`${BASE}/envelopes/${envelopeId}/hsm_sign/`, payload).then(res => res.data),

  // ─── Download / view PDF ─────────────────────────────────────────────
  downloadEnvelope: async envelopeId => {
    const { download_url } = await api
      .get(`${BASE}/envelopes/${envelopeId}/download/`)
      .then(res => res.data);
    const pdfResp = await api.get(download_url, { responseType: 'blob' });
    return { download_url: URL.createObjectURL(pdfResp.data) };
  },

  // URLs directes
  getOriginalDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${envelopeId}/original-document/`,

  getSignedDocumentUrl: envelopeId =>
    `${BASE}/envelopes/${envelopeId}/signed-document/`,

  getDecryptedDocumentUrl: (envelopeId, token) =>
    `${BASE}/envelopes/${envelopeId}/document/?token=${token}`,

  // ─── Signatures history & QR codes ─────────────────────────────────
  getSignatures: envelopeId =>
    api
      .get(`${BASE}/signatures/`, { params: { envelope: envelopeId } })
      .then(res => res.data),

  generateQRCode: (envelopeId, type) =>
    api
      .post(`${BASE}/prints/generate/`, {
        envelope: envelopeId,
        qr_type: type,
      })
      .then(res => res.data),

  getQRCodes: () =>
    api.get(`${BASE}/prints/`).then(res => res.data),

  verifyQRCode: uuid =>
    api.get(`${BASE}/prints/${uuid}/verify/`).then(res => res.data),
};
