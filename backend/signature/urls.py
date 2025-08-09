# signature/urls.py
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import EnvelopeViewSet, PrintQRCodeViewSet, guest_envelope_view,serve_decrypted_pdf
router = DefaultRouter()
router.register(r'envelopes',EnvelopeViewSet,basename='envelopes')
router.register(r'prints',PrintQRCodeViewSet,basename='prints')
urlpatterns = [
    path('', include(router.urls)),
    
    path('envelopes/<int:pk>/guest/', guest_envelope_view, name='guest-envelope'),
    path('envelopes/<int:pk>/document/', serve_decrypted_pdf, name='serve-decrypted-pdf'),
]