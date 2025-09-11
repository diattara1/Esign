from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.core.files.base import ContentFile
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch
from PIL import Image
import base64
import io
from signature.models import Envelope, EnvelopeRecipient, SignatureDocument
from reportlab.pdfgen import canvas

class AuthTests(APITestCase):
    def test_register_invalid(self):
        url = reverse('register')
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, 400)

    def test_verify_token_unauthenticated(self):
        url = reverse('verify_token')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 401)

class EnvelopeTests(APITestCase):
    def test_guest_envelope_not_found(self):
        url = reverse('guest-envelope', kwargs={'pk': 999})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)

class NotificationTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='u', password='p', email='u@example.com')
        self.client.force_authenticate(user=self.user)

    def test_list_notifications(self):
        url = reverse('notifications-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)


class ThrottleTests(APITestCase):
    def setUp(self):
        cache.clear()

    def tearDown(self):
        cache.clear()

    def test_register_throttled(self):
        url = reverse('register')
        response1 = self.client.post(url, {})
        self.assertEqual(response1.status_code, 400)
        response2 = self.client.post(url, {})
        self.assertEqual(response2.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_password_reset_throttled(self):
        user = get_user_model().objects.create_user(
            username='foo', email='foo@example.com', password='bar'
        )
        url = reverse('password-reset')
        response1 = self.client.post(url, {'email': user.email})
        self.assertEqual(response1.status_code, 200)
        response2 = self.client.post(url, {'email': user.email})
        self.assertEqual(response2.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class QRCodeIntegrationTests(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(
            username='sig', email='sig@example.com', password='pass'
        )
        self.client.force_authenticate(user=self.user)

    def _create_pdf(self):
        buf = io.BytesIO()
        c = canvas.Canvas(buf)
        c.drawString(100, 750, "Hello")
        c.save()
        return buf.getvalue()

    def _jpeg_b64(self):
        img = Image.new('RGB', (1, 1), 'white')
        buf = io.BytesIO()
        img.save(buf, format='JPEG')
        return base64.b64encode(buf.getvalue()).decode()

    def test_qr_overlay_after_final_signature(self):
        pdf_bytes = self._create_pdf()
        envelope = Envelope.objects.create(
            title='Doc', created_by=self.user, include_qr_code=True
        )
        envelope.document_file.save('doc.pdf', ContentFile(pdf_bytes))
        envelope.save()
        recipient = EnvelopeRecipient.objects.create(
            envelope=envelope,
            user=self.user,
            email=self.user.email,
            full_name='Signer',
            order=1,
        )

        signed_fields = {
            'f1': {
                'id': 'f1',
                'recipient_id': recipient.id,
                'page': 1,
                'position': {'x': 0.1, 'y': 0.1, 'width': 0.2, 'height': 0.1},
            }
        }

        with patch('signature.views.envelope.send_signature_email.delay'), \
             patch('signature.views.envelope.send_document_completed_notification.delay'), \
             patch('signature.views.envelope.send_signed_pdf_to_all_signers.delay'):
            send_url = reverse('envelopes-send', kwargs={'pk': envelope.id})
            resp = self.client.post(send_url, {'include_qr_code': 'true'})
            self.assertEqual(resp.status_code, 200)

            sign_url = reverse('envelopes-sign-authenticated', kwargs={'pk': envelope.id})
            resp = self.client.post(
                sign_url,
                {
                    'signature_data': self._jpeg_b64(),
                    'signed_fields': signed_fields,
                },
                format='json',
            )
            self.assertEqual(resp.status_code, 200)

        sig_doc = SignatureDocument.objects.get(envelope=envelope, recipient=recipient)
        self.assertTrue(sig_doc.certificate_data.get('qr_embedded'))

        sig_doc.signed_file.open('rb')
        pdf_content = sig_doc.signed_file.read()
        sig_doc.signed_file.close()
        self.assertIn(b'\x89PNG', pdf_content)
