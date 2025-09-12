from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes
from django.conf import settings
from django.db import transaction
from rest_framework.reverse import reverse
from .email_utils import EmailTemplates
from .models import (SavedSignature, FieldTemplate, BatchSignJob, BatchSignItem,
    Envelope,EnvelopeRecipient,SigningField,SignatureDocument,PrintQRCode,
    NotificationPreference,EnvelopeDocument,
)

from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from PyPDF2 import PdfReader
import io
import logging
from django.contrib.auth.password_validation import validate_password

logger = logging.getLogger(__name__)
User = get_user_model()


# -------- Users / Prefs --------

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'username', 'email', 'first_name', 'last_name',
            'birth_date', 'phone_number', 'gender', 'address', 'avatar'
        ]
        read_only_fields = ['username', 'email']


class UserRegistrationSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    avatar = serializers.ImageField(required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'first_name', 'last_name',
            'birth_date', 'phone_number', 'gender', 'address', 'avatar'
        ]

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur est déjà pris.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('Cet e-mail est déjà utilisé.')
        return value

    def create(self, validated_data):
        avatar = validated_data.pop('avatar', None)
        user = User.objects.create_user(
            username=validated_data.get('username'),
            email=validated_data.get('email'),
            password=validated_data.get('password'),
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            birth_date=validated_data.get('birth_date'),
            phone_number=validated_data.get('phone_number', ''),
            gender=validated_data.get('gender', ''),
            address=validated_data.get('address', ''),
            is_active=False,
        )
        if avatar:
            user.avatar = avatar
            user.save()
        NotificationPreference.objects.create(user=user)
        return user


# serializers.py

class PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()

    
    def save(self):
        request = self.context.get('request')
        email = self.validated_data['email']

        # Silencieux si compte inexistant/inactif
        user = User.objects.filter(email=email, is_active=True).first()
        if not user:
            return

        uidb64 = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)

        # Lien vers le FRONT
        base = getattr(settings, 'FRONT_BASE_URL', '').rstrip('/')
        reset_link = f"{base}/reset-password/{uidb64}/{token}/"

        # Envoi d'email (try/except pour ne rien révéler en cas d'erreur)
        try:
            EmailTemplates.password_reset_email(user, reset_link)
        except Exception as e:
            logger.error(
                f"Erreur envoi email de réinitialisation pour {email}: {e}",
                exc_info=True,
            )
            raise serializers.ValidationError(
                "Erreur lors de l'envoi de l'email de réinitialisation."
            )



# serializers.py - Section ChangePasswordSerializer corrigée

class ChangePasswordSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        validate_password(value)  # applique les validators Django
        return value

    def validate(self, attrs):
        uid = attrs.get('uid')
        token = attrs.get('token')
        
        try:
            # Décoder l'UID base64
            uid_decoded = urlsafe_base64_decode(uid)
            uid_str = force_str(uid_decoded)  # Convertir en string
            
            # Récupérer l'utilisateur
            self.user = User.objects.get(pk=uid_str)
            
        except (TypeError, ValueError, OverflowError, User.DoesNotExist) as e:
            # Log pour debugging
            logger.error(f"Erreur décodage UID '{uid}': {str(e)}")
            raise serializers.ValidationError({'uid': 'Lien invalide.'})

        # Vérifier le token
        if not default_token_generator.check_token(self.user, token):
            logger.error(f"Token invalide pour user {self.user.id}: {token}")
            raise serializers.ValidationError({'token': 'Lien invalide ou expiré.'})
            
        return attrs

    def save(self, **kwargs):
        password = self.validated_data['password']
        self.user.set_password(password)
        self.user.save()
        return self.user

class NotificationPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationPreference
        fields = ['id', 'email', 'sms', 'push']


# -------- Signature fields / documents --------

class SigningFieldSerializer(serializers.ModelSerializer):
    """
    Ajout de document_id pour lier un champ à un PDF précis de l’enveloppe.
    recipient_id continue d’indiquer l’ordre/ID logique côté front.
    """
    recipient_id = serializers.IntegerField()
    document_id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = SigningField
        fields = [
            'id',
            'recipient_id',
            'document_id',
            'field_type',
            'page',
            'position',
            'name',
            'required',
            'default_value',
        ]

    def validate_position(self, value):
        required_keys = {'x', 'y', 'width', 'height'}
        if not isinstance(value, dict) or not required_keys.issubset(value.keys()):
            raise serializers.ValidationError('position doit contenir x, y, width, height')
        # bornes simples (>=0)
        for k in ['x', 'y', 'width', 'height']:
            try:
                if float(value[k]) < 0:
                    raise serializers.ValidationError(f'position.{k} doit être >= 0')
            except Exception:
                raise serializers.ValidationError(f'position.{k} invalide')
        return value

    def validate_page(self, value):
        if value <= 0:
            raise serializers.ValidationError('page doit être >= 1')
        return value


class EnvelopeDocumentSerializer(serializers.ModelSerializer):
    file_url = serializers.URLField(source='file.url', read_only=True)
    file = serializers.FileField(write_only=True)

    class Meta:
        model = EnvelopeDocument
        fields = ['id', 'file', 'file_url', 'name', 'file_type', 'file_size', 'hash_original', 'version']
        read_only_fields = ['file_url', 'file_type', 'file_size', 'hash_original', 'version', 'name']


class EnvelopeRecipientSerializer(serializers.ModelSerializer):
    class Meta:
        model = EnvelopeRecipient
        fields = [
            'id',
            'email',
            'full_name',
            'order',
            'signed',
            'signed_at',
            'notified_at',
            'reminder_count',
            'in_app_notified',
        ]
        read_only_fields = ['signed', 'signed_at', 'notified_at', 'reminder_count', 'in_app_notified']


# -------- Envelope --------

class EnvelopeSerializer(serializers.ModelSerializer):
    recipients = EnvelopeRecipientSerializer(many=True, required=False)
    fields = SigningFieldSerializer(many=True, required=False)
    # upload multi-fichiers
    files = serializers.ListField(child=serializers.FileField(), write_only=True, required=False)
    # liste des documents déjà stockés
    documents = EnvelopeDocumentSerializer(many=True, read_only=True)
    created_by_name = serializers.SerializerMethodField()
    completion_rate = serializers.ReadOnlyField()

    class Meta:
        model = Envelope
        fields = [
            'id',
            'title',
            'include_qr_code',
            'description',
            'files',
            'documents',
            'created_by',
            'created_by_name',
            'created_at',
            'updated_at',
            'status',
            'flow_type',
            'recipients',
            'fields',
            'reminder_days',
            'deadline_at',
            'hash_original',
            'version',
            'file_size',
            'file_type',
            'completion_rate',
            'jwt_token',
            'expires_at',
        ]
        read_only_fields = [
            'hash_original',
            'version',
            'created_by',
            'created_at',
            'updated_at',
            'file_size',
            'file_type',
            'completion_rate',
        ]

    def get_created_by_name(self, obj):
        name = obj.created_by.get_full_name().strip()
        return name or obj.created_by.username

    # -------- utilitaires internes --------

    def _resolve_recipient_for_field(self, envelope, field_payload, recipients_by_order):
        """
        Le front envoie recipient_id comme 'ordre' (ou parfois l'id réel).
        On résout prudemment.
        """
        # priorité à un id réel s’il existe
        real_id = field_payload.get('recipient_real_id')
        if real_id:
            try:
                return envelope.recipients.get(id=real_id)
            except EnvelopeRecipient.DoesNotExist:
                pass

        order = field_payload.pop('recipient_id', None)
        if order is None:
            return None
        # map rempli à la création/màj
        return recipients_by_order.get(order)

    def _resolve_document_for_field(self, envelope, field_payload):
        """
        document_id optionnel : si fourni, vérifier qu’il appartient à l’enveloppe.
        """
        doc_id = field_payload.pop('document_id', None)
        if not doc_id:
            return None
        try:
            return envelope.documents.get(id=doc_id)
        except EnvelopeDocument.DoesNotExist:
            raise serializers.ValidationError(f'document_id {doc_id} n’appartient pas à cette enveloppe')

    def _validate_page_against_pdf(self, document, page_number):
        """
        (optionnel mais utile) : si PDF, vérifier que la page demandée existe.
        On ne bloque pas si ce n’est pas un PDF ou si la lecture échoue.
        """
        if not document or not document.file or not document.file.name.lower().endswith('.pdf'):
            return
        try:
            document.file.seek(0)
            content = document.file.read()
            document.file.seek(0)
            if not content.startswith(b'%PDF-'):
                return
            pdf = PdfReader(io.BytesIO(content))
            if page_number < 1 or page_number > len(pdf.pages):
                raise serializers.ValidationError(f'page {page_number} hors limites (1..{len(pdf.pages)}) pour le document {document.id}')
        except Exception:
            # logging seulement ; on évite de bloquer agressivement si l’IO échoue
            logger.warning('Impossible de valider la page PDF pour document %s', getattr(document, 'id', '?'))

    # -------- create / update --------

    def create(self, validated_data):
        recipients_data = validated_data.pop('recipients', [])
        fields_data = validated_data.pop('fields', [])
        files_data = validated_data.pop('files', [])
        user = self.context['request'].user
        validated_data['created_by'] = user

        with transaction.atomic():
            envelope = Envelope.objects.create(**validated_data)

            # --- destinataires ---
            recipients_by_order = {}
            for rec in recipients_data:
                email = (rec.get('email') or '').strip().lower()
                try:
                    usr = User.objects.get(email=email)
                    rec['user'] = usr
                    rec.setdefault('full_name', usr.get_full_name())
                except (User.DoesNotExist, ValueError):
                    pass
                obj = EnvelopeRecipient.objects.create(envelope=envelope, **rec)
                recipients_by_order[obj.order] = obj

            # --- documents (multiple) ---
            for f in files_data:
                EnvelopeDocument.objects.create(envelope=envelope, file=f)

            # mapping doc id accessible après création
            # (si le front renvoie des document_id déjà existants, ils seront résolus ci-dessous)
            # --- champs ---
            for fld in fields_data:
                # résout destinataire
                recipient = self._resolve_recipient_for_field(envelope, fld, recipients_by_order)
                if not recipient:
                    # on ignore les champs orphelins
                    logger.warning('Champ ignoré (destinataire introuvable): %s', fld)
                    continue

                # résout document
                document = self._resolve_document_for_field(envelope, fld)

                # validation page/document
                self._validate_page_against_pdf(document, fld.get('page', 1))

                SigningField.objects.create(
                    envelope=envelope,
                    recipient=recipient,
                    document=document,  # <-- nouveau lien
                    **fld
                )

            return envelope

    def update(self, instance, validated_data):
        recipients_data = validated_data.pop('recipients', None)
        fields_data = validated_data.pop('fields', None)
        files_data = validated_data.pop('files', [])

        # champs simples de l’enveloppe
        for attr, val in validated_data.items():
            setattr(instance, attr, val)
        instance.save()

        # --- nouveaux documents (append only ici) ---
        if files_data:
            for f in files_data:
                EnvelopeDocument.objects.create(envelope=instance, file=f)

        # --- upsert destinataires ---
        if recipients_data is not None:
            existing_recipients = {r.id: r for r in instance.recipients.all()}
            provided_ids = []
            recipients_by_order = {}

            with transaction.atomic():
                for rec in recipients_data:
                    # enrichissement auto si email correspond à un user
                    if not rec.get('id'):
                        email = (rec.get('email') or '').strip().lower()
                        try:
                            usr = User.objects.get(email=email)
                            rec['user'] = usr
                            rec.setdefault('full_name', usr.get_full_name())
                        except (User.DoesNotExist, ValueError):
                            pass

                    rec_id = rec.get('id')
                    if rec_id and rec_id in existing_recipients:
                        obj = existing_recipients[rec_id]
                        for k, v in rec.items():
                            setattr(obj, k, v)
                        obj.save()
                        provided_ids.append(rec_id)
                        recipients_by_order[obj.order] = obj
                    else:
                        obj = EnvelopeRecipient.objects.create(envelope=instance, **rec)
                        provided_ids.append(obj.id)
                        recipients_by_order[obj.order] = obj

                # suppression des destinataires non fournis
                for rid, obj in existing_recipients.items():
                    if rid not in provided_ids:
                        obj.delete()

        # --- upsert champs ---
        if fields_data is not None:
            existing_fields = {f.id: f for f in instance.fields.all()}
            provided_field_ids = []
            # carte d'ordre -> recipient (si la section recipients n’a pas été renvoyée)
            if recipients_data is None:
                recipients_by_order = {r.order: r for r in instance.recipients.all()}

            with transaction.atomic():
                for fld in fields_data:
                    field_id = fld.get('id')

                    # résout destinataire
                    recipient = self._resolve_recipient_for_field(instance, fld, recipients_by_order)
                    if not recipient:
                        logger.warning('Champ ignoré (destinataire introuvable) en update: %s', fld)
                        continue

                    # résout document (peut être None)
                    document = self._resolve_document_for_field(instance, fld)

                    # validation page/document
                    self._validate_page_against_pdf(document, fld.get('page', 1))

                    if field_id and field_id in existing_fields:
                        obj = existing_fields[field_id]
                        # appliquer payload restant
                        updatable = {k: v for k, v in fld.items() if k not in ('recipient_id', 'recipient_real_id')}
                        for k, v in updatable.items():
                            setattr(obj, k, v)
                        obj.recipient = recipient
                        obj.document = document
                        obj.save()
                        provided_field_ids.append(field_id)
                    else:
                        obj = SigningField.objects.create(
                            envelope=instance,
                            recipient=recipient,
                            document=document,
                            **fld
                        )
                        provided_field_ids.append(obj.id)

                # suppression des champs non fournis
                for fid, obj in existing_fields.items():
                    if fid not in provided_field_ids:
                        obj.delete()

        return instance




class SavedSignatureSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(write_only=True, required=False, allow_null=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = SavedSignature
        fields = ["id", "kind", "image", "image_url", "data_url", "created_at"]

    def get_image_url(self, obj):
        request = self.context.get("request")
        if obj.image and request:
            # basename défini dans le router: 'saved-signatures'
            # -> nom de route = 'saved-signatures-image'
            return reverse("saved-signatures-image", args=[obj.pk], request=request)
        return None

class FieldTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldTemplate
        fields = ["id", "name", "page", "x", "y", "width", "height", "anchor", "offset_x", "offset_y", "created_at"]

class BatchSignItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = BatchSignItem
        fields = ["id", "status", "error", "signed_file", "placements", "envelope_document"]

class BatchSignJobSerializer(serializers.ModelSerializer):
    items = BatchSignItemSerializer(many=True, read_only=True)
    class Meta:
        model = BatchSignJob
        fields = ["id", "mode", "status", "total", "done", "failed", "started_at", "finished_at", "result_zip", "created_at", "items"]
class EnvelopeListSerializer(serializers.ModelSerializer):
    recipients_count = serializers.IntegerField(source='recipients.count', read_only=True)
    completion_rate = serializers.ReadOnlyField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Envelope
        fields = [
            'id',
            'title',
            'status',
            'created_by',
            'created_by_name',
            'created_at',
            'deadline_at',
            'recipients_count',
            'completion_rate',
            'flow_type',
        ]

    def get_created_by_name(self, obj):
        name = obj.created_by.get_full_name().strip()
        return name or obj.created_by.username


class SignatureDocumentSerializer(serializers.ModelSerializer):
    recipient_name = serializers.CharField(source='recipient.full_name', read_only=True)

    class Meta:
        model = SignatureDocument
        fields = [
            'id',
            'envelope',
            'recipient',
            'recipient_name',
            'signer',
            'is_guest',
            'signature_data',
            'signed_fields',
            'signed_file',
            'signed_at',
            'ip_address',
            'user_agent',
            'certificate_data',
        ]
        read_only_fields = ['signed_at', 'ip_address', 'user_agent', 'certificate_data']


class PrintQRCodeSerializer(serializers.ModelSerializer):
    envelope_title = serializers.CharField(source='envelope.title', read_only=True)
    is_valid = serializers.ReadOnlyField()

    class Meta:
        model = PrintQRCode
        fields = [
            'uuid',
            'envelope',
            'envelope_title',
            'qr_type',
            'state',
            'created_at',
            'is_valid',
        ]
        read_only_fields = ['uuid', 'hmac', 'state', 'created_at']
