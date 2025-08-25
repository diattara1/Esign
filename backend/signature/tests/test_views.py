from django.urls import reverse
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

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
