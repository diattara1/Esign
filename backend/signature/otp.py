# signature/otp.py
import pyotp
from django.core.cache import cache
from django.core.mail import send_mail
from django.conf import settings

OTP_TTL = 300  # secondes

def _cache_key(recipient):
    return f"otp_recipient_{recipient.id}"

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
    Vérifie que le token correspond au TOTP stocké en cache.
    """
    secret = cache.get(_cache_key(recipient))
    if not secret:
        return False
    totp = pyotp.TOTP(secret, digits=6, interval=OTP_TTL)
    return totp.verify(token)

def send_otp(recipient, otp):
    """
    Envoie l’OTP par email (ou SMS si vous voulez étendre).
    """
    subject = "Votre code OTP de signature"
    message = f"Bonjour {recipient.full_name},\n\nVotre code de signature est : {otp}\nIl est valable {OTP_TTL//60} minutes."
    from_email = settings.DEFAULT_FROM_EMAIL
    recipient_list = [recipient.email]
    send_mail(subject, message, from_email, recipient_list)
