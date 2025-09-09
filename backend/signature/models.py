from __future__ import annotations

from django.db import models
from django.conf import settings
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.contrib.auth.models import AbstractUser
import uuid
import hashlib
import hmac
import logging

from .storages import EncryptedFileSystemStorage, AADContentFile
from .utils import validate_pdf,stream_hash

logger = logging.getLogger(__name__)

encrypted_storage = EncryptedFileSystemStorage()


class CustomUser(AbstractUser):
    """
    Utilisateur personnalisé – hérite d’AbstractUser
    et ajoute quelques champs de profil.
    """
    birth_date   = models.DateField(null=True, blank=True)
    phone_number = models.CharField(max_length=20, blank=True, null=True)
    gender       = models.CharField(max_length=10,choices=[("Homme", "Homme"), ("Femme", "Femme")],blank=True,null=True,)
    address      = models.TextField(blank=True, null=True)
    avatar       = models.ImageField(upload_to="avatars/", null=True, blank=True)

    # on exige l’email en plus du username
    REQUIRED_FIELDS = ["email"]

    def __str__(self):
        return self.get_full_name() or self.username


def _sha256(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


# =========================
# EnvelopeDocument
# =========================
class EnvelopeDocument(models.Model):
    envelope = models.ForeignKey(
        "Envelope", on_delete=models.CASCADE, related_name="documents"
    )
    # Identité immuable du document (utilisée comme AAD)
    doc_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    file = models.FileField(upload_to="signature/documents/", storage=encrypted_storage)
    name = models.CharField(max_length=255, blank=True)
    file_type = models.CharField(max_length=50, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    hash_original = models.CharField(max_length=64, blank=True)  # SHA-256 hex
    version = models.PositiveIntegerField(default=1)

    def __str__(self):
        return self.name or f"Document {self.pk}"

    # ---------- util ----------
    def _file_changed(self) -> bool:
        if not self.pk:
            return True
        try:
            orig = EnvelopeDocument.objects.get(pk=self.pk)
        except EnvelopeDocument.DoesNotExist:
            return True
        return (orig.file.name or "") != (self.file.name or "")

    # ---------- validation ----------
    def clean(self):
        if not self.file:
            return
        validate_pdf(self.file)

    # ---------- sauvegarde ----------
    def save(self, *args, **kwargs):
        is_new = self._state.adding

        if self.file and (is_new or self._file_changed()):
            # --- Lire *tous les octets* de l'upload, pour éviter les flux fermés ensuite
            src = getattr(self.file, "file", None) or self.file
            # nom/extension AVANT de remplacer le field
            orig_name = getattr(self.file, "name", "") or "document.pdf"
            file_ext = orig_name.split(".")[-1].lower() if "." in orig_name else ""
            # lecture tolérante (chunks() si dispo)
            try:
                if hasattr(src, "open"):
                    try:
                        src.open("rb")
                    except Exception as exc:
                        logger.warning(
                            "Unable to open uploaded file in binary mode: %s", exc
                        )
                if hasattr(src, "seek"):
                    try:
                        src.seek(0)
                    except Exception as exc:
                        logger.warning(
                            "Unable to seek to start of uploaded file: %s", exc
                        )
                if hasattr(src, "chunks"):
                    data = b"".join(chunk for chunk in src.chunks())
                else:
                    data = src.read()
            finally:
                try:
                    # on ne *ferme* pas explicitement l'upload : Django gère
                    if hasattr(src, "seek"):
                        src.seek(0)
                except Exception as exc:
                    logger.warning(
                        "Unable to reset uploaded file position after read: %s", exc
                    )

            # --- Validations & métadonnées sur les *octets*
            self.name = orig_name
            self.file_type = file_ext
            self.file_size = len(data)
            if self.file_type == "pdf" and not data.startswith(b"%PDF-"):
                raise ValidationError("Le fichier n'est pas un PDF valide.")
            # hash clair
            try:
                import hashlib
                self.hash_original = hashlib.sha256(data).hexdigest()
            except Exception:
                # best-effort
                pass

            # --- Remplacement du FileField par un flux propre (AAD = doc_uuid)
            aad = uuid.UUID(str(self.doc_uuid)).bytes
            self.file = AADContentFile(data, aad=aad, name=orig_name)

            # Versioning : +1 si modification
            if not is_new:
                try:
                    orig = EnvelopeDocument.objects.get(pk=self.pk)
                    self.version = (orig.version or 0) + 1
                except EnvelopeDocument.DoesNotExist:
                    pass

        super().save(*args, **kwargs)


# =========================
# Envelope
# =========================
class Envelope(models.Model):
    STATUS_CHOICES = [
        ("draft", "Brouillon"),
        ("sent", "Envoyé"),
        ("pending", "En cours"),
        ("completed", "Signé"),
        ("cancelled", "Annulé"),
        ("expired", "Expiré"),
    ]

    FLOW_CHOICES = [("sequential", "Séquentiel"), ("parallel", "Parallèle")]

    # Identité immuable de l'enveloppe (utilisée comme AAD pour document_file)
    doc_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    include_qr_code = models.BooleanField(default=False)
    document_file = models.FileField(
        upload_to="signature/documents/",
        storage=encrypted_storage,
        null=True,
        blank=True,
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="draft"
    )
    hash_original = models.CharField(max_length=64, blank=True)  # SHA-256 hex
    version = models.PositiveIntegerField(default=1)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    file_type = models.CharField(max_length=50, blank=True)

    flow_type = models.CharField(
        max_length=20, choices=FLOW_CHOICES, default="sequential"
    )
    reminder_days = models.PositiveIntegerField(default=1)
    deadline_at = models.DateTimeField(null=True, blank=True)
    jwt_token = models.CharField(max_length=512, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.get_status_display()})"

    # ---------- utils ----------
    def _file_changed(self) -> bool:
        if not self.pk:
            return True
        try:
            orig = Envelope.objects.get(pk=self.pk)
        except Envelope.DoesNotExist:
            return True
        return (orig.document_file.name or "") != (self.document_file.name or "")

    def compute_hash(self, data: bytes | str) -> str:
        # Gardé pour compatibilité si ailleurs tu hashes des bytes/str
        return _sha256(data)

    @property
    def is_completed(self) -> bool:
        return self.status == "completed"

    @property
    def completion_rate(self) -> float:
        total = getattr(self, "recipients", None) and self.recipients.count() or 0
        signed = (
            getattr(self, "recipients", None)
            and self.recipients.filter(signed=True).count()
            or 0
        )
        return (signed / total * 100) if total > 0 else 0.0

    # ---------- validation ----------
    def clean(self):
        if not self.document_file:
            return
        validate_pdf(self.document_file)

    # ---------- sauvegarde ----------
    def save(self, *args, **kwargs):
        is_new = self._state.adding
        old_status = None

        if not is_new:
            try:
                old_status = Envelope.objects.get(pk=self.pk).status
            except Envelope.DoesNotExist:
                pass

        if self.document_file and (is_new or self._file_changed()):
            # Lire octets de l'upload pour éviter flux fermé côté storage
            src = getattr(self.document_file, "file", None) or self.document_file
            orig_name = getattr(self.document_file, "name", "") or "document.pdf"
            file_ext = orig_name.split(".")[-1].lower() if "." in (orig_name or "") else ""
            try:
                if hasattr(src, "open"):
                    try:
                        src.open("rb")
                    except Exception:
                        pass
                if hasattr(src, "seek"):
                    try:
                        src.seek(0)
                    except Exception:
                        pass
                if hasattr(src, "chunks"):
                    data = b"".join(chunk for chunk in src.chunks())
                else:
                    data = src.read()
            finally:
                try:
                    if hasattr(src, "seek"):
                        src.seek(0)
                except Exception:
                    pass

            # Métadonnées + validation
            self.file_type = file_ext
            self.file_size = len(data)
            if self.file_type == "pdf" and not data.startswith(b"%PDF-"):
                raise ValidationError("Le fichier n'est pas un PDF valide.")
            try:
                import hashlib
                self.hash_original = hashlib.sha256(data).hexdigest()
            except Exception:
                pass

            # Remplacer par AADContentFile (AAD = doc_uuid)
            aad = uuid.UUID(str(self.doc_uuid)).bytes
            self.document_file = AADContentFile(data, aad=aad, name=orig_name)

            # Versioning
            if not is_new:
                try:
                    orig = Envelope.objects.get(pk=self.pk)
                    self.version = (orig.version or 0) + 1
                except Envelope.DoesNotExist:
                    pass

        super().save(*args, **kwargs)


class SavedSignature(models.Model):
    TYPE_CHOICES = [
        ("upload", "Uploaded image"),
        ("draw", "Drawn pad"),
        ("text", "Typed name"),
    ]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_signatures")
    kind = models.CharField(max_length=10, choices=TYPE_CHOICES, default="upload")
    image = models.ImageField(upload_to="signature/saved/", storage=encrypted_storage, null=True, blank=True)
    data_url = models.TextField(blank=True, default="")  # si tu veux stocker le base64
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user_id} - {self.kind} - {self.created_at:%Y-%m-%d}"


# --- TEMPLATE DE PLACEMENT (optionnel, pour réutiliser des zones) ----------
class FieldTemplate(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="field_templates")
    name = models.CharField(max_length=120)
    # un seul placement (même endroit) :
    page = models.PositiveIntegerField(default=1)
    x = models.FloatField()
    y = models.FloatField()
    width = models.FloatField()
    height = models.FloatField()
    # optionnel : ancre textuelle
    anchor = models.CharField(max_length=200, blank=True, default="")
    offset_x = models.FloatField(default=0)
    offset_y = models.FloatField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.owner_id})"


# --- BATCH SIGNING ----------------------------------------------------------
class BatchSignJob(models.Model):
    MODE_CHOICES = [
        ("self_single", "Self sign single"),
        ("bulk_same_spot", "Bulk same spot"),
        ("bulk_var_spots", "Bulk different spots"),
    ]
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("partial", "Partial"),
        ("failed", "Failed"),
    ]
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="batch_sign_jobs")
    mode = models.CharField(max_length=20, choices=MODE_CHOICES)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default="queued")
    total = models.PositiveIntegerField(default=0)
    done = models.PositiveIntegerField(default=0)
    failed = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    # ZIP final contenant les PDF signés
    result_zip = models.FileField(upload_to="signature/batch_zip/", storage=encrypted_storage, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Job {self.id} - {self.mode} - {self.status}"


class BatchSignItem(models.Model):
    STATUS_CHOICES = [
        ("queued", "Queued"),
        ("running", "Running"),
        ("completed", "Completed"),
        ("failed", "Failed"),
    ]
    job = models.ForeignKey(BatchSignJob, on_delete=models.CASCADE, related_name="items")
    # référence vers un document : soit EnvelopeDocument existant, soit un fichier uploadé
    envelope_document = models.ForeignKey("EnvelopeDocument", on_delete=models.SET_NULL, null=True, blank=True)
    source_file = models.FileField(upload_to="signature/batch_src/", storage=encrypted_storage, null=True, blank=True)

    # placements (pour var_spots) : [{page,x,y,width,height}, ...]
    placements = models.JSONField(default=list, blank=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default="queued")
    error = models.TextField(blank=True, default="")
    # pdf signé
    signed_file = models.FileField(upload_to="signature/batch_signed/", storage=encrypted_storage, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class EnvelopeRecipient(models.Model):
    
    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='recipients')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    email = models.EmailField()
    full_name = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=1)
    signed = models.BooleanField(default=False)
    signed_at = models.DateTimeField(null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)
    reminder_count = models.PositiveIntegerField(default=0)
    in_app_notified = models.BooleanField(default=False)
    last_reminder_at = models.DateTimeField(null=True, blank=True)
    next_reminder_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ['envelope', 'email']
        ordering = ['order']

    def __str__(self):
        return f"{self.full_name} - {self.envelope.title}"

class SigningField(models.Model):
    FIELD_TYPES = [
        ('signature', 'Signature'),
        ('date', 'Date'),
        ('checkbox', 'Cases'),
        ('text', 'Texte libre'),
        ('initial', 'Initiales')
    ]
    document = models.ForeignKey(
        EnvelopeDocument,
        on_delete=models.CASCADE,
        null=True, blank=True,
        related_name='fields'
    )
    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='fields')
    recipient = models.ForeignKey(EnvelopeRecipient, on_delete=models.CASCADE, related_name='fields')
    field_type = models.CharField(max_length=20, choices=FIELD_TYPES)
    page = models.PositiveIntegerField()
    position = models.JSONField()
    name = models.CharField(max_length=100)
    required = models.BooleanField(default=True)
    default_value = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.name} ({self.get_field_type_display()}) - Page {self.page}"

class SignatureDocument(models.Model):
    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='signatures')
    recipient = models.ForeignKey(EnvelopeRecipient, on_delete=models.CASCADE)
    signer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    is_guest = models.BooleanField(default=False)
    signature_data = models.TextField()
    signed_fields = models.JSONField(default=dict)
    signed_file = models.FileField(upload_to='signature/signed/', null=True, blank=True, storage=encrypted_storage)
    signed_at = models.DateTimeField(auto_now_add=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    certificate_data = models.JSONField(default=dict)

    def __str__(self):
        return f"Signature de {self.recipient.full_name} - {self.envelope.title}"

# signature/models.py
class PrintQRCode(models.Model):
    TYPE_CHOICES = [
        ('dynamic', 'Usage unique'),   # (optionnel : on peut aussi le traiter comme permanent)
        ('permanent', 'Permanent')
    ]

    uuid = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    envelope = models.ForeignKey(Envelope, on_delete=models.CASCADE, related_name='qr_codes')
    qr_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    hmac = models.CharField(max_length=64, editable=False)
    state = models.CharField(max_length=20, default='non_scanned')
    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        if not self.hmac:
            secret = settings.SECRET_KEY.encode()
            self.hmac = hmac.new(secret, str(self.uuid).encode(), hashlib.sha256).hexdigest()
        super().save(*args, **kwargs)

    @property
    def is_valid(self):
        # ⬇️ Plus de notion d’expiration : toujours valide sauf si révoqué
        return self.state != 'revoked'

    def __str__(self):
        return f"QR Code {self.uuid} - {self.envelope.title}"

class NotificationPreference(models.Model):
    """Paramètres de notification par utilisateur"""
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notification_preferences",
    )
    email = models.BooleanField(default=True)
    sms = models.BooleanField(default=False)
    push = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Notifications for {self.user.username}"


class AuditLog(models.Model):
    """Simple audit trail for user actions."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    envelope = models.ForeignKey(
        'Envelope',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    action = models.CharField(max_length=255)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.action} by {self.user} on {self.created_at}"