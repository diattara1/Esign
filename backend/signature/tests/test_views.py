import uuid

from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.conf import settings
from rest_framework import status
from rest_framework.test import APITestCase

import jwt

from signature.models import Envelope, EnvelopeRecipient

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
        url = reverse('guest-envelope', kwargs={'public_id': uuid.uuid4()})
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


class GuestEnvelopeAccessTests(APITestCase):
    def setUp(self):
        self.creator = get_user_model().objects.create_user(
            username='creator',
            email='creator@example.com',
            password='secret',
        )
        self.envelope = Envelope.objects.create(
            title='Cancelled envelope',
            created_by=self.creator,
            status='cancelled',
        )
        self.recipient = EnvelopeRecipient.objects.create(
            envelope=self.envelope,
            email='guest@example.com',
            full_name='Guest User',
            order=1,
        )
        payload = {
            'env_id': str(self.envelope.public_id),
            'recipient_id': self.recipient.id,
        }
        secret = getattr(settings, 'SIGNATURE_JWT_SECRET', settings.SECRET_KEY)
        token = jwt.encode(payload, secret, algorithm='HS256')
        self.token = token if isinstance(token, str) else token.decode('utf-8')

    def test_guest_envelope_view_cancelled_envelope_denied(self):
        url = reverse('guest-envelope', kwargs={'public_id': self.envelope.public_id})
        response = self.client.get(url, {'token': self.token})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('annul', response.data['error'].lower())

    def test_guest_document_view_cancelled_envelope_denied(self):
        url = reverse('signature-serve-decrypted-pdf', kwargs={'public_id': self.envelope.public_id})
        response = self.client.get(url, {'token': self.token})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('annul', response.data['error'].lower())


class GuestEnvelopeDataIsolationTests(APITestCase):
    def setUp(self):
        self.creator = get_user_model().objects.create_user(
            username='guest-creator',
            email='creator2@example.com',
            password='secret',
        )
        self.envelope = Envelope.objects.create(
            title='Shared envelope',
            created_by=self.creator,
            status='sent',
        )
        self.recipient_1 = EnvelopeRecipient.objects.create(
            envelope=self.envelope,
            email='first@example.com',
            full_name='First Recipient',
            order=1,
        )
        self.recipient_2 = EnvelopeRecipient.objects.create(
            envelope=self.envelope,
            email='second@example.com',
            full_name='Second Recipient',
            order=2,
        )
        payload = {
            'env_id': str(self.envelope.public_id),
            'recipient_id': self.recipient_1.id,
        }
        secret = getattr(settings, 'SIGNATURE_JWT_SECRET', settings.SECRET_KEY)
        token = jwt.encode(payload, secret, algorithm='HS256')
        self.token = token if isinstance(token, str) else token.decode('utf-8')

    def test_guest_response_hides_other_recipients(self):
        url = reverse('guest-envelope', kwargs={'public_id': self.envelope.public_id})
        response = self.client.get(url, {'token': self.token})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('document_url', response.data)
        self.assertIn('fields', response.data)
        self.assertNotIn('recipients', response.data)

        current = response.data.get('current_recipient')
        self.assertIsNotNone(current)
        self.assertEqual(current.get('email'), self.recipient_1.email)
        self.assertEqual(response.data.get('recipient_full_name'), self.recipient_1.full_name)

        serialized_payload = str(response.data)
        self.assertNotIn(self.recipient_2.email, serialized_payload)
        self.assertNotIn(self.recipient_2.full_name, serialized_payload)
