# signature/urls.py
from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views.envelope import (EnvelopeViewSet,PrintQRCodeViewSet,guest_envelope_view,serve_decrypted_pdf)
from .views.auth import (register,activate_account,user_profile,password_reset_request,change_password,)
from .views.notification import NotificationPreferenceViewSet
from .views.batch import SelfSignView, BatchSignCreateView, BatchSignJobViewSet
from .views.saved_signature import SavedSignatureViewSet

router = DefaultRouter()
router.register(r"batch-jobs", BatchSignJobViewSet, basename="batch-jobs")
router.register(r'envelopes', EnvelopeViewSet, basename='envelopes')
router.register(r'prints', PrintQRCodeViewSet, basename='prints')
router.register(r'notifications', NotificationPreferenceViewSet, basename='notifications')
router.register(r'saved-signatures', SavedSignatureViewSet, basename='saved-signatures')



urlpatterns = [
    path('', include(router.urls)),
    path("self-sign/", SelfSignView.as_view()),
    path("batch-sign/", BatchSignCreateView.as_view()),
    path('register/', register, name='register'),
    path('activate/<uidb64>/<token>/', activate_account, name='activate-account'),
    path('profile/', user_profile, name='user-profile'),
    path('password-reset/', password_reset_request, name='password-reset'),
    path('change-password/', change_password, name='change-password'),
    path('envelopes/<int:pk>/guest/', guest_envelope_view, name='guest-envelope'),
    path('envelopes/<int:pk>/document/', serve_decrypted_pdf, name='signature-serve-decrypted-pdf'),
    
]

