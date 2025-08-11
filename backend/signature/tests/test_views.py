from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

class AuthTests(APITestCase):
    def test_register_invalid(self):
        url = reverse('register')
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, 400)

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
