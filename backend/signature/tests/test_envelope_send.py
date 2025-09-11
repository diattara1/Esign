from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from signature.models import Envelope, EnvelopeRecipient


class EnvelopeSendIncludeQrCodeTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username="user", password="pass", email="u@example.com"
        )
        self.client.force_authenticate(user=self.user)

    def _create_envelope(self):
        envelope = Envelope.objects.create(title="Test", created_by=self.user)
        EnvelopeRecipient.objects.create(
            envelope=envelope, email="rec@example.com", full_name="Rec"
        )
        return envelope

    def test_include_qr_code_false_values(self):
        for value in ["false", False]:
            envelope = self._create_envelope()
            url = reverse("envelopes-send", kwargs={"pk": envelope.pk})
            response = self.client.post(url, {"include_qr_code": value})
            self.assertEqual(response.status_code, 200)
            envelope.refresh_from_db()
            self.assertFalse(envelope.include_qr_code)

    def test_include_qr_code_true_values(self):
        for value in ["true", True]:
            envelope = self._create_envelope()
            url = reverse("envelopes-send", kwargs={"pk": envelope.pk})
            response = self.client.post(url, {"include_qr_code": value})
            self.assertEqual(response.status_code, 200)
            envelope.refresh_from_db()
            self.assertTrue(envelope.include_qr_code)
