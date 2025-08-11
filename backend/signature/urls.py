# signature/urls.py
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views.envelope import (
    EnvelopeViewSet,
    PrintQRCodeViewSet,
    guest_envelope_view,
    serve_decrypted_pdf,
)
from .views.auth import (
    register,
    activate_account,
    user_profile,
    password_reset_request,
)
from .views.notification import NotificationPreferenceViewSet

router = DefaultRouter()
router.register(r'envelopes', EnvelopeViewSet, basename='envelopes')
router.register(r'prints', PrintQRCodeViewSet, basename='prints')
router.register(r'notifications', NotificationPreferenceViewSet, basename='notifications')

urlpatterns = [
    path('', include(router.urls)),
    path('register/', register, name='register'),
    path('activate/<uidb64>/<token>/', activate_account, name='activate-account'),
    path('profile/', user_profile, name='user-profile'),
    path('password-reset/', password_reset_request, name='password-reset'),
    path('envelopes/<int:pk>/guest/', guest_envelope_view, name='guest-envelope'),
    path('envelopes/<int:pk>/document/', serve_decrypted_pdf, name='serve-decrypted-pdf'),
]

