from django.urls import reverse
from rest_framework.test import APITestCase


class CookieAuthenticationTests(APITestCase):
    def test_invalid_token_clears_cookies(self):
        url = reverse('register')
        self.client.cookies['access_token'] = 'bad'
        self.client.cookies['refresh_token'] = 'bad'
        response = self.client.post(url, {})
        self.assertEqual(response.status_code, 400)
        self.assertIn('access_token', response.cookies)
        self.assertIn('refresh_token', response.cookies)
        self.assertEqual(response.cookies['access_token'].value, '')
        self.assertEqual(response.cookies['refresh_token'].value, '')
        self.assertNotIn('access_token', self.client.cookies)
        self.assertNotIn('refresh_token', self.client.cookies)
