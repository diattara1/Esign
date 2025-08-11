from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from django.shortcuts import redirect
from django.core.mail import send_mail
from django.conf import settings
from django.urls import reverse
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.contrib.auth.tokens import default_token_generator
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from ..serializers import UserRegistrationSerializer, UserProfileSerializer, PasswordResetSerializer

User = get_user_model()


class CookieTokenObtainPairView(TokenObtainPairView):
    """Issue JWTs and store them in HttpOnly cookies."""

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        access = response.data.get('access')
        refresh = response.data.get('refresh')
        if access:
            response.set_cookie('access_token', access, httponly=True, secure=True, samesite='Lax')
        if refresh:
            response.set_cookie('refresh_token', refresh, httponly=True, secure=True, samesite='Lax')
        response.data = {'detail': 'Login successful'}
        return response


class CookieTokenRefreshView(TokenRefreshView):
    """Refresh access token using HttpOnly refresh cookie."""

    def post(self, request, *args, **kwargs):
        if 'refresh' not in request.data:
            refresh = request.COOKIES.get('refresh_token')
            if refresh:
                request.data['refresh'] = refresh
        response = super().post(request, *args, **kwargs)
        access = response.data.get('access')
        refresh = response.data.get('refresh')
        if access:
            response.set_cookie('access_token', access, httponly=True, secure=True, samesite='Lax')
        if refresh:
            response.set_cookie('refresh_token', refresh, httponly=True, secure=True, samesite='Lax')
        response.data = {'detail': 'Token refreshed'}
        return response


@api_view(['POST'])
@permission_classes([AllowAny])
def logout(request):
    """Clear authentication cookies."""
    response = Response({'detail': 'Logout successful'}, status=status.HTTP_200_OK)
    response.delete_cookie('access_token')
    response.delete_cookie('refresh_token')
    return response

@api_view(['POST'])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def register(request):
    serializer = UserRegistrationSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.save()
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        activation_link = request.build_absolute_uri(
            reverse('activate-account', kwargs={'uidb64': uid, 'token': token})
        )
        send_mail(
            'Activation de compte',
            f'Cliquez sur ce lien pour activer votre compte : {activation_link}',
            settings.DEFAULT_FROM_EMAIL,
            [user.email],
            fail_silently=True,
        )
        return Response(
            {'detail': 'Inscription réussie. Vérifiez votre e-mail pour activer votre compte.'},
            status=status.HTTP_201_CREATED,
        )
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([AllowAny])
def activate_account(request, uidb64, token):
    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except (User.DoesNotExist, ValueError, TypeError, OverflowError):
        return redirect(f"{settings.FRONT_BASE_URL}/login?activated=0")

    if default_token_generator.check_token(user, token):
        user.is_active = True
        user.save()
        return redirect(f"{settings.FRONT_BASE_URL}/login?activated=1")
    return redirect(f"{settings.FRONT_BASE_URL}/login?activated=0")

@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def user_profile(request):
    if request.method == 'GET':
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)

    serializer = UserProfileSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request(request):
    serializer = PasswordResetSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        serializer.save()
        return Response({'detail': 'Email de réinitialisation envoyé'}, status=status.HTTP_200_OK)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_token(request):
    """Endpoint pour vérifier la validité du token JWT"""
    try:
        user = request.user
        return Response({
            'valid': True,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'birth_date': user.birth_date,
                'phone_number': user.phone_number,
                'gender': user.gender,
                'address': user.address,
                'avatar': user.avatar.url if user.avatar else None,
            }
        }, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({
            'valid': False,
            'error': str(e)
        }, status=status.HTTP_401_UNAUTHORIZED)
