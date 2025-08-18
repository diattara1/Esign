# signature/otp.py (mis à jour)
import pyotp
from django.core.cache import cache
from django.conf import settings
from .email_utils import EmailTemplates

OTP_TTL = 100  # secondes
MAX_OTP_ATTEMPTS = 3


def _cache_key(recipient):
    return f"otp_recipient_{recipient.id}"


def _attempt_key(recipient):
    return f"otp_attempts_{recipient.id}"

def generate_otp(recipient):
    """
    Génère un secret TOTP et retourne le code à 6 chiffres.
    Stocke le secret en cache pour la vérification ultérieure.
    """
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret, digits=6, interval=OTP_TTL)
    token = totp.now()
    cache.set(_cache_key(recipient), secret, timeout=OTP_TTL)
    return token

def validate_otp(recipient, token):
    """
    Vérifie que le token correspond au TOTP stocké en cache et
    limite le nombre de tentatives pour éviter le bruteforce.
    Retourne un tuple (is_valid, blocked) :
      - is_valid : True si le token est correct
      - blocked  : True si le destinataire a dépassé le nombre de tentatives
    """
    secret = cache.get(_cache_key(recipient))
    attempts_key = _attempt_key(recipient)
    attempts = cache.get(attempts_key, 0)

    if attempts >= MAX_OTP_ATTEMPTS:
        return False, True
    if not secret:
        return False, False

    totp = pyotp.TOTP(secret, digits=6, interval=OTP_TTL)
    is_valid = totp.verify(token)

    if is_valid:
        cache.delete(_cache_key(recipient))
        cache.delete(attempts_key)
        return True, False

    cache.set(attempts_key, attempts + 1, timeout=OTP_TTL)
    return False, False

def send_otp(recipient, otp):
    """
    Envoie l'OTP par email en utilisant le template uniforme.
    """
    try:
        EmailTemplates.otp_email(recipient, otp, OTP_TTL//60)
    except Exception as e:
        # Log l'erreur mais ne pas faire échouer la fonction
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Erreur envoi OTP pour recipient {recipient.id}: {e}")
        raise  # Re-lever l'exception pour signaler l'échec