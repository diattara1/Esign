# backend/signature/tasks.py
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from .models import Envelope, EnvelopeRecipient
import jwt
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

@shared_task
def send_signature_email(envelope_id, recipient_id=None):
    """
    Envoie l'email de signature :
      - si recipient_id fourni, on cible uniquement ce destinataire
      - sinon, si séquentiel, on prend le premier non-signé
      - sinon (parallèle), on notifie tous les non-signés
    Puis re-planifie un rappel si nécessaire.
    """
    try:
        envelope = Envelope.objects.get(pk=envelope_id)
    except Envelope.DoesNotExist:
        logger.error(f"Enveloppe {envelope_id} non trouvée")
        return

    # Arrêter si expiré
    if envelope.deadline_at and envelope.deadline_at < timezone.now():
        logger.info(f"Enveloppe {envelope_id} expirée, pas d'envoi")
        return

    max_reminders = getattr(settings, 'MAX_REMINDERS_SIGN', 3)

    def notify_one(rec):
        if rec.reminder_count < max_reminders:
            send_email_to_recipient(envelope, rec)

    # 1) Si on a un recipient_id, on n'envoie qu'à lui
    if recipient_id:
        try:
            rec = EnvelopeRecipient.objects.get(
                pk=recipient_id,
                envelope=envelope,
                signed=False
            )
            notify_one(rec)
        except EnvelopeRecipient.DoesNotExist:
            logger.warning(f"Recipient {recipient_id} non trouvé ou déjà signé")
    else:
        # 2) Pas de recipient_id : mode fallback
        if envelope.flow_type == 'sequential':
            rec = envelope.recipients.filter(signed=False).order_by('order').first()
            if rec:
                notify_one(rec)
        else:
            # parallèle : tous les non-signés
            for rec in envelope.recipients.filter(signed=False):
                notify_one(rec)

    # 3) Re-planification du rappel si hors deadline
    if envelope.deadline_at and envelope.deadline_at > timezone.now():
        eta = timezone.now() + timedelta(days=envelope.reminder_days)
        params = (envelope_id, recipient_id) if recipient_id else (envelope_id,)
        logger.info(f"Planification rappel enveloppe {envelope_id}, recipient={recipient_id} à {eta}")
        send_signature_email.apply_async(params, eta=eta)


def send_email_to_recipient(envelope, recipient):
    """
    Construction et envoi de l'email, incrémentation de reminder_count.
    """
    expire_at = datetime.utcnow() + timedelta(hours=24)
    payload = {
        'env_id':       envelope.id,
        'recipient_id': recipient.id,
        'iat':          int(datetime.utcnow().timestamp()),
        'exp':          int(expire_at.timestamp())
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')

    subject = f"Signature requise : {envelope.title}"
    if recipient.user:
        # lien vers la page in-app de signature
        sign_url = f"{settings.FRONT_BASE_URL}/signature/envelopes/{envelope.id}/sign"
    else:
        # lien “guest” avec token JWT en query param
        sign_url = f"{settings.FRONT_BASE_URL}/sign/{envelope.id}?token={token}"

    message = f"""
Bonjour {recipient.full_name},

Merci de signer le document « {envelope.title} ».
Cliquez ici pour accéder au document :
{sign_url}

Ce lien expire le {expire_at.strftime('%Y-%m-%d %H:%M:%S')} UTC.
"""
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recipient.email],
        fail_silently=False,
    )

    recipient.reminder_count += 1
    recipient.notified_at = timezone.now()
    recipient.save()
    logger.info(f"E-mail envoyé à {recipient.email} (enveloppe {envelope.id})")
