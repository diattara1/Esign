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

    def test_guest_envelope_view_excludes_sensitive_fields(self):
        accessible_envelope = Envelope.objects.create(
            title='Visible envelope',
            description='Guest readable description',
            created_by=self.creator,
            status='sent',
            jwt_token='should-not-leak',
        )
        recipient = EnvelopeRecipient.objects.create(
            envelope=accessible_envelope,
            email='guest2@example.com',
            full_name='Guest User 2',
            order=1,
        )

        payload = {
            'env_id': str(accessible_envelope.public_id),
            'recipient_id': recipient.id,
        }
        secret = getattr(settings, 'SIGNATURE_JWT_SECRET', settings.SECRET_KEY)
        token = jwt.encode(payload, secret, algorithm='HS256')
        token = token if isinstance(token, str) else token.decode('utf-8')

        url = reverse('guest-envelope', kwargs={'public_id': accessible_envelope.public_id})
        response = self.client.get(url, {'token': token})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data['public_id'], str(accessible_envelope.public_id))
        self.assertEqual(data['title'], accessible_envelope.title)
        self.assertEqual(data['description'], accessible_envelope.description)
        self.assertEqual(data['status'], accessible_envelope.status)
        self.assertIn('created_at', data)
        self.assertIn('updated_at', data)
        self.assertIn('deadline_at', data)
        self.assertIn('expires_at', data)
        self.assertIn('fields', data)
        self.assertIsInstance(data['fields'], list)
        self.assertEqual(data['recipient_id'], recipient.id)
        self.assertEqual(data['recipient_full_name'], recipient.full_name)
        self.assertIn('document_url', data)

        sensitive_keys = [
            'jwt_token',
            'created_by',
            'created_by_name',
            'recipients',
            'documents',
            'hash_original',
            'file_size',
            'file_type',
            'completion_rate',
            'id',
        ]
        for key in sensitive_keys:
            self.assertNotIn(key, data)

    def test_guest_document_view_cancelled_envelope_denied(self):
        url = reverse('signature-serve-decrypted-pdf', kwargs={'public_id': self.envelope.public_id})
        response = self.client.get(url, {'token': self.token})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('annul', response.data['error'].lower())
