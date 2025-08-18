# signature/email_utils.py
import os
from typing import List, Tuple, Optional

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils.html import strip_tags
from django.utils import timezone

User = get_user_model()

# Type alias: [(filename, content_bytes, mimetype), ...]
AttachmentList = List[Tuple[str, bytes, str]]


def send_templated_email(
    *,
    recipient_email: str,
    subject: str,
    message_content: str,
    user_name: str | None = None,
    email_type: str | None = None,
    action_url: str | None = None,
    action_text: str | None = None,
    otp_code: str | None = None,
    otp_expiry: int | None = None,
    info_message: str | None = None,
    info_type: str | None = None,
    app_name: str | None = None,
    base_url: str | None = None,
    from_email: str | None = None,
    attachments: list[tuple[str, bytes, str]] | None = None,  # 👈 support PJ
):
    """
    Envoie un email avec le template uniforme (+ PJ si fournies).
    attachments: liste de tuples (filename, content_bytes, mimetype)
    """
    app_name = app_name or getattr(settings, 'APP_NAME', 'Signature Platform')
    base_url = base_url or getattr(settings, 'FRONT_BASE_URL', 'http://localhost:3000')
    from_email = from_email or getattr(settings, 'DEFAULT_FROM_EMAIL', None)

    context = {
        'subject': subject,
        'user_name': user_name,
        'email_type': email_type,
        'message_content': message_content,
        'action_url': action_url,
        'action_text': action_text,
        'otp_code': otp_code,
        'otp_expiry': otp_expiry,
        'info_message': info_message,
        'info_type': info_type,
        'app_name': app_name,
        'base_url': base_url,
    }

    # ⚠️ adapte si ton template a un autre chemin/nom
    html_content = render_to_string('emails/base_template.html', context)
    text_content = strip_tags(html_content) or strip_tags(message_content)

    email = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=from_email,
        to=[recipient_email],
    )
    email.attach_alternative(html_content, "text/html")

    if attachments:
        for filename, content, mimetype in attachments:
            email.attach(filename or "attachment", content, mimetype or "application/octet-stream")

    email.send()


class EmailTemplates:
    """Helpers pour générer différents types d'emails."""

    @staticmethod
    def activation_email(user: User, activation_link: str) -> None:
        send_templated_email(
            recipient_email=user.email,
            subject="Activation de votre compte",
            message_content=(
                "Merci de vous être inscrit ! Pour activer votre compte et commencer à utiliser notre plateforme "
                "de signature électronique, veuillez cliquer sur le bouton ci-dessous."
            ),
            user_name=f"{user.first_name} {user.last_name}".strip() or getattr(user, "username", user.email),
            email_type="Activation de compte",
            action_url=activation_link,
            action_text="Activer mon compte",
            info_message="Ce lien d'activation expire dans 24 heures. Si le lien ne fonctionne pas, demandez un nouveau lien.",
            info_type="warning",
        )

    @staticmethod
    def password_reset_email(user: User, reset_link: str) -> None:
        send_templated_email(
            recipient_email=user.email,
            subject="Réinitialisation de votre mot de passe",
            message_content=(
                "Vous avez demandé une réinitialisation de votre mot de passe. "
                "Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe."
            ),
            user_name=f"{user.first_name} {user.last_name}".strip() or getattr(user, "username", user.email),
            email_type="Réinitialisation de mot de passe",
            action_url=reset_link,
            action_text="Réinitialiser mon mot de passe",
            info_message=(
                "Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email. "
                "Votre mot de passe actuel reste inchangé."
            ),
            info_type="info",
        )

    @staticmethod
    def signature_request_email(recipient, envelope, sign_link: str) -> None:
        send_templated_email(
            recipient_email=recipient.email,
            subject=f"Signature requise : {envelope.title}",
            message_content=(
                f"Vous avez reçu un document à signer de la part de "
                f"{envelope.created_by.get_full_name() or envelope.created_by.username}. "
                f"Le document « {envelope.title} » nécessite votre signature électronique."
            ),
            user_name=recipient.full_name or recipient.email,
            email_type="Demande de signature",
            action_url=sign_link,
            action_text="Signer le document",
            info_message=(
                f"Date limite de signature : {envelope.deadline_at.strftime('%d/%m/%Y à %H:%M')}"
                if envelope.deadline_at else "Aucune date limite spécifiée pour ce document."
            ),
            info_type="info",
        )

    @staticmethod
    def signature_reminder_email(recipient, envelope, sign_link: str) -> None:
        send_templated_email(
            recipient_email=recipient.email,
            subject=f"Rappel - Signature requise : {envelope.title}",
            message_content=(
                f"Ceci est un rappel concernant le document « {envelope.title} » qui nécessite votre signature. "
                f"N'oubliez pas de le signer pour finaliser la procédure."
            ),
            user_name=recipient.full_name or recipient.email,
            email_type="Rappel de signature",
            action_url=sign_link,
            action_text="Signer maintenant",
            info_message=(
                "Ce document est en attente de votre signature. Merci de le traiter dès que possible."
                + (f" Date limite : {envelope.deadline_at.strftime('%d/%m/%Y')}" if envelope.deadline_at else "")
            ),
            info_type="warning",
        )

    @staticmethod
    def otp_email(recipient, otp_code: str, expiry_minutes: int = 5) -> None:
        send_templated_email(
            recipient_email=recipient.email,
            subject="Votre code de vérification",
            message_content=(
                "Pour des raisons de sécurité, veuillez saisir le code de vérification ci-dessous "
                "pour finaliser votre signature."
            ),
            user_name=recipient.full_name or recipient.email,
            email_type="Code de vérification",
            otp_code=otp_code,
            otp_expiry=expiry_minutes,
            info_message=(
                "Pour votre sécurité, ne partagez jamais ce code avec qui que ce soit. "
                "Notre équipe ne vous le demandera jamais par téléphone ou email."
            ),
            info_type="warning",
        )

    @staticmethod
    def document_completed_email(user: User, envelope) -> None:
        send_templated_email(
            recipient_email=user.email,
            subject=f"Document signé : {envelope.title}",
            message_content=(
                f"Le document « {envelope.title} » a été signé  "
                f"et est maintenant finalisé."
            ),
            user_name=f"{user.first_name} {user.last_name}".strip() or getattr(user, "username", user.email),
            email_type="Document finalisé",
            action_url=f"{settings.FRONT_BASE_URL}/signature/detail/{envelope.id}",
            action_text="Voir le document",
            info_message="Vous pouvez maintenant télécharger le document final signé depuis votre tableau de bord.",
            info_type="success",
        )

    @staticmethod
    def deadline_expired_email(user: User, envelope) -> None:
        send_templated_email(
            recipient_email=user.email,
            subject=f"Échéance dépassée : {envelope.title}",
            message_content=(
                f"Le document « {envelope.title} » a atteint sa date limite sans être entièrement signé. "
                f"Le processus de signature a été interrompu."
            ),
            user_name=f"{user.first_name} {user.last_name}".strip() or getattr(user, "username", user.email),
            email_type="Échéance dépassée",
            action_url=f"{settings.FRONT_BASE_URL}/signature/detail/{envelope.id}",
            action_text="Voir les détails",
            info_message=(
                "Vous pouvez relancer le processus de signature en créant une nouvelle demande "
                "ou en modifiant la date limite."
            ),
            info_type="warning",
        )


# --- Versions v2 conservées, avec correctifs mineurs ---

def send_signature_email_v2(envelope_id: int, recipient_id: int) -> None:
    """
    Version mise à jour avec template.
    NOTE: import de timezone placé en haut du fichier pour éviter l'usage avant import.
    """
    try:
        from .models import Envelope, EnvelopeRecipient
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except Exception:
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        # Ne pas notifier si l'échéance est dépassée
        return

    from .tasks import _build_sign_link
    link = _build_sign_link(envelope, recipient)
    EmailTemplates.signature_request_email(recipient, envelope, link)

    # Mise à jour du recipient
    from datetime import timedelta
    recipient.reminder_count += 1
    now = timezone.now()
    recipient.notified_at = now
    recipient.last_reminder_at = now
    recipient.next_reminder_at = now + timedelta(days=envelope.reminder_days or 0)
    recipient.save(update_fields=["reminder_count", "notified_at", "last_reminder_at", "next_reminder_at"])


def send_reminder_email_v2(envelope_id: int, recipient_id: int) -> None:
    """Version mise à jour avec template."""
    try:
        from .models import Envelope, EnvelopeRecipient
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except Exception:
        return

    from .tasks import _build_sign_link
    link = _build_sign_link(envelope, recipient)
    EmailTemplates.signature_reminder_email(recipient, envelope, link)

    # Mise à jour du recipient
    from datetime import timedelta
    now = timezone.now()
    recipient.reminder_count += 1
    recipient.last_reminder_at = now
    recipient.next_reminder_at = now + timedelta(days=envelope.reminder_days or 0)
    recipient.save(update_fields=["reminder_count", "last_reminder_at", "next_reminder_at"])
