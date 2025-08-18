# signature/email_utils.py
import os
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()

def send_templated_email(
    recipient_email,
    subject,
    message_content,
    user_name=None,
    email_type=None,
    action_url=None,
    action_text=None,
    otp_code=None,
    otp_expiry=None,
    info_message=None,
    info_type=None,
    app_name=None,
    base_url=None,
    from_email=None
):
    """
    Envoie un email avec le template uniforme.
    
    Args:
        recipient_email: Email du destinataire
        subject: Sujet de l'email
        message_content: Contenu principal du message
        user_name: Nom de l'utilisateur (optionnel)
        email_type: Type d'email (activation, reset, signature, etc.)
        action_url: URL du bouton d'action (optionnel)
        action_text: Texte du bouton d'action
        otp_code: Code OTP à afficher (optionnel)
        otp_expiry: Durée d'expiration de l'OTP en minutes
        info_message: Message d'information supplémentaire
        info_type: Type d'info (warning, success, info)
        app_name: Nom de l'application
        base_url: URL de base du site
        from_email: Email expéditeur (optionnel)
    """
    
    # Valeurs par défaut
    app_name = app_name or getattr(settings, 'APP_NAME', 'Signature Platform')
    base_url = base_url or getattr(settings, 'FRONT_BASE_URL', 'http://localhost:3000')
    from_email = from_email or settings.DEFAULT_FROM_EMAIL
    
    # Contexte pour le template
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
    
    # Template HTML
    html_content = render_to_string('emails/base_template.html', context)
    
    # Version texte simplifiée
    text_content = f"""
{subject}

Bonjour {user_name or 'cher utilisateur'},

{message_content}

{f'Code de vérification: {otp_code}' if otp_code else ''}
{f'Lien: {action_url}' if action_url else ''}
{f'Information: {info_message}' if info_message else ''}

---
{app_name}
{base_url}
"""
    
    # Créer et envoyer l'email
    email = EmailMultiAlternatives(
        subject=subject,
        body=text_content.strip(),
        from_email=from_email,
        to=[recipient_email]
    )
    email.attach_alternative(html_content, "text/html")
    email.send()


class EmailTemplates:
    """Classe helper pour générer facilement différents types d'emails"""
    
    @staticmethod
    def activation_email(user, activation_link):
        """Email d'activation de compte"""
        send_templated_email(
            recipient_email=user.email,
            subject="Activation de votre compte",
            message_content=f"Merci de vous être inscrit ! Pour activer votre compte et commencer à utiliser notre plateforme de signature électronique, veuillez cliquer sur le bouton ci-dessous.",
            user_name=f"{user.first_name} {user.last_name}".strip() or user.username,
            email_type="Activation de compte",
            action_url=activation_link,
            action_text="Activer mon compte",
            info_message="Ce lien d'activation expire dans 24 heures. Si le lien ne fonctionne pas, vous pouvez demander un nouveau lien d'activation.",
            info_type="warning"
        )
    
    @staticmethod
    def password_reset_email(user, reset_link):
        """Email de réinitialisation de mot de passe"""
        send_templated_email(
            recipient_email=user.email,
            subject="Réinitialisation de votre mot de passe",
            message_content="Vous avez demandé une réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe.",
            user_name=f"{user.first_name} {user.last_name}".strip() or user.username,
            email_type="Réinitialisation de mot de passe",
            action_url=reset_link,
            action_text="Réinitialiser mon mot de passe",
            info_message="Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email. Votre mot de passe actuel reste inchangé.",
            info_type="info"
        )
    
    @staticmethod
    def signature_request_email(recipient, envelope, sign_link):
        """Email de demande de signature"""
        send_templated_email(
            recipient_email=recipient.email,
            subject=f"Signature requise : {envelope.title}",
            message_content=f"Vous avez reçu un document à signer de la part de {envelope.created_by.get_full_name() or envelope.created_by.username}. Le document '{envelope.title}' nécessite votre signature électronique.",
            user_name=recipient.full_name,
            email_type="Demande de signature",
            action_url=sign_link,
            action_text="Signer le document",
            info_message=f"Date limite de signature : {envelope.deadline_at.strftime('%d/%m/%Y à %H:%M') if envelope.deadline_at else 'Aucune'}" if envelope.deadline_at else "Aucune date limite spécifiée pour ce document.",
            info_type="info"
        )
    
    @staticmethod
    def signature_reminder_email(recipient, envelope, sign_link):
        """Email de rappel de signature"""
        send_templated_email(
            recipient_email=recipient.email,
            subject=f"Rappel - Signature requise : {envelope.title}",
            message_content=f"Ceci est un rappel concernant le document '{envelope.title}' qui nécessite votre signature. N'oubliez pas de le signer pour finaliser la procédure.",
            user_name=recipient.full_name,
            email_type="Rappel de signature",
            action_url=sign_link,
            action_text="Signer maintenant",
            info_message="Ce document est en attente de votre signature. Merci de le traiter dès que possible." + (f" Date limite : {envelope.deadline_at.strftime('%d/%m/%Y')}" if envelope.deadline_at else ""),
            info_type="warning"
        )
    
    @staticmethod
    def otp_email(recipient, otp_code, expiry_minutes=5):
        """Email avec code OTP"""
        send_templated_email(
            recipient_email=recipient.email,
            subject="Votre code de vérification",
            message_content="Pour des raisons de sécurité, veuillez saisir le code de vérification ci-dessous pour finaliser votre signature.",
            user_name=recipient.full_name,
            email_type="Code de vérification",
            otp_code=otp_code,
            otp_expiry=expiry_minutes,
            info_message="Pour votre sécurité, ne partagez jamais ce code avec qui que ce soit. Notre équipe ne vous demandera jamais ce code par téléphone ou email.",
            info_type="warning"
        )
    
    @staticmethod
    def document_completed_email(user, envelope):
        """Email de notification de document complété"""
        send_templated_email(
            recipient_email=user.email,
            subject=f"Document signé : {envelope.title}",
            message_content=f"Bonne nouvelle ! Le document '{envelope.title}' a été signé par tous les destinataires et est maintenant finalisé.",
            user_name=f"{user.first_name} {user.last_name}".strip() or user.username,
            email_type="Document finalisé",
            action_url=f"{settings.FRONT_BASE_URL}/signature/envelopes/{envelope.id}",
            action_text="Voir le document",
            info_message="Vous pouvez maintenant télécharger le document final signé depuis votre tableau de bord.",
            info_type="success"
        )
    
    @staticmethod
    def deadline_expired_email(user, envelope):
        """Email de notification d'échéance dépassée"""
        send_templated_email(
            recipient_email=user.email,
            subject=f"Échéance dépassée : {envelope.title}",
            message_content=f"Le document '{envelope.title}' a atteint sa date limite sans être entièrement signé. Le processus de signature a été interrompu.",
            user_name=f"{user.first_name} {user.last_name}".strip() or user.username,
            email_type="Échéance dépassée",
            action_url=f"{settings.FRONT_BASE_URL}/signature/envelopes/{envelope.id}",
            action_text="Voir les détails",
            info_message="Vous pouvez relancer le processus de signature en créant une nouvelle demande ou en modifiant la date limite.",
            info_type="warning"
        )


# Mise à jour de vos tasks existantes pour utiliser les nouveaux templates
def send_signature_email_v2(envelope_id, recipient_id):
    """Version mise à jour avec template"""
    try:
        from .models import Envelope, EnvelopeRecipient
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except:
        return

    if envelope.deadline_at and envelope.deadline_at <= timezone.now():
        return

    # Utiliser le template
    from .tasks import _build_sign_link
    link = _build_sign_link(envelope, recipient)
    EmailTemplates.signature_request_email(recipient, envelope, link)

    # Mise à jour du recipient
    from django.utils import timezone
    from datetime import timedelta
    recipient.reminder_count += 1
    recipient.notified_at = timezone.now()
    recipient.last_reminder_at = timezone.now()
    recipient.next_reminder_at = timezone.now() + timedelta(days=envelope.reminder_days)
    recipient.save()


def send_reminder_email_v2(envelope_id, recipient_id):
    """Version mise à jour avec template"""
    try:
        from .models import Envelope, EnvelopeRecipient
        envelope = Envelope.objects.get(pk=envelope_id)
        recipient = EnvelopeRecipient.objects.get(pk=recipient_id, envelope=envelope, signed=False)
    except:
        return

    from .tasks import _build_sign_link
    link = _build_sign_link(envelope, recipient)
    EmailTemplates.signature_reminder_email(recipient, envelope, link)

    # Mise à jour du recipient
    from django.utils import timezone
    from datetime import timedelta
    recipient.reminder_count += 1
    recipient.last_reminder_at = timezone.now()
    recipient.next_reminder_at = timezone.now() + timedelta(days=envelope.reminder_days)
    recipient.save()