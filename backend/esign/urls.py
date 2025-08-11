from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from signature import views
from signature.views.auth import (
    verify_token,
    CookieTokenObtainPairView,
    CookieTokenRefreshView,
    logout,
)


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/signature/', include('signature.urls')),
    path('api/token/', CookieTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('api/logout/', logout, name='logout'),
    path('api/verify-token/', verify_token, name='verify_token'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)


