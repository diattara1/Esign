
from pathlib import Path
import base64
import os
import environ
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

ALLOWED_HOSTS = ['*']

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
]
CORS_ALLOW_CREDENTIALS = True

env = environ.Env()

environ.Env.read_env(os.path.join(BASE_DIR, ".env"))
PDF_SIGNER_DIR = BASE_DIR / "certs"
# --- Signature / Certs (ton certificat SIGNER) ---
SELF_SIGN_CERT_FILE = PDF_SIGNER_DIR / "selfsign_cert.pem"   #  cert de signature (PEM)
SELF_SIGN_KEY_FILE  = PDF_SIGNER_DIR / "selfsign_key.pem"    #  clé privée (PEM)
SELF_SIGN_CA_CHAIN  = [PDF_SIGNER_DIR / "selfsign_cert.pem"] # chaîne complète si tu as un CA

# URL du TSA
FREETSA_URL    = "https://freetsa.org/tsr"

# Chemins vers les certs FreeTSA
FREETSA_TSA    = BASE_DIR / "certs" / "tsa.crt"
FREETSA_CACERT = BASE_DIR / "certs" / "cacert.pem"
# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = True
# File encryption key
try:
    FILE_ENCRYPTION_KEY = base64.urlsafe_b64decode(env("FILE_ENCRYPTION_KEY"))
    if len(FILE_ENCRYPTION_KEY) != 32:
        raise ImproperlyConfigured("FILE_ENCRYPTION_KEY must be a 32-byte key")
except Exception as e:
    raise ImproperlyConfigured(f"Invalid FILE_ENCRYPTION_KEY: {e}")

# Use custom EncryptedFileSystemStorage
DEFAULT_FILE_STORAGE = 'signature.storages.EncryptedFileSystemStorage'
CORS_ALLOW_ALL_ORIGINS = True
AUTH_USER_MODEL = 'signature.CustomUser'
# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'signature',  
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'esign.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            BASE_DIR / 'templates',
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

SIMPLE_JWT = {
  'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),        # par défaut 5 min, ici 1 h
  'REFRESH_TOKEN_LIFETIME': timedelta(days=7),       # refresh valable 7 jours
  'ROTATE_REFRESH_TOKENS': True,                     # on renouvelle le refresh
  'BLACKLIST_AFTER_ROTATION': True,                  # blacklist l’ancien
}

WSGI_APPLICATION = 'esign.wsgi.application'

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-signature-token',  # Add the custom header
]
# Database
# https://docs.djangoproject.com/en/4.2/ref/settings/#databases

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST"),
        "PORT": env("POSTGRES_PORT"),
    }
}
# settings.py



REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'signature.authentication.CookieJWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

CELERY_BROKER_URL = env.str('CELERY_BROKER_URL', 'redis://localhost:6379/0')
# Nombre max de rappels par destinataire
MAX_REMINDERS_SIGN = 5

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    "signature-reminders-every-10min": {
        "task": "signature.tasks.process_signature_reminders",
        "schedule": 600.0,   # 10 minutes
    },
    "signature-deadlines-every-5min": {
        "task": "signature.tasks.process_deadlines",
        "schedule": 300.0,   # 5 minutes
    },
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

# Configuration email templates
APP_NAME = "Votre Plateforme IntelliSign"

# Email configuration
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
DEFAULT_FROM_EMAIL = env("EMAIL_HOST_USER")
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")
FRONT_BASE_URL = env.str("FRONT_BASE_URL")
# Internationalization
# https://docs.djangoproject.com/en/4.2/topics/i18n/

LANGUAGE_CODE = 'fr'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.2/howto/static-files/

STATIC_URL = 'static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
# https://docs.djangoproject.com/en/4.2/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
