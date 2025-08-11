# signature/urls.py
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    EnvelopeViewSet,
    PrintQRCodeViewSet,
    guest_envelope_view,
    serve_decrypted_pdf,
    register,
    password_reset_request,
    NotificationPreferenceViewSet,
)
router = DefaultRouter()
router.register(r'envelopes',EnvelopeViewSet,basename='envelopes')
router.register(r'prints',PrintQRCodeViewSet,basename='prints')
router.register(r'notifications', NotificationPreferenceViewSet, basename='notifications')
urlpatterns = [
    path('', include(router.urls)),
     path('register/', register, name='register'),
    path('password-reset/', password_reset_request, name='password-reset'),
    path('envelopes/<int:pk>/guest/', guest_envelope_view, name='guest-envelope'),
    path('envelopes/<int:pk>/document/', serve_decrypted_pdf, name='serve-decrypted-pdf'),
]