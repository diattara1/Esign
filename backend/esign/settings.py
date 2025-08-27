# settings.py (Django 5.x) — prêt pour Render

from pathlib import Path
from datetime import timedelta
from urllib.parse import urlparse
import os
import json
import environ

# ---------------------------------------------------------------------
# BASE
# ---------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

env = environ.Env()
# Charge backend/.env si présent (en prod, Render passe par env vars)
environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

# ---------------------------------------------------------------------
# SECRETS / DEBUG
# ---------------------------------------------------------------------
SECRET_KEY = env.str("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=False)

# ---------------------------------------------------------------------
# HOSTS / FRONT
# ---------------------------------------------------------------------
# FRONT_BASE_URL = "https://ton-front.onrender.com" (à définir sur Render)
FRONT_BASE_URL = env.str("FRONT_BASE_URL", default="")
_front_origin = None
if FRONT_BASE_URL:
    p = urlparse(FRONT_BASE_URL)
    _front_origin = f"{p.scheme}://{p.netloc}"

# ALLOWED_HOSTS peut être défini par env (liste CSV)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=[
    "localhost",
    "127.0.0.1",
    # Ajoute ici explicitement ton backend Render si tu veux être strict :
    # "esign-xxxxx.onrender.com",
])

# ---------------------------------------------------------------------
# APPS
# ---------------------------------------------------------------------
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Tiers
    "rest_framework",
    "corsheaders",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    # App(s) projet
    "signature",
]

# ---------------------------------------------------------------------
# MIDDLEWARE (ordre recommandé)
# ---------------------------------------------------------------------
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",      # juste après Security
    "corsheaders.middleware.CorsMiddleware",           # avant CommonMiddleware
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    # Ton middleware custom (iframe PDF)
    "signature.middleware.AllowIframeForPDFOnlyMiddleware",
]

ROOT_URLCONF = "esign.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "esign.wsgi.application"

# ---------------------------------------------------------------------
# CORS / CSRF
# ---------------------------------------------------------------------
# Autorise uniquement les origines nécessaires (désactive l’open bar)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    *_front_origin.split() if _front_origin else [],
    "http://localhost:5173",  # Vite dev
    "http://localhost:3000",  # CRA dev
]
# Si tu veux autoriser tous les *.onrender.com côté front:
# CORS_ALLOWED_ORIGIN_REGEXES = [r"^https://.*\.onrender\.com$"]

# En prod sur Render, Django doit faire confiance à ces origines pour CSRF
CSRF_TRUSTED_ORIGINS = [
    *_front_origin.split() if _front_origin else [],
    "https://*.onrender.com",
]

# En-têtes CORS supplémentaires acceptés (tes besoins)
CORS_ALLOW_HEADERS = [
    "accept",
    "accept-encoding",
    "authorization",
    "content-type",
    "dnt",
    "origin",
    "user-agent",
    "x-csrftoken",
    "x-requested-with",
    "x-signature-token",
]

# ---------------------------------------------------------------------
# DATABASE (PostgreSQL)
# ---------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env.str("POSTGRES_DB"),
        "USER": env.str("POSTGRES_USER"),
        "PASSWORD": env.str("POSTGRES_PASSWORD"),
        "HOST": env.str("POSTGRES_HOST"),
        "PORT": env.str("POSTGRES_PORT"),
    }
}

# ---------------------------------------------------------------------
# AUTH / REST / JWT
# ---------------------------------------------------------------------
AUTH_USER_MODEL = "signature.CustomUser"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "signature.authentication.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticated",
    ),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "40/minute",
        "user": "40/minute",
        "verify-token": "25/minute",
        "login": "5/minute",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# ---------------------------------------------------------------------
# STATIC / MEDIA / WHITENOISE
# ---------------------------------------------------------------------
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Storage WhiteNoise (compression + cache busting)
STORAGES = {
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
    }
}

# ---------------------------------------------------------------------
# SÉCURITÉ & PROXY (Render est derrière un proxy HTTPS)
# ---------------------------------------------------------------------
SECURE_SSL_REDIRECT = not DEBUG
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"
# Honor X-Forwarded-Proto envoyé par Render
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# ---------------------------------------------------------------------
# INTERNATIONALISATION
# ---------------------------------------------------------------------
LANGUAGE_CODE = "fr"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------
# EMAIL (SMTP Gmail)
# ---------------------------------------------------------------------
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
DEFAULT_FROM_EMAIL = env.str("EMAIL_HOST_USER", default="")
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env.str("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = env.str("EMAIL_HOST_PASSWORD", default="")

# ---------------------------------------------------------------------
# LOGGING
# ---------------------------------------------------------------------
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}

# ---------------------------------------------------------------------
# REDIS / CELERY
# ---------------------------------------------------------------------
REDIS_URL = env.str("REDIS_URL", default="redis://localhost:6379/0")
CELERY_BROKER_URL = env.str("CELERY_BROKER_URL", default=REDIS_URL)

CELERY_BEAT_SCHEDULE = {
    "signature-reminders-every-10min": {
        "task": "signature.tasks.process_signature_reminders",
        "schedule": 600.0,  # 10 minutes
    },
    "signature-deadlines-every-5min": {
        "task": "signature.tasks.process_deadlines",
        "schedule": 300.0,  # 5 minutes
    },
}

# ---------------------------------------------------------------------
# APP CONFIGS (tes réglages existants)
# ---------------------------------------------------------------------
# Dossiers & certificats
PDF_SIGNER_DIR = BASE_DIR / "certs"
SELF_SIGN_CERT_FILE = PDF_SIGNER_DIR / "selfsign_cert.pem"
SELF_SIGN_KEY_FILE = PDF_SIGNER_DIR / "selfsign_key.pem"
SELF_SIGN_CA_CHAIN = [PDF_SIGNER_DIR / "selfsign_cert.pem"]

# TSA
FREETSA_URL = "https://freetsa.org/tsr"
FREETSA_TSA = BASE_DIR / "certs" / "tsa.crt"
FREETSA_CACERT = BASE_DIR / "certs" / "cacert.pem"

# KMS / clés
KMS_ACTIVE_KEY_ID = env.int("KMS_ACTIVE_KEY_ID", default=1)
KMS_RSA_PUBLIC_KEYS = json.loads(
    env.str(
        "KMS_RSA_PUBLIC_KEYS",
        default='{"1": "%s"}' % str(BASE_DIR / "certs" / "kms_pub_1.pem"),
    )
)
KMS_RSA_PRIVATE_KEYS = json.loads(env.str("KMS_RSA_PRIVATE_KEYS", default="{}"))

# Storage chiffré custom
DEFAULT_FILE_STORAGE = "signature.storages.EncryptedFileSystemStorage"

# OTP / limites
MAX_REMINDERS_SIGN = 5
MAX_PDF_SIZE = env.int("MAX_PDF_SIZE", default=10 * 1024 * 1024)  # 10MB
OTP_TTL_SECONDS = env.int("OTP_TTL_SECONDS", default=300)
MAX_OTP_ATTEMPTS = env.int("MAX_OTP_ATTEMPTS", default=3)

# Iframe policy personnalisée (utilisé par ton middleware)
SIGNATURE_FRAME_ANCESTORS = env.str("SIGNATURE_FRAME_ANCESTORS", default="'self'")
SIGNATURE_X_FRAME_OPTIONS = env.str("SIGNATURE_X_FRAME_OPTIONS", default="SAMEORIGIN")

# ---------------------------------------------------------------------
# DIVERS
# ---------------------------------------------------------------------
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
