# signature/otp.py
import pyotp
from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings

OTP_TTL = 300  # secondes
MAX_OTP_ATTEMPTS = 5


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
    Envoie l’OTP par email (ou SMS si vous voulez étendre).
    """
    subject = "Votre code OTP de signature"
    message = f"Bonjour {recipient.full_name},\n\nVotre code de signature est : {otp}\nIl est valable {OTP_TTL//60} minutes."
    from_email = settings.DEFAULT_FROM_EMAIL
    recipient_list = [recipient.email]
    send_mail(subject, message, from_email, recipient_list)
