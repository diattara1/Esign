from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from signature import views

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/signature/', include('signature.urls')),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/verify-token/', views.verify_token, name='verify_token'),
]


