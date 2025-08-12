# signature/tasks.py (version complète)

from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings
from django.utils import timezone
from datetime import datetime, timedelta
import jwt
import logging

from .models import Envelope, EnvelopeRecipient

logger = logging.getLogger(__name__)

MAX_REMINDERS = getattr(settings, 'MAX_REMINDERS_SIGN', 3)


def _build_sign_link(envelope, recipient):
    """Construit le lien de signature (in-app si user, sinon lien invité avec JWT)."""
    expire_at = datetime.utcnow() + timedelta(hours=24)
    if recipient.user:
        return f"{settings.FRONT_BASE_URL}/signature/envelopes/{envelope.id}/sign"

    payload = {
        'env_id': envelope.id,
        'recipient_id': recipient.id,
        'iat': int(datetime.utcnow().timestamp()),
        'exp': int(expire_at.timestamp())
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm='HS256')
    return f"{settings.FRONT_BASE_URL}/sign/{envelope.id}?token={token}"


def _send_email(subject, message, to):
    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[to],
        fail_silently=False,
    )


@shared_task
def send_signature_email(envelope_id, recipient_id):
    """Notification initiale (appelée à l’envoi ou à l’ouverture du suivant en séquentiel)."""
    try:
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except (Envelope.DoesNotExist, EnvelopeRecipient.DoesNotExist):
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        return  # déjà expiré

    link = _build_sign_link(envelope, recipient)
    subject = f"Signature requise : {envelope.title}"
    message = f"Bonjour {recipient.full_name},\n\nVeuillez signer « {envelope.title} » :\n{link}\n\nMerci."

    _send_email(subject, message, recipient.email)

    # trace
    recipient.reminder_count += 1
    recipient.notified_at = timezone.now()
    recipient.last_reminder_at = timezone.now()
    # planifier prochain rappel
    recipient.next_reminder_at = timezone.now() + timedelta(days=envelope.reminder_days)
    recipient.save()


@shared_task
def send_reminder_email(envelope_id, recipient_id):
    """Rappel (passe par process_signature_reminders)."""
    try:
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except (Envelope.DoesNotExist, EnvelopeRecipient.DoesNotExist):
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        return

    if recipient.reminder_count >= MAX_REMINDERS:
        return

    link = _build_sign_link(envelope, recipient)
    subject = f"Rappel de signature : {envelope.title}"
    message = f"Bonjour {recipient.full_name},\n\nUn rappel pour signer « {envelope.title} » :\n{link}\n\nMerci."

    _send_email(subject, message, recipient.email)

    recipient.reminder_count += 1
    recipient.last_reminder_at = timezone.now()
    recipient.next_reminder_at = timezone.now() + timedelta(days=envelope.reminder_days)
    recipient.save()


@shared_task
def process_signature_reminders():
    """Job périodique : envoie les rappels dus (next_reminder_at <= now)."""
    now = timezone.now()

    # Enveloppes encore actives
    envelopes = Envelope.objects.filter(
        status__in=['sent', 'pending'],
        deadline_at__gt=now
    )

    for env in envelopes:
        if env.flow_type == 'sequential':
            # ne relancer que le "courant"
            rec = env.recipients.filter(signed=False).order_by('order').first()
            if not rec:
                continue
            if rec.next_reminder_at and rec.next_reminder_at <= now and rec.reminder_count < MAX_REMINDERS:
                send_reminder_email.delay(env.id, rec.id)
        else:
            # parallèle : tous les non signés
            for rec in env.recipients.filter(signed=False):
                if rec.next_reminder_at and rec.next_reminder_at <= now and rec.reminder_count < MAX_REMINDERS:
                    send_reminder_email.delay(env.id, rec.id)


@shared_task
def send_deadline_email(envelope_id):
    """Avertit le créateur et les non-signés que l’échéance est dépassée."""
    try:
        env = Envelope.objects.get(pk=envelope_id)
    except Envelope.DoesNotExist:
        return

    subject = f"Échéance dépassée : {env.title}"
    msg_owner = f"Bonjour,\n\nL’échéance du document « {env.title} » est dépassée. Statut: {env.status}."
    _send_email(subject, msg_owner, env.created_by.email)

    for rec in env.recipients.filter(signed=False):
        msg_rec = f"Bonjour {rec.full_name},\n\nL’échéance pour signer « {env.title} » est dépassée."
        _send_email(subject, msg_rec, rec.email)


@shared_task
def process_deadlines():
    """Job périodique : marque 'expired' les enveloppes non complétées dont la deadline est passée."""
    now = timezone.now()
    to_expire = Envelope.objects.filter(
        status__in=['sent', 'pending'],
        deadline_at__lte=now
    )

    for env in to_expire:
        env.status = 'expired'
        env.save(update_fields=['status'])
        send_deadline_email.delay(env.id)
        env.recipients.filter(signed=False).update(next_reminder_at=None)
