from pathlib import Path
import os, json
import environ
from urllib.parse import urlparse
from datetime import timedelta

# Base
BASE_DIR = Path(__file__).resolve().parent.parent
env = environ.Env()
environ.Env.read_env(os.path.join(BASE_DIR, ".env"))

# Frontend origin (pour CORS/CSRF en prod)
FRONT_BASE_URL = os.getenv("FRONT_BASE_URL", "http://localhost:3000")
_front_origin = None
if FRONT_BASE_URL:
    p = urlparse(FRONT_BASE_URL)
    _front_origin = f"{p.scheme}://{p.netloc}"

# Sécurité / mode
SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = env.bool("DJANGO_DEBUG", default=True)

# Hosts

ALLOWED_HOSTS = [
    "localhost",
    "127.0.0.1",
    "esign-5mbk.onrender.com", 
]



BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

# Apps
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "signature",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
]

AUTH_USER_MODEL = "signature.CustomUser"

# Middlewares
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "signature.middleware.AllowIframeForPDFOnlyMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "signature.middleware.ClearAuthCookiesMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
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

# DRF & Auth
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "signature.authentication.CookieJWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "40/minute",
        "user": "40/minute",
        "verify-token": "25/minute",
        "login": "7/minute",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=1),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
}

# DB
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

# CORS commun
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]

if _front_origin:
    CORS_ALLOWED_ORIGINS.append(_front_origin)

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

# ---- Cookies / CSRF par environnement ----

if DEBUG:
    # DEV : généralement en HTTP → pas de Secure, SameSite=Lax
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    SESSION_COOKIE_SAMESITE = "Lax"
    CSRF_COOKIE_SAMESITE = "Lax"

    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:5173",
    ]
else:
    # PROD : cross-site (front/back sur domaines distincts) en HTTPS
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SESSION_COOKIE_SAMESITE = "None"
    CSRF_COOKIE_SAMESITE = "None"

    CSRF_TRUSTED_ORIGINS = [
        "https://*.onrender.com",
    ]
    if _front_origin:
        CSRF_TRUSTED_ORIGINS.append(_front_origin)

# Static & media
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STORAGES = {
    "default": {"BACKEND": "signature.storages.EncryptedFileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Internationalisation
LANGUAGE_CODE = "fr"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Mail
APP_NAME = "IntelliSign"
EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
DEFAULT_FROM_EMAIL = env("EMAIL_HOST_USER")
EMAIL_HOST = "smtp.gmail.com"
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = env("EMAIL_HOST_USER")
EMAIL_HOST_PASSWORD = env("EMAIL_HOST_PASSWORD")

# Certificats / signature
PDF_SIGNER_DIR = BASE_DIR / "certs"
SELF_SIGN_CERT_FILE = PDF_SIGNER_DIR / "selfsign_cert.pem"
SELF_SIGN_KEY_FILE = PDF_SIGNER_DIR / "selfsign_key.pem"
SELF_SIGN_CA_CHAIN = [PDF_SIGNER_DIR / "selfsign_cert.pem"]

# FreeTSA
FREETSA_URL = "https://freetsa.org/tsr"
FREETSA_TSA = BASE_DIR / "certs" / "tsa.crt"
FREETSA_CACERT = BASE_DIR / "certs" / "cacert.pem"

# KMS
KMS_ACTIVE_KEY_ID = env.int("KMS_ACTIVE_KEY_ID", default=1)
KMS_RSA_PUBLIC_KEYS = json.loads(
    env.str("KMS_RSA_PUBLIC_KEYS", default='{"1": "%s"}' % str(BASE_DIR / "certs" / "kms_pub_1.pem"))
)
KMS_RSA_PRIVATE_KEYS = json.loads(env.str("KMS_RSA_PRIVATE_KEYS", default="{}"))

# OTP / limites
CELERY_BROKER_URL = env.str("CELERY_BROKER_URL", default="")
MAX_REMINDERS_SIGN = 5
MAX_PDF_SIZE = env.int("MAX_PDF_SIZE", default=10 * 1024 * 1024)
OTP_TTL_SECONDS = env.int("OTP_TTL_SECONDS", default=300)
MAX_OTP_ATTEMPTS = env.int("MAX_OTP_ATTEMPTS", default=3)

SIGNATURE_FRAME_ANCESTORS = env.str("SIGNATURE_FRAME_ANCESTORS", "'self'")
SIGNATURE_X_FRAME_OPTIONS = env.str("SIGNATURE_X_FRAME_OPTIONS", "SAMEORIGIN")

CELERY_BEAT_SCHEDULE = {
    "signature-reminders-every-10min": {
        "task": "signature.tasks.process_signature_reminders",
        "schedule": 600.0,
    },
    "signature-deadlines-every-5min": {
        "task": "signature.tasks.process_deadlines",
        "schedule": 300.0,
    },
}

# Logs
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
